"use strict";

/**
 * worker/server.js
 *
 * Thin HTTP API so the frontend can request trade opens and closes through
 * the worker instead of writing directly to Base44/Supabase. This gives the
 * worker control over entry/exit prices (always from the authoritative worker
 * feed) and ensures every event lands in account_ledger.
 *
 * Endpoints:
 *   POST /trade/open    — open a market or trailing order
 *   POST /trade/close   — manually close an open position
 *   POST /order/create  — queue a limit or stop-limit order
 *   POST /order/cancel  — cancel a pending limit / stop-limit order
 *   POST /trade/margin  — add or reduce margin on an open position
 *   POST /trade/sltp    — update stop loss / take profit on an open position
 *
 * Auth: EIP-191 wallet signature. The frontend signs a short-lived message
 * with the trader's connected wallet; the worker recovers the signer address
 * and checks it matches the trader_address on the challenge account. No
 * shared secret is ever sent to the browser.
 */

const http = require("http");
const candles = require("./candles");
const {
  workerCreateTrade,
  workerUpdateTrade,
} = require("./base44Bridge");
const { persistCloseBalance } = require("./executors");
const { insertLedgerRow } = require("./ledgerSig");
const community = require("./community");
const communityAuth = require("./communityAuth");
const notifications = require("./notifications");
const xbot = require("./xbot");
const adminWallet = require("./adminWallet");
const adminReview = require("./adminReview");
const reviews = require("./reviews");
const claim = require("./claim");
const claimFinalize = require("./claimFinalize");

async function verifyApiSecret({ api_secret, acct, base44 }) {
  if (!api_secret) return { ok: false, error: "Missing api_secret" };

  // The Supabase mirror occasionally lacks api_secret — typically because an
  // anon-key write was blocked by RLS, or the row predates the api_secret
  // feature. Base44 is the source of truth, so on a cache miss for the
  // secret, refresh once from Base44 and patch the cached object so future
  // calls don't repeat the round trip.
  //
  // Records in the wild can have id != account_id (manually-recovered
  // accounts, accounts created before/after various id-handling rules).
  // Try both keys against Base44 — first match with an api_secret wins.
  if (!acct.api_secret && base44) {
    const tryLookup = async (filter) => {
      try {
        const m = await base44.entities.ChallengeAccount.filter(filter);
        const row = Array.isArray(m) ? m[0] : null;
        return row?.api_secret ? row : null;
      } catch { return null; }
    };
    let fresh = null;
    if (acct.account_id) fresh = await tryLookup({ account_id: acct.account_id });
    if (!fresh && acct.id) fresh = await tryLookup({ id: acct.id });
    if (fresh?.api_secret) acct.api_secret = fresh.api_secret;
  }

  if (!acct.api_secret) return { ok: false, error: "Account has no api_secret — contact support" };
  if (api_secret !== acct.api_secret) return { ok: false, error: "Invalid api_secret" };
  return { ok: true };
}

// Returned by every leader-only endpoint when this machine isn't the leader.
// If we know who the leader is and it's not us, emit a fly-replay header so
// Fly's edge proxy transparently re-routes the request to the right machine.
// Otherwise (no current leader, e.g. mid-failover), return 503 so the client
// can retry.
function notLeaderResponse(leader) {
  const leaderId = leader.currentLeaderId;
  if (leaderId && leaderId !== leader.id) {
    return {
      status: 503,
      body: { error: "Forwarding to leader" },
      headers: { "fly-replay": `instance=${leaderId}` },
    };
  }
  return { status: 503, body: { error: "Not the active leader — retry shortly" } };
}

// Historical OHLC lives here rather than in a Vercel function: binance.com
// refuses US IPs (where Vercel runs) and the eToro credentials belong on one
// server. Cached upstream in candles.js, plus a short browser/CDN cache here.
function sendJson(res, status, body, maxAge = 0) {
  res.setHeader("Content-Type", "application/json");
  if (maxAge > 0) res.setHeader("Cache-Control", `public, max-age=${maxAge}, stale-while-revalidate=60`);
  res.writeHead(status);
  res.end(JSON.stringify(body));
}

/** GET /candles?symbol=BTCUSDT&interval=1m&limit=500 */
async function handleCandles({ res, url }) {
  const symbol = url.searchParams.get("symbol");
  const interval = url.searchParams.get("interval") || "1m";
  const limit = Math.min(Number(url.searchParams.get("limit")) || 500, 1000);
  const endTime = Number(url.searchParams.get("endTime")) || null;
  if (!symbol) return sendJson(res, 400, { error: "symbol is required" });

  try {
    const rows = await candles.getCandles(symbol, interval, limit, endTime);
    return sendJson(res, 200, { symbol, interval, candles: rows }, 5);
  } catch (err) {
    console.warn(`[candles] ${symbol} ${interval}: ${err.message}`);
    return sendJson(res, 502, { error: err.message });
  }
}

/** GET /stats24h?symbol=EUR/USD — rolling 24h open/high/low. */
async function handle24hStats({ res, url }) {
  const symbol = url.searchParams.get("symbol");
  if (!symbol) return sendJson(res, 400, { error: "symbol is required" });

  try {
    const stats = await candles.get24hStats(symbol);
    if (!stats) return sendJson(res, 404, { error: "no history" });
    return sendJson(res, 200, { symbol, ...stats }, 30);
  } catch (err) {
    console.warn(`[stats24h] ${symbol}: ${err.message}`);
    return sendJson(res, 502, { error: err.message });
  }
}

/** GET /daily-opens?symbols=A,B,C — batched UTC daily opens for % change. */
async function handleDailyOpens({ res, url }) {
  const raw = url.searchParams.get("symbols") || "";
  const symbols = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (!symbols.length) return sendJson(res, 400, { error: "symbols is required" });

  try {
    return sendJson(res, 200, { opens: await candles.getDailyOpens(symbols) }, 300);
  } catch (err) {
    console.warn(`[daily-opens] ${err.message}`);
    return sendJson(res, 502, { error: err.message });
  }
}

/**
 * GET /prices/stream[?symbols=BTCUSDT,EUR/USD]
 *
 * Server-Sent Events carrying live quotes. Omitting `symbols` subscribes to
 * everything the worker holds. The first frame is a full snapshot so a client
 * paints immediately instead of waiting for the next tick.
 *
 * Frames:
 *   { "snapshot": { "<symbol>": { price, conf, publishTimeMs, receivedMs } } }
 *   { "quotes":   { "<symbol>": { … } } }   // only symbols that changed
 *   ": ping"                                 // heartbeat comment
 */
function handlePriceStream({ req, res, url, state }) {
  const prices = state?.prices;
  if (!prices) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Price stream unavailable" }));
    return;
  }

  const raw = url.searchParams.get("symbols");
  const symbols = raw
    ? new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))
    : null;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Proxies that buffer would defeat the point of streaming.
    "X-Accel-Buffering": "no",
  });

  // A null payload is the heartbeat: an SSE comment, ignored by EventSource.
  const send = (payload) => {
    if (res.writableEnded) return;
    res.write(payload === null ? ": ping\n\n" : `data: ${JSON.stringify(payload)}\n\n`);
  };

  const unsubscribe = prices.addSubscriber({ symbols, send });
  if (!unsubscribe) {
    // At capacity — say so rather than holding a socket open that never streams.
    res.write(`data: ${JSON.stringify({ error: "capacity" })}\n\n`);
    res.end();
    return;
  }

  send({ snapshot: prices.snapshot(symbols) });

  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    unsubscribe();
    if (!res.writableEnded) res.end();
  };

  req.on("close", cleanup);
  req.on("error", cleanup);
  res.on("error", cleanup);
}

function startServer({ supabase, base44, state }) {
  const PORT = parseInt(process.env.WORKER_API_PORT || "3001", 10);

  const server = http.createServer((req, res) => {
    const origin = process.env.WORKER_CORS_ORIGIN || "*";
    res.setHeader("Access-Control-Allow-Origin",  origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Live price stream — the only GET route. Every trader reads prices from
    // here rather than connecting to an exchange themselves.
    if (req.method === "GET") {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (url.pathname === "/prices/stream") return handlePriceStream({ req, res, url, state });
      if (url.pathname === "/candles")       return handleCandles({ res, url });
      if (url.pathname === "/stats24h")      return handle24hStats({ res, url });
      if (url.pathname === "/daily-opens")   return handleDailyOpens({ res, url });

      res.writeHead(404);
      res.end();
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }

    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", async () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }

      try {
        let result;
        if (req.url === "/trade/open") {
          result = await handleTradeOpen({ payload, supabase, base44, state });
        } else if (req.url === "/trade/close") {
          result = await handleTradeClose({ payload, supabase, base44, state });
        } else if (req.url === "/order/create") {
          result = await handleOrderCreate({ payload, supabase, base44, state });
        } else if (req.url === "/order/cancel") {
          result = await handleOrderCancel({ payload, supabase, base44, state });
        } else if (req.url === "/trade/margin") {
          result = await handleTradeMargin({ payload, supabase, base44, state });
        } else if (req.url === "/trade/sltp") {
          result = await handleTradeSlTp({ payload, supabase, base44, state });
        } else if (req.url === "/community/auth/challenge") {
          result = await communityAuth.handleAuthChallenge({ payload });
        } else if (req.url === "/community/auth/login") {
          result = await communityAuth.handleAuthLogin({ payload });
        } else if (req.url === "/community/auth/refresh") {
          result = await communityAuth.handleAuthRefresh({ payload });
        } else if (req.url === "/community/channels") {
          result = await community.handleCommunityChannels({ supabase });
        } else if (req.url === "/community/messages") {
          result = await community.handleCommunityMessagesGet({ payload, supabase });
        } else if (req.url === "/community/post") {
          result = await community.handleCommunityPost({ payload, supabase });
        } else if (req.url === "/community/read") {
          result = await community.handleCommunityRead({ payload, supabase });
        } else if (req.url === "/community/profile") {
          result = await community.handleCommunityProfileGet({ payload, supabase });
        } else if (req.url === "/community/profile/stats") {
          result = await community.handleCommunityProfileStats({ payload, supabase });
        } else if (req.url === "/community/profiles/batch") {
          result = await community.handleCommunityProfilesBatch({ payload, supabase });
        } else if (req.url === "/community/stats") {
          result = await community.handleCommunityStats({ supabase, base44 });
        } else if (req.url === "/community/profile/update") {
          result = await community.handleCommunityProfileUpdate({ payload, supabase });
        } else if (req.url === "/community/react") {
          result = await community.handleCommunityReact({ payload, supabase });
        } else if (req.url === "/community/handles") {
          result = await community.handleCommunityHandlesSearch({ payload, supabase });
        } else if (req.url === "/community/share-trade") {
          result = await community.handleCommunityShareTrade({ payload, supabase });
        } else if (req.url === "/community/flag") {
          result = await community.handleCommunityFlag({ payload, supabase });
        } else if (req.url === "/community/delete") {
          result = await community.handleCommunityDelete({ payload, supabase });
        } else if (req.url === "/community/pin") {
          result = await community.handleCommunityPin({ payload, supabase });
        } else if (req.url === "/community/pinned") {
          result = await community.handleCommunityListPinned({ payload, supabase });
        } else if (req.url === "/community/mute") {
          result = await community.handleCommunityMute({ payload, supabase });
        } else if (req.url === "/community/ban") {
          result = await community.handleCommunityBan({ payload, supabase });
        } else if (req.url === "/community/mod/queue") {
          result = await community.handleCommunityModQueue({ payload, supabase });
        } else if (req.url === "/community/mod/resolve-flag") {
          result = await community.handleCommunityResolveFlag({ payload, supabase });
        } else if (req.url === "/community/moderators") {
          result = await community.handleCommunityModeratorList({ payload, supabase });
        } else if (req.url === "/community/moderators/add") {
          result = await community.handleCommunityModeratorAdd({ payload, supabase });
        } else if (req.url === "/community/moderators/remove") {
          result = await community.handleCommunityModeratorRemove({ payload, supabase });
        } else if (req.url === "/community/mod/system") {
          result = await community.handleCommunityModSystem({ payload, supabase });
        } else if (req.url === "/community/accept-terms") {
          result = await community.handleCommunityAcceptTerms({ payload, supabase });
        } else if (req.url === "/notifications/list") {
          result = await notifications.handleNotificationsList({ payload, supabase });
        } else if (req.url === "/notifications/mark-read") {
          result = await notifications.handleNotificationMarkRead({ payload, supabase });
        } else if (req.url === "/notifications/mark-all-read") {
          result = await notifications.handleNotificationMarkAllRead({ payload, supabase });
        } else if (req.url === "/xbot/list") {
          result = await xbot.handleXBotList({ payload, supabase });
        } else if (req.url === "/xbot/image") {
          result = await xbot.handleXBotImage({ payload, supabase });
        } else if (req.url === "/xbot/approve") {
          result = await xbot.handleXBotApprove({ payload, supabase });
        } else if (req.url === "/xbot/reject") {
          result = await xbot.handleXBotReject({ payload, supabase });
        } else if (req.url === "/admin/resolve-wallet") {
          result = await adminWallet.handleResolveWallet({ payload });
        } else if (req.url === "/admin/review-account") {
          result = await adminReview.handleReviewAccount({ payload, base44, supabase });
        } else if (req.url === "/reviews/submit") {
          result = await reviews.handleReviewSubmit({ payload, supabase });
        } else if (req.url === "/reviews/list") {
          result = await reviews.handleReviewList({ payload, supabase });
        } else if (req.url === "/reviews/flag") {
          result = await reviews.handleReviewFlag({ payload, supabase });
        } else if (req.url === "/admin/reviews/feature") {
          result = await reviews.handleReviewFeature({ payload, supabase });
        } else if (req.url === "/admin/reviews/hide") {
          result = await reviews.handleReviewHide({ payload, supabase });
        } else if (req.url === "/admin/reviews/queue") {
          result = await reviews.handleReviewQueue({ payload, supabase });
        } else if (req.url === "/claim/phase2-proof") {
          result = await claim.handlePhase2Proof({ payload, supabase, base44, state });
        } else if (req.url === "/claim/funded-proof") {
          result = await claim.handleFundedProof({ payload, supabase, base44, state });
        } else if (req.url === "/claim/payout-proof") {
          result = await claim.handlePayoutProof({ payload, supabase, base44, state });
        } else if (req.url === "/claim/post-payout-proof") {
          result = await claim.handlePostPayoutProof({ payload, supabase, base44, state });
        } else if (req.url === "/claim/finalize") {
          result = await claimFinalize.handleFinalize({ payload, supabase, base44, state });
        } else if (req.url === "/zone/config" || req.url === "/turbo/config") {
          result = handleZoneConfig({ payload, state });
        } else if (req.url === "/zone/bet" || req.url === "/turbo/bet") {
          result = await handleZoneBet({ payload, supabase, base44, state });
        } else if (req.url === "/zone/exit" || req.url === "/turbo/exit") {
          result = await handleZoneExit({ payload, supabase, base44, state });
        } else if (req.url === "/zone/history" || req.url === "/turbo/history") {
          result = await handleZoneHistory({ payload, supabase, base44, state });
        } else {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(result.status, {
          "Content-Type": "application/json",
          ...(result.headers || {}),
        });
        res.end(JSON.stringify(result.body));
      } catch (err) {
        console.error("[server] Unhandled error:", err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    });
  });

  server.listen(PORT, () => console.log(`[server] Worker API listening on :${PORT}`));
  return server;
}

// ── Cache hydration helpers ───────────────────────────────────────────────────
// The in-memory cache is fed by (a) startup load and (b) Supabase realtime
// postgres_changes. If realtime drops between trade-open and trade-close, the
// trade ends up in Supabase but never lands in the cache, and every action on
// that trade (close / margin / sl-tp / cancel) returns 404 even though the row
// exists. These helpers fall back to a direct Supabase fetch on cache miss
// and hydrate the cache so subsequent calls don't have to redo the work.

async function findOpenTradeOrHydrate(supabase, state, trade_id) {
  const { getOpenTrades, addTradeToCache } = state;
  const cached = getOpenTrades().find((t) => t.id === trade_id);
  if (cached) return cached;
  const { data } = await supabase
    .from("trades")
    .select("*")
    .eq("id", trade_id)
    .maybeSingle();
  if (!data || data.status !== "open") return null;
  if (typeof addTradeToCache === "function") {
    addTradeToCache(data);
    console.warn(`[server] cache miss on trade ${trade_id} — hydrated from Supabase`);
  }
  return data;
}

async function findPendingOrderOrHydrate(supabase, state, order_id) {
  const { getPendingOrders, addTradeToCache } = state;
  const cached = (getPendingOrders?.() || []).find((o) => o.id === order_id);
  if (cached) return cached;
  const { data } = await supabase
    .from("trades")
    .select("*")
    .eq("id", order_id)
    .maybeSingle();
  if (!data || data.status !== "pending") return null;
  if (typeof addTradeToCache === "function") {
    addTradeToCache(data);
    console.warn(`[server] cache miss on order ${order_id} — hydrated from Supabase`);
  }
  return data;
}

// ── POST /trade/open ──────────────────────────────────────────────────────────

async function handleTradeOpen({ payload, supabase, base44, state }) {
  const { leader, accountCache, getOpenTrades, getPendingOrders, getFreshPrice } = state;

  if (!leader.isLeader) {
    return notLeaderResponse(leader);
  }

  const { account_id, symbol, direction, size, leverage,
          order_type, sl, tp, trailing_rate, reduce_only } = payload;

  if (!account_id || !symbol || !direction || !size || !leverage) {
    return { status: 400, body: { error: "Missing required fields: account_id, symbol, direction, size, leverage" } };
  }
  if (!["long", "short"].includes(direction)) {
    return { status: 400, body: { error: "direction must be 'long' or 'short'" } };
  }
  if (size <= 0 || leverage <= 0) {
    return { status: 400, body: { error: "size and leverage must be positive" } };
  }

  const acct = accountCache.get(account_id);
  if (!acct) {
    return { status: 404, body: { error: "Account not found or not active" } };
  }
  if (acct.phase === "failed" || acct.phase === "paid_out") {
    return { status: 400, body: { error: `Account phase is '${acct.phase}'` } };
  }

  const authCheck = await verifyApiSecret({ api_secret: payload.api_secret, acct, base44 });
  if (!authCheck.ok) {
    return { status: 401, body: { error: authCheck.error } };
  }

  // Use the worker's authoritative feed price — never trust the client-submitted
  // price — and refuse to fill on a STALE/uncertain price. A market fill on a
  // lagging cache lets a trader capture the gap (feed-lag arbitrage); the guard
  // rejects entries when the feed is stale or the bid/ask spread is wide.
  const entryFill = getFreshPrice(symbol);
  if (entryFill.price == null) {
    return { status: 503, body: { error: `No price available for ${symbol} — try again shortly` } };
  }
  if (!entryFill.fresh) {
    console.warn(`[server] OPEN rejected — stale price ${symbol} (${entryFill.reason}) acct=${account_id}`);
    return { status: 503, body: { error: `Price feed for ${symbol} is momentarily stale — please try again`, code: "price_stale" } };
  }
  const entryPrice = entryFill.price;

  // Reserve margin against open positions AND pending limit orders — otherwise
  // a trader could queue unlimited limit orders that all become valid on fill.
  const marginOf = (t) => (t.leverage > 0 ? t.size / t.leverage : t.size);
  const marginInUse =
    getOpenTrades().filter(t => t.account_id === account_id && t.status === "open")
      .reduce((sum, t) => sum + marginOf(t), 0) +
    (getPendingOrders?.() || []).filter(t => t.account_id === account_id && t.status === "pending")
      .reduce((sum, t) => sum + marginOf(t), 0);
  const zoneReserved = state.zone ? state.zone.reservedFor(acct.account_id || acct.id) : 0;
  const available      = (acct.current_balance ?? 0) - marginInUse - zoneReserved;
  const marginRequired = leverage > 0 ? size / leverage : size;
  if (marginRequired > available) {
    return {
      status: 400,
      body: { error: `Insufficient margin — available: $${available.toFixed(2)}, required: $${marginRequired.toFixed(2)}` },
    };
  }

  const now = new Date().toISOString();
  const tradeData = {
    account_id,
    trader_address: acct.trader_address || "",
    symbol,
    direction,
    entry_price:  entryPrice,
    size,
    leverage,
    status:       "open",
    open_time:    now,
    order_type:   order_type || "market",
    ...(reduce_only   && { reduce_only: true }),
    ...(sl            && { sl }),
    ...(tp            && { tp }),
    ...(trailing_rate && { trailing_rate }),
  };

  // Create in Base44 first — it generates the authoritative trade id
  const created = await workerCreateTrade(base44, tradeData);
  if (!created?.id) throw new Error("Base44 trade creation returned no id");

  // Mirror to Supabase so the realtime subscription and worker cache stay in sync
  await supabase.from("trades").upsert({ ...tradeData, id: created.id }, { onConflict: "id" }).throwOnError();

  // Ledger — opening a position reserves margin but doesn't change realised balance
  const { error: ledgerErr } = await insertLedgerRow(supabase,{
    event_type:     "trade_open",
    account_id,
    trader_address: acct.trader_address || "",
    trade_id:       created.id,
    symbol,
    direction,
    size_usdc:      size,
    leverage,
    entry_price:    entryPrice,
    opened_at:      now,
    balance_before: acct.current_balance ?? null,
    balance_after:  acct.current_balance ?? 0,
  });
  if (ledgerErr) console.error("[server] trade_open ledger insert failed:", ledgerErr.message);

  console.log(`[server] Trade opened: ${symbol} ${direction} $${size} @ $${entryPrice} acct=${account_id}`);
  return { status: 201, body: created };
}

// Realise a partial close: book `closedNotional` of an open position at
// `livePrice` as its own closed child trade (so the derived balance includes it
// like any close), shrink the parent, and write the ledger entry. Shared by the
// Close-% flow (/trade/close with a fraction) and the margin Reduce path so
// there is a single realisation code path. order_type "reduce" tags the child
// as a scale-out (the community big-trades feed skips these).
async function realisePartialClose({ supabase, base44, acct, trade, account_id, closedNotional, livePrice, now, reason }) {
  const lev         = trade.leverage || 1;
  const isLong      = trade.direction === "long";
  const movePct     = (livePrice - trade.entry_price) / trade.entry_price;
  const pnl         = (isLong ? 1 : -1) * movePct * closedNotional;
  const chunkMargin = lev > 0 ? closedNotional / lev : closedNotional;
  const pnl_pct     = chunkMargin > 0 ? (pnl / chunkMargin) * 100 : 0;
  const newSize     = trade.size - closedNotional;
  const balanceBefore = acct.current_balance ?? null;

  const childData = {
    account_id,
    trader_address: acct.trader_address || "",
    symbol:      trade.symbol,
    direction:   trade.direction,
    entry_price: trade.entry_price,
    exit_price:  livePrice,
    size:        closedNotional,
    leverage:    lev,
    pnl,
    pnl_pct,
    status:      "closed",
    open_time:   trade.open_time,
    close_time:  now,
    order_type:  "reduce",
  };
  const child = await workerCreateTrade(base44, childData);
  if (!child?.id) throw new Error("Base44 child-trade creation returned no id");
  await supabase.from("trades").upsert({ ...childData, id: child.id }, { onConflict: "id" }).throwOnError();

  // Shrink the parent (keeps its original entry).
  await Promise.all([
    workerUpdateTrade(base44, trade.id, { size: newSize }),
    supabase.from("trades").update({ size: newSize }).eq("id", trade.id).throwOnError(),
  ]);

  // Recompute balance from ground truth — child already `closed` above.
  const balanceAfter = await persistCloseBalance({ base44, supabase, acct, pnl });

  const { error: ledgerErr } = await insertLedgerRow(supabase,{
    event_type:     "trade_reduce",
    account_id,
    trader_address: acct.trader_address || "",
    trade_id:       child.id,
    symbol:         trade.symbol,
    direction:      trade.direction,
    size_usdc:      closedNotional,
    leverage:       lev,
    entry_price:    trade.entry_price,
    exit_price:     livePrice,
    pnl_usdc:       pnl,
    close_reason:   reason,
    opened_at:      trade.open_time,
    closed_at:      now,
    balance_before: balanceBefore,
    balance_after:  balanceAfter ?? 0,
  });
  if (ledgerErr) console.error("[server] trade_reduce ledger insert failed:", ledgerErr.message);

  return { pnl, pnl_pct, newSize, childId: child.id, balanceAfter };
}

// ── POST /trade/close ─────────────────────────────────────────────────────────
// Closes an open position. With an optional `fraction` (0–1) it closes only
// that slice and leaves the rest open; omitted or >= 1 closes the whole thing.

async function handleTradeClose({ payload, supabase, base44, state }) {
  const { leader, accountCache, getOpenTrades, removeFromCache, getFreshPrice } = state;

  if (!leader.isLeader) {
    return notLeaderResponse(leader);
  }

  const { trade_id, account_id } = payload;
  if (!trade_id || !account_id) {
    return { status: 400, body: { error: "Missing required fields: trade_id, account_id" } };
  }

  const trade = await findOpenTradeOrHydrate(supabase, state, trade_id);
  if (!trade) {
    return { status: 404, body: { error: "Trade not found or already closed" } };
  }
  if (trade.account_id !== account_id) {
    return { status: 403, body: { error: "Trade does not belong to this account" } };
  }

  const acct = accountCache.get(account_id);
  if (!acct) {
    return { status: 404, body: { error: "Account not found in cache" } };
  }

  const authCheck = await verifyApiSecret({ api_secret: payload.api_secret, acct, base44 });
  if (!authCheck.ok) {
    return { status: 401, body: { error: authCheck.error } };
  }

  // Use the worker's authoritative exit price — never trust the client-submitted
  // price — and, as on entry, refuse to fill on a stale/uncertain price so a
  // close can't harvest a lagging cache either.
  const exitFill = getFreshPrice(trade.symbol);
  if (exitFill.price == null) {
    return { status: 503, body: { error: `No price available for ${trade.symbol}` } };
  }
  if (!exitFill.fresh) {
    console.warn(`[server] CLOSE rejected — stale price ${trade.symbol} (${exitFill.reason}) acct=${account_id}`);
    return { status: 503, body: { error: `Price feed for ${trade.symbol} is momentarily stale — please try again`, code: "price_stale" } };
  }
  const exitPrice = exitFill.price;

  // Partial close: realise a fraction of the position and leave the rest open.
  // fraction omitted or >= 1 falls through to the full close below.
  let fraction = payload.fraction != null ? Number(payload.fraction) : 1;
  if (!(fraction > 0)) fraction = 1;
  if (fraction < 1) {
    const closedNotional = trade.size * fraction;
    if (closedNotional > 0.0001 && closedNotional < trade.size) {
      const nowIso = new Date().toISOString();
      const r = await realisePartialClose({
        supabase, base44, acct, trade, account_id,
        closedNotional, livePrice: exitPrice, now: nowIso, reason: "manual_partial",
      });
      console.log(`[server] Partial close ${Math.round(fraction * 100)}%: ${trade.symbol} ${trade.direction} closed $${closedNotional.toFixed(2)} @ $${exitPrice} PnL ${r.pnl >= 0 ? "+" : ""}$${r.pnl.toFixed(2)} acct=${account_id}`);
      return { status: 200, body: { ...trade, size: r.newSize, realised_pnl: r.pnl, exit_price: exitPrice, partial: true } };
    }
  }

  const isLong  = trade.direction === "long";
  const movePct = (exitPrice - trade.entry_price) / trade.entry_price;
  const pnl     = (isLong ? 1 : -1) * movePct * trade.size;
  const margin  = trade.leverage > 0 ? trade.size / trade.leverage : trade.size;
  const pnl_pct = margin > 0 ? (pnl / margin) * 100 : 0;
  const now     = new Date().toISOString();

  const closeData = { status: "closed", exit_price: exitPrice, pnl, pnl_pct, close_time: now };

  // Remove from cache before writes so the drawdown loop and SL/TP don't double-fire
  removeFromCache(trade_id);

  await Promise.all([
    workerUpdateTrade(base44, trade_id, closeData),
    supabase.from("trades").update(closeData).eq("id", trade_id).throwOnError(),
  ]);

  // Recompute balance from ground truth (the trade is already `closed` above)
  // instead of an incremental += that can be lost — see persistCloseBalance.
  const balanceBefore = acct?.current_balance ?? null;
  const balanceAfter = await persistCloseBalance({ base44, supabase, acct, pnl });

  // Ledger
  const { error: ledgerErr } = await insertLedgerRow(supabase,{
    event_type:     "trade_close",
    account_id,
    trader_address: acct?.trader_address || "",
    trade_id,
    symbol:         trade.symbol,
    direction:      trade.direction,
    size_usdc:      trade.size,
    leverage:       trade.leverage,
    entry_price:    trade.entry_price,
    exit_price:     exitPrice,
    pnl_usdc:       pnl,
    close_reason:   "manual",
    opened_at:      trade.open_time,
    closed_at:      now,
    balance_before: balanceBefore,
    balance_after:  balanceAfter ?? 0,
  });
  if (ledgerErr) console.error("[server] trade_close ledger insert failed:", ledgerErr.message);

  console.log(`[server] Trade closed: ${trade.symbol} ${trade.direction} PnL ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)} acct=${account_id}`);
  return { status: 200, body: { ...trade, ...closeData } };
}

// ── POST /order/create ───────────────────────────────────────────────────────
// Queue a Limit or Stop-Limit order. Margin is reserved on submission so the
// account can't over-commit by stacking pending orders.

async function handleOrderCreate({ payload, supabase, base44, state }) {
  const { leader, accountCache, getOpenTrades, getPendingOrders } = state;

  if (!leader.isLeader) {
    return notLeaderResponse(leader);
  }

  const {
    account_id, symbol, direction, size, leverage,
    order_type, limit_price, stop_price, sl, tp, reduce_only,
  } = payload;

  if (!account_id || !symbol || !direction || !size || !leverage || !order_type || !limit_price) {
    return { status: 400, body: { error: "Missing required fields" } };
  }
  if (!["long", "short"].includes(direction)) {
    return { status: 400, body: { error: "direction must be 'long' or 'short'" } };
  }
  if (!["limit", "stop_limit"].includes(order_type)) {
    return { status: 400, body: { error: "order_type must be 'limit' or 'stop_limit'" } };
  }
  if (size <= 0 || leverage <= 0 || limit_price <= 0) {
    return { status: 400, body: { error: "size, leverage, and limit_price must be positive" } };
  }
  if (order_type === "stop_limit" && (!stop_price || stop_price <= 0)) {
    return { status: 400, body: { error: "stop_price required for stop_limit" } };
  }

  const acct = accountCache.get(account_id);
  if (!acct) {
    return { status: 404, body: { error: "Account not found or not active" } };
  }
  if (acct.phase === "failed" || acct.phase === "paid_out") {
    return { status: 400, body: { error: `Account phase is '${acct.phase}'` } };
  }

  const authCheck = await verifyApiSecret({ api_secret: payload.api_secret, acct, base44 });
  if (!authCheck.ok) {
    return { status: 401, body: { error: authCheck.error } };
  }

  // SL/TP must be on the correct side of the limit price — otherwise the
  // position would be stopped out the moment it fills.
  if (sl != null) {
    const ok = direction === "long" ? sl < limit_price : sl > limit_price;
    if (!ok) return { status: 400, body: { error: "Stop loss is on the wrong side of the limit price" } };
  }
  if (tp != null) {
    const ok = direction === "long" ? tp > limit_price : tp < limit_price;
    if (!ok) return { status: 400, body: { error: "Take profit is on the wrong side of the limit price" } };
  }

  // Reserve margin against open positions AND existing pending orders.
  const marginOf = (t) => (t.leverage > 0 ? t.size / t.leverage : t.size);
  const marginInUse =
    getOpenTrades().filter(t => t.account_id === account_id && t.status === "open")
      .reduce((sum, t) => sum + marginOf(t), 0) +
    (getPendingOrders?.() || []).filter(t => t.account_id === account_id && t.status === "pending")
      .reduce((sum, t) => sum + marginOf(t), 0);
  const zoneReserved = state.zone ? state.zone.reservedFor(acct.account_id || acct.id) : 0;
  const available      = (acct.current_balance ?? 0) - marginInUse - zoneReserved;
  const marginRequired = size / leverage;
  if (marginRequired > available) {
    return {
      status: 400,
      body: { error: `Insufficient margin — available: $${available.toFixed(2)}, required: $${marginRequired.toFixed(2)}` },
    };
  }

  const now = new Date().toISOString();
  const tradeData = {
    account_id,
    trader_address: acct.trader_address || "",
    symbol,
    direction,
    size,
    leverage,
    status:      "pending",
    order_type,
    limit_price,
    open_time:   now,
    ...(stop_price && { stop_price }),
    ...(reduce_only && { reduce_only: true }),
    ...(sl != null && { sl }),
    ...(tp != null && { tp }),
  };

  const created = await workerCreateTrade(base44, tradeData);
  if (!created?.id) throw new Error("Base44 trade creation returned no id");

  await supabase.from("trades").upsert({ ...tradeData, id: created.id }, { onConflict: "id" }).throwOnError();

  console.log(`[server] Pending ${order_type}: ${symbol} ${direction} $${size} @ $${limit_price} acct=${account_id}`);
  return { status: 201, body: created };
}

// ── POST /order/cancel ───────────────────────────────────────────────────────
// Cancel a pending limit or stop-limit order. The order must belong to the
// caller's account; the leader updates status to "cancelled" so the worker's
// price-tick fill logic (executors.js checkTick) drops it.

async function handleOrderCancel({ payload, supabase, base44, state }) {
  const { leader, accountCache, getPendingOrders, removeFromCache } = state;

  if (!leader.isLeader) {
    return notLeaderResponse(leader);
  }

  const { order_id, account_id } = payload;
  if (!order_id || !account_id) {
    return { status: 400, body: { error: "Missing required fields: order_id, account_id" } };
  }

  const order = await findPendingOrderOrHydrate(supabase, state, order_id);
  if (!order) return { status: 404, body: { error: "Order not found or no longer pending" } };
  if (order.account_id !== account_id) {
    return { status: 403, body: { error: "Order does not belong to this account" } };
  }

  const acct = accountCache.get(account_id);
  if (!acct) return { status: 404, body: { error: "Account not found in cache" } };

  const authCheck = await verifyApiSecret({ api_secret: payload.api_secret, acct, base44 });
  if (!authCheck.ok) {
    return { status: 401, body: { error: authCheck.error } };
  }

  const update = { status: "cancelled", close_time: new Date().toISOString() };
  removeFromCache(order_id);

  await Promise.all([
    workerUpdateTrade(base44, order_id, update),
    supabase.from("trades").update(update).eq("id", order_id).throwOnError(),
  ]);

  console.log(`[server] Order cancelled: ${order.symbol} ${order.direction} @ $${order.limit_price} acct=${account_id}`);
  return { status: 200, body: { ...order, ...update } };
}

// ── POST /trade/margin ───────────────────────────────────────────────────────
// Add or reduce margin on an open position. The position's leverage stays the
// same; size is rescaled so margin = size / leverage holds.

async function handleTradeMargin({ payload, supabase, base44, state }) {
  const { leader, accountCache, getOpenTrades, getPendingOrders, getFreshPrice } = state;

  if (!leader.isLeader) {
    return notLeaderResponse(leader);
  }

  const { trade_id, account_id, mode, amount } = payload;
  if (!trade_id || !account_id || !mode || amount == null) {
    return { status: 400, body: { error: "Missing required fields: trade_id, account_id, mode, amount" } };
  }
  if (!["add", "reduce"].includes(mode)) {
    return { status: 400, body: { error: "mode must be 'add' or 'reduce'" } };
  }
  if (typeof amount !== "number" || amount <= 0) {
    return { status: 400, body: { error: "amount must be a positive number" } };
  }

  const trade = await findOpenTradeOrHydrate(supabase, state, trade_id);
  if (!trade) return { status: 404, body: { error: "Trade not found or not open" } };
  if (trade.account_id !== account_id) {
    return { status: 403, body: { error: "Trade does not belong to this account" } };
  }

  const acct = accountCache.get(account_id);
  if (!acct) return { status: 404, body: { error: "Account not found in cache" } };
  if (acct.phase === "failed" || acct.phase === "paid_out") {
    return { status: 400, body: { error: `Account phase is '${acct.phase}'` } };
  }

  const authCheck = await verifyApiSecret({ api_secret: payload.api_secret, acct, base44 });
  if (!authCheck.ok) {
    return { status: 401, body: { error: authCheck.error } };
  }

  const lev = trade.leverage || 1;
  const currentMargin = lev > 0 ? trade.size / lev : trade.size;
  const newMargin = mode === "add" ? currentMargin + amount : Math.max(currentMargin - amount, 1);
  const newSize = newMargin * lev;
  const now = new Date().toISOString();

  // Both add and reduce are FILLS, not free dials on `size`. Adding opens new
  // exposure at the current price (so the blended entry must be re-averaged);
  // reducing CLOSES part of the position and must realise that portion's P&L.
  // The previous implementation just rewrote `size`, which silently dropped the
  // realised P&L of every scale-out and re-priced added exposure at the old
  // (often better) entry. Both need the authoritative live price.
  // Refuse to fill on a stale/uncertain price — same guard as open/close, since
  // both add (re-average) and reduce (realise P&L) execute at this live price.
  const marginFill = getFreshPrice(trade.symbol);
  if (marginFill.price == null) {
    return { status: 503, body: { error: `No price available for ${trade.symbol}` } };
  }
  if (!marginFill.fresh) {
    console.warn(`[server] MARGIN ${mode} rejected — stale price ${trade.symbol} (${marginFill.reason}) acct=${account_id}`);
    return { status: 503, body: { error: `Price feed for ${trade.symbol} is momentarily stale — please try again`, code: "price_stale" } };
  }
  const livePrice = marginFill.price;

  const isLong = trade.direction === "long";

  // ── ADD: re-average entry to the live price ───────────────────────────────
  if (mode === "add") {
    // Adding margin must fit within the account's available balance —
    // count this trade's existing margin once, every other open trade,
    // every pending order.
    const marginOf = (t) => (t.leverage > 0 ? t.size / t.leverage : t.size);
    const marginInUse =
      getOpenTrades()
        .filter(t => t.account_id === account_id && t.status === "open" && t.id !== trade_id)
        .reduce((sum, t) => sum + marginOf(t), 0) +
      (getPendingOrders?.() || []).filter(t => t.account_id === account_id && t.status === "pending")
        .reduce((sum, t) => sum + marginOf(t), 0);
    const zoneReserved = state.zone ? state.zone.reservedFor(acct.account_id || acct.id) : 0;
    const available = (acct.current_balance ?? 0) - marginInUse - currentMargin - zoneReserved;
    if (amount > available) {
      return {
        status: 400,
        body: { error: `Insufficient margin — available: $${available.toFixed(2)}, requested: $${amount.toFixed(2)}` },
      };
    }

    // Blend the existing base quantity (size/entry) with the added quantity
    // (addedNotional/livePrice). The new notional is size + addedNotional, so
    // the new entry = newNotional / totalQty. If added at the same price the
    // entry is unchanged; added against you it moves the entry toward the live
    // price — closing the old exploit where added size inherited the old entry.
    const addedNotional = newSize - trade.size;
    const blendedQty = (trade.entry_price ? trade.size / trade.entry_price : 0) + (addedNotional / livePrice);
    const newEntry = blendedQty > 0 ? newSize / blendedQty : trade.entry_price;

    const update = { size: newSize, entry_price: newEntry };
    await Promise.all([
      workerUpdateTrade(base44, trade_id, update),
      supabase.from("trades").update(update).eq("id", trade_id).throwOnError(),
    ]);

    // Audit: adding re-prices exposure but realises nothing (balance unchanged).
    const { error: ledgerErr } = await insertLedgerRow(supabase,{
      event_type:     "trade_add",
      account_id,
      trader_address: acct.trader_address || "",
      trade_id,
      symbol:         trade.symbol,
      direction:      trade.direction,
      size_usdc:      addedNotional,
      leverage:       lev,
      entry_price:    livePrice,
      balance_before: acct.current_balance ?? null,
      balance_after:  acct.current_balance ?? 0,
      opened_at:      now,
    });
    if (ledgerErr) console.error("[server] trade_add ledger insert failed:", ledgerErr.message);

    console.log(`[server] Trade margin add: ${trade.symbol} margin ${currentMargin.toFixed(2)} → ${newMargin.toFixed(2)} entry ${trade.entry_price} → ${newEntry.toFixed(2)} acct=${account_id}`);
    return { status: 200, body: { ...trade, ...update } };
  }

  // ── REDUCE: realise the closed chunk as its own closed trade ──────────────
  // Delegates to realisePartialClose (shared with the Close-% flow): books the
  // closed notional at the live price as a standalone `closed` trade row so the
  // derived balance picks it up like any close, shrinks the parent, and writes
  // the ledger entry. This is the bug fix — the chunk's P&L is no longer
  // dropped and the reduction is now audited.
  const closedNotional = trade.size - newSize;
  if (closedNotional <= 0.0001) {
    // Already at the margin floor — nothing to realise.
    return { status: 200, body: { ...trade } };
  }

  const r = await realisePartialClose({
    supabase, base44, acct, trade, account_id,
    closedNotional, livePrice, now, reason: "reduce",
  });

  console.log(`[server] Trade margin reduce: ${trade.symbol} ${trade.direction} closed $${closedNotional.toFixed(2)} @ $${livePrice} PnL ${r.pnl >= 0 ? "+" : ""}$${r.pnl.toFixed(2)} (margin ${currentMargin.toFixed(2)} → ${newMargin.toFixed(2)}) acct=${account_id}`);
  return { status: 200, body: { ...trade, size: r.newSize, realised_pnl: r.pnl, exit_price: livePrice } };
}

// ── POST /trade/sltp ─────────────────────────────────────────────────────────
// Update stop loss / take profit on an open position. Pass null (or omit) to
// clear. Both must be on the correct side of the entry price.

async function handleTradeSlTp({ payload, supabase, base44, state }) {
  const { leader, accountCache, getOpenTrades } = state;

  if (!leader.isLeader) {
    return notLeaderResponse(leader);
  }

  const { trade_id, account_id } = payload;
  const sl = payload.sl ?? null;
  const tp = payload.tp ?? null;
  if (!trade_id || !account_id) {
    return { status: 400, body: { error: "Missing required fields: trade_id, account_id" } };
  }

  const trade = await findOpenTradeOrHydrate(supabase, state, trade_id);
  if (!trade) return { status: 404, body: { error: "Trade not found or not open" } };
  if (trade.account_id !== account_id) {
    return { status: 403, body: { error: "Trade does not belong to this account" } };
  }

  const acct = accountCache.get(account_id);
  if (!acct) return { status: 404, body: { error: "Account not found in cache" } };
  if (acct.phase === "failed" || acct.phase === "paid_out") {
    return { status: 400, body: { error: `Account phase is '${acct.phase}'` } };
  }

  const authCheck = await verifyApiSecret({ api_secret: payload.api_secret, acct, base44 });
  if (!authCheck.ok) {
    return { status: 401, body: { error: authCheck.error } };
  }

  if (trade.entry_price) {
    const isLong = trade.direction === "long";
    if (sl != null) {
      const ok = isLong ? sl < trade.entry_price : sl > trade.entry_price;
      if (!ok) return { status: 400, body: { error: "Stop loss is on the wrong side of entry price" } };
    }
    if (tp != null) {
      const ok = isLong ? tp > trade.entry_price : tp < trade.entry_price;
      if (!ok) return { status: 400, body: { error: "Take profit is on the wrong side of entry price" } };
    }
  }

  const update = { sl, tp };
  await Promise.all([
    workerUpdateTrade(base44, trade_id, update),
    supabase.from("trades").update(update).eq("id", trade_id).throwOnError(),
  ]);

  console.log(`[server] Trade SL/TP updated: ${trade.symbol} SL=${sl} TP=${tp} acct=${account_id}`);
  return { status: 200, body: { ...trade, ...update } };
}

// ── Zone Trading (funded mode) ─────────────────────────────────────────────

function handleZoneConfig({ payload, state }) {
  const { zone } = state;
  if (!zone) return { status: 503, body: { error: "Zone engine not ready" } };
  const address = payload?.address;
  // Optional: frontend tells us the pair the user is viewing so we can warm
  // its σ on demand instead of pre-fetching all 66 calibrated pairs. The
  // first poll after a pair-switch triggers the fetch; subsequent polls
  // get the warmed σ value from cache.
  const symbol = payload?.symbol;
  return {
    status: 200,
    body: {
      enabled: zone.enabled,
      allowed: zone.enabled && zone.isAllowed(address),
      ...zone.config({ symbol }),
    },
  };
}

async function handleZoneBet({ payload, supabase, base44, state }) {
  const { leader, accountCache, zone } = state;
  if (!zone) return { status: 503, body: { error: "Zone engine not ready" } };
  if (!leader.isLeader) return notLeaderResponse(leader);

  const { account_id, symbol, direction, stake, duration_sec } = payload;
  if (!account_id || !symbol || !direction || stake == null) {
    return { status: 400, body: { error: "Missing required fields: account_id, symbol, direction, stake" } };
  }

  if (!zone.enabled) {
    return { status: 403, body: { error: "Zone Trading is not currently available" } };
  }

  const acct = accountCache.get(account_id);
  if (!acct) return { status: 404, body: { error: "Account not found or not active" } };
  if (acct.phase === "failed" || acct.phase === "paid_out") {
    return { status: 400, body: { error: `Account phase is '${acct.phase}'` } };
  }
  if (!zone.isAllowed(acct.trader_address)) {
    return { status: 403, body: { error: "Zone Trading is not enabled for this account" } };
  }

  const authCheck = await verifyApiSecret({ api_secret: payload.api_secret, acct, base44 });
  if (!authCheck.ok) return { status: 401, body: { error: authCheck.error } };

  return zone.placeBet({ acct, symbol, direction, stake, durationSec: duration_sec });
}

async function handleZoneExit({ payload, supabase, base44, state }) {
  const { leader, accountCache, zone } = state;
  if (!zone) return { status: 503, body: { error: "Zone engine not ready" } };
  if (!leader.isLeader) return notLeaderResponse(leader);

  const { account_id, bet_id } = payload;
  if (!account_id || !bet_id) {
    return { status: 400, body: { error: "Missing required fields: account_id, trade_id" } };
  }

  const acct = accountCache.get(account_id);
  if (!acct) return { status: 404, body: { error: "Account not found or not active" } };

  const authCheck = await verifyApiSecret({ api_secret: payload.api_secret, acct, base44 });
  if (!authCheck.ok) return { status: 401, body: { error: authCheck.error } };

  return zone.cashOut({ acct, betId: bet_id });
}

async function handleZoneHistory({ payload, supabase, base44, state }) {
  const { accountCache, zone } = state;
  if (!zone) return { status: 503, body: { error: "Zone engine not ready" } };

  const { account_id, limit } = payload;
  if (!account_id) return { status: 400, body: { error: "Missing required field: account_id" } };

  const acct = accountCache.get(account_id);
  if (!acct) return { status: 404, body: { error: "Account not found or not active" } };

  const authCheck = await verifyApiSecret({ api_secret: payload.api_secret, acct, base44 });
  if (!authCheck.ok) return { status: 401, body: { error: authCheck.error } };

  // Not enabled / not allowlisted → empty history (page degrades gracefully).
  if (!zone.enabled || !zone.isAllowed(acct.trader_address)) {
    return { status: 200, body: { bets: [], reserved: 0 } };
  }

  const accountId = acct.account_id || acct.id;
  const { data, error } = await supabase
    .from("zone_trades")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Number(limit) || 50, 200));
  if (error) return { status: 500, body: { error: "Could not load history" } };

  return {
    status: 200,
    body: { bets: data || [], reserved: zone.reservedFor(accountId) },
  };
}

module.exports = { startServer };
