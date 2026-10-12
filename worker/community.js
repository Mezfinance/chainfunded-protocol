"use strict";

/**
 * worker/community.js
 *
 * HTTP handlers for the community feature. Write endpoints authenticate via
 * a session JWT (see communityAuth.js): the wallet signs one login message,
 * the worker issues a 7-day HMAC JWT, and every write carries it as `token`.
 */

const communityAuth = require("./communityAuth");
// Namespace import (not destructured) so the property lookup happens at call
// time. community.js ↔ notifications.js form a cycle, and depending on which
// side index.js loads first, destructuring here can capture an empty exports
// snapshot and silently no-op every notification call.
const _notifications = require("./notifications");
function createNotification(...args) {
  return _notifications.createNotification(...args);
}

const RATE_LIMIT_WINDOW_MS = 30_000;
const RATE_LIMIT_MAX       = 10;
const HANDLE_REGEX         = /^[A-Za-z0-9_]{2,20}$/;
const HANDLE_MENTION_RE    = /(?:^|[^A-Za-z0-9_])@([A-Za-z0-9_]{2,20})/g;
const MAX_MENTIONS_PER_MSG = 5;
const MESSAGE_MAX_LEN      = 2000;
const SHARE_TRADES_CHANNEL = "share-trades";
const SELF_DELETE_WINDOW_MS = 5 * 60 * 1000;
const PINS_PER_CHANNEL = 5;

// Hardcoded super-admin wallets (matches frontend VITE_ADMIN_ADDRESSES).
// Admins have all moderator powers plus the ability to grant/revoke mod role
// and ban platform-wide. Empty list = no admins on the worker (frontend
// admin checks remain for the UI).
const ADMIN_ADDRESSES = new Set(
  (process.env.ADMIN_ADDRESSES || process.env.VITE_ADMIN_ADDRESSES || "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

function isAdminAddress(address) {
  return ADMIN_ADDRESSES.has(String(address || "").toLowerCase());
}

async function isModeratorAddress(supabase, address) {
  if (!address) return false;
  if (isAdminAddress(address)) return true;
  const { data } = await supabase
    .from("community_moderators")
    .select("wallet_address")
    .eq("wallet_address", address.toLowerCase())
    .maybeSingle();
  return !!data;
}

// Pull @handle tokens out of a message body. Lower-cased, deduped, capped.
function extractHandles(content) {
  if (!content) return [];
  const found = new Set();
  let match;
  HANDLE_MENTION_RE.lastIndex = 0;
  while ((match = HANDLE_MENTION_RE.exec(content)) !== null) {
    if (found.size >= MAX_MENTIONS_PER_MSG) break;
    found.add(match[1].toLowerCase());
  }
  return [...found];
}

// ── Auth ─────────────────────────────────────────────────────────────────

function verifyToken(payload) {
  const claims = communityAuth.verifyJwt(payload?.token);
  if (!claims) return { ok: false, error: "Sign in to the community first" };
  return { ok: true, address: claims.sub };
}

// Reject if banned, muted, rate-limited, or slow-moded.
async function preChecks({ supabase, address, channelId, channel }) {
  // Banned?
  const { data: profile } = await supabase
    .from("community_profiles")
    .select("ban_until")
    .eq("wallet_address", address)
    .maybeSingle();
  if (profile?.ban_until && new Date(profile.ban_until) > new Date()) {
    return { ok: false, status: 403, error: "Account is banned from the community" };
  }

  // Muted?
  const { data: mutes } = await supabase
    .from("community_mutes")
    .select("channel_id, expires_at")
    .eq("wallet_address", address);
  const now = Date.now();
  for (const m of mutes || []) {
    if (m.channel_id !== null && m.channel_id !== channelId) continue;
    if (m.expires_at == null) return { ok: false, status: 403, error: "You are muted" };
    if (new Date(m.expires_at).getTime() > now) return { ok: false, status: 403, error: "You are muted" };
  }

  // Channel write gate. Admin-only channels accept hardcoded admins and
  // moderators (and the auto-feed channels are also flagged is_read_only —
  // that flag only applies to non-admins, so admins/mods can still post).
  if (channel?.is_admin_only) {
    let allowed = isAdminAddress(address);
    if (!allowed) {
      const { data: mod } = await supabase
        .from("community_moderators")
        .select("wallet_address")
        .eq("wallet_address", address)
        .maybeSingle();
      allowed = !!mod;
    }
    if (!allowed) return { ok: false, status: 403, error: "This channel is admin-only" };
  } else if (channel?.is_read_only) {
    return { ok: false, status: 403, error: "This channel is read-only" };
  }

  // Slow mode (per channel, per author)
  if (channel?.slow_mode_seconds > 0) {
    const cutoff = new Date(Date.now() - channel.slow_mode_seconds * 1000).toISOString();
    const { data: recent } = await supabase
      .from("community_messages")
      .select("id")
      .eq("channel_id", channelId)
      .eq("author_address", address)
      .gt("created_at", cutoff)
      .limit(1);
    if (recent && recent.length > 0) {
      return { ok: false, status: 429, error: `Slow mode: wait ${channel.slow_mode_seconds}s between posts in this channel` };
    }
  }

  // Rate limit: 10 messages per 30s rolling
  const winStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const { data: rl } = await supabase
    .from("community_rate_limits")
    .select("window_start, count")
    .eq("wallet_address", address)
    .maybeSingle();
  let nextStart = winStart.toISOString();
  let nextCount = 1;
  if (rl && new Date(rl.window_start) > winStart) {
    if (rl.count >= RATE_LIMIT_MAX) {
      return { ok: false, status: 429, error: "Slow down — you're posting too fast" };
    }
    nextStart = rl.window_start;
    nextCount = rl.count + 1;
  }
  await supabase
    .from("community_rate_limits")
    .upsert({
      wallet_address: address,
      window_start: nextStart,
      count: nextCount,
      updated_at: new Date().toISOString(),
    }, { onConflict: "wallet_address" });

  return { ok: true };
}

async function loadChannel(supabase, channelId) {
  const { data, error } = await supabase
    .from("community_channels")
    .select("id, is_read_only, is_admin_only, slow_mode_seconds")
    .eq("id", channelId)
    .maybeSingle();
  if (error) return null;
  return data;
}

// ── Handlers ─────────────────────────────────────────────────────────────

async function handleCommunityChannels({ supabase }) {
  const { data, error } = await supabase
    .from("community_channels")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { channels: data || [] } };
}

async function handleCommunityMessagesGet({ payload, supabase }) {
  const { channel_id, before, limit } = payload || {};
  if (!channel_id) return { status: 400, body: { error: "Missing channel_id" } };
  const cap = Math.min(Math.max(parseInt(limit) || 50, 1), 100);
  let q = supabase
    .from("community_messages")
    .select("*")
    .eq("channel_id", channel_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(cap);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q;
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { messages: (data || []).reverse() } };
}

async function handleCommunityPost({ payload, supabase }) {
  const auth = verifyToken(payload || {});
  if (!auth.ok) return { status: 401, body: { error: auth.error } };

  const { channel_id, content, reply_to } = payload || {};
  if (!channel_id) return { status: 400, body: { error: "Missing channel_id" } };
  const trimmed = String(content || "").trim();
  if (!trimmed) return { status: 400, body: { error: "Message is empty" } };
  if (trimmed.length > MESSAGE_MAX_LEN) {
    return { status: 400, body: { error: `Message too long (max ${MESSAGE_MAX_LEN})` } };
  }

  const channel = await loadChannel(supabase, channel_id);
  if (!channel) return { status: 404, body: { error: "Channel not found" } };

  const pre = await preChecks({ supabase, address: auth.address, channelId: channel_id, channel });
  if (!pre.ok) return { status: pre.status, body: { error: pre.error } };

  // Resolve @handle mentions to lowercased handles that actually exist.
  const candidateHandles = extractHandles(trimmed);
  let mentions = [];
  let mentionedWallets = [];
  if (candidateHandles.length > 0) {
    const { data: matched } = await supabase
      .from("community_profiles")
      .select("handle, wallet_address")
      .in("handle", candidateHandles);
    mentions = (matched || []).map((m) => m.handle).filter(Boolean);
    mentionedWallets = (matched || [])
      .map((m) => (m.wallet_address || "").toLowerCase())
      .filter((a) => a && a !== auth.address);
  }

  const { data, error } = await supabase
    .from("community_messages")
    .insert({
      channel_id,
      author_address: auth.address,
      content: trimmed,
      reply_to: reply_to || null,
      mentions,
    })
    .select()
    .single();
  if (error) return { status: 500, body: { error: error.message } };

  // Notifications — fan out mentions + reply. Best-effort; failures
  // never bubble back to the poster.
  notifyOnPost({ supabase, message: data, mentionedWallets, reply_to, authorAddress: auth.address }).catch(() => {});

  return { status: 201, body: { message: data } };
}

// Look up the sender's handle (for nicer notification titles) and the
// parent message author (for reply notifications), then enqueue rows.
async function notifyOnPost({ supabase, message, mentionedWallets, reply_to, authorAddress }) {
  if (!message) return;
  const senderProfile = await supabase
    .from("community_profiles")
    .select("handle")
    .eq("wallet_address", authorAddress)
    .maybeSingle();
  const senderHandle = senderProfile?.data?.handle || null;
  const fromLabel = senderHandle ? `@${senderHandle}` : `${authorAddress.slice(0, 6)}…${authorAddress.slice(-4)}`;
  const link = `/Community?channel=${encodeURIComponent(message.channel_id)}`;
  const snippet = (message.content || "").slice(0, 200);

  // Mentions — one notification per mentioned wallet.
  for (const recipient of mentionedWallets) {
    await createNotification(supabase, {
      recipient,
      type: "mention",
      title: `${fromLabel} mentioned you in #${message.channel_id}`,
      body: snippet,
      link,
      payload: { messageId: message.id, channelId: message.channel_id, fromAddress: authorAddress },
    });
  }

  // Reply — one notification to the parent message author (skip self).
  if (reply_to) {
    const { data: parent } = await supabase
      .from("community_messages")
      .select("id, author_address")
      .eq("id", reply_to)
      .maybeSingle();
    const parentAuthor = (parent?.author_address || "").toLowerCase();
    if (parentAuthor && parentAuthor !== authorAddress) {
      await createNotification(supabase, {
        recipient: parentAuthor,
        type: "reply",
        title: `${fromLabel} replied to you in #${message.channel_id}`,
        body: snippet,
        link,
        payload: { messageId: message.id, channelId: message.channel_id, replyTo: reply_to, fromAddress: authorAddress },
      });
    }
  }
}

// Suggest handles for the @-mention autocomplete dropdown. Public — no
// auth required. Case-insensitive prefix match, capped at 8 results.
async function handleCommunityHandlesSearch({ payload, supabase }) {
  const prefix = String(payload?.prefix || "").toLowerCase().trim();
  if (!prefix || prefix.length < 1) return { status: 200, body: { handles: [] } };
  const { data } = await supabase
    .from("community_profiles")
    .select("handle, wallet_address")
    .ilike("handle", `${prefix}%`)
    .not("handle", "is", null)
    .limit(8);
  return { status: 200, body: { handles: data || [] } };
}

// User-initiated trade share. Verifies the caller owns the trade (via the
// trader_address column on the trades table). Posts a non-system message
// to #share-trades with system_payload containing the trade card data.
async function handleCommunityShareTrade({ payload, supabase }) {
  const auth = verifyToken(payload || {});
  if (!auth.ok) return { status: 401, body: { error: auth.error } };

  const { trade_id, comment } = payload || {};
  if (!trade_id) return { status: 400, body: { error: "Missing trade_id" } };

  const { data: trade } = await supabase
    .from("trades")
    .select("id, account_id, trader_address, symbol, direction, entry_price, exit_price, size, leverage, pnl, pnl_pct, status, open_time, close_time")
    .eq("id", trade_id)
    .maybeSingle();
  if (!trade) return { status: 404, body: { error: "Trade not found" } };
  if (trade.status !== "closed") return { status: 400, body: { error: "Only closed trades can be shared" } };
  if (!trade.trader_address || trade.trader_address.toLowerCase() !== auth.address) {
    return { status: 403, body: { error: "You don't own this trade" } };
  }

  const channel = await loadChannel(supabase, SHARE_TRADES_CHANNEL);
  if (!channel) return { status: 404, body: { error: "share-trades channel not configured" } };

  // share-trades is open-write; preChecks still enforces ban / mute / rate.
  const pre = await preChecks({ supabase, address: auth.address, channelId: SHARE_TRADES_CHANNEL, channel });
  if (!pre.ok) return { status: pre.status, body: { error: pre.error } };

  const card = {
    kind: "trade_share",
    symbol: trade.symbol,
    direction: trade.direction,
    entry_price: trade.entry_price,
    exit_price: trade.exit_price,
    size: trade.size,
    leverage: trade.leverage,
    pnl: trade.pnl,
    pnl_pct: trade.pnl_pct,
    open_time: trade.open_time,
    close_time: trade.close_time,
  };

  const trimmedComment = comment ? String(comment).slice(0, 500).trim() : null;

  const { data, error } = await supabase
    .from("community_messages")
    .insert({
      channel_id: SHARE_TRADES_CHANNEL,
      author_address: auth.address,
      content: trimmedComment || null,
      is_system: false,
      system_payload: card,
    })
    .select()
    .single();
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 201, body: { message: data } };
}

async function handleCommunityRead({ payload, supabase }) {
  const auth = verifyToken(payload || {});
  if (!auth.ok) return { status: 401, body: { error: auth.error } };
  const { channel_id } = payload || {};
  if (!channel_id) return { status: 400, body: { error: "Missing channel_id" } };

  const { error } = await supabase
    .from("community_reads")
    .upsert({
      wallet_address: auth.address,
      channel_id,
      last_read_at: new Date().toISOString(),
    }, { onConflict: "wallet_address,channel_id" });
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { ok: true } };
}

async function handleCommunityProfileGet({ payload, supabase }) {
  const { address } = payload || {};
  if (!address) return { status: 400, body: { error: "Missing address" } };
  const lc = String(address).toLowerCase();
  const { data, error } = await supabase
    .from("community_profiles")
    .select("*")
    .eq("wallet_address", lc)
    .maybeSingle();
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { profile: data } };
}

// Profile + verified stats. Joins challenge_accounts (best phase, account
// counts), payouts (lifetime payout), and cfg_events (season points).
// Honours is_private — private profiles return only handle + is_private.
async function handleCommunityProfileStats({ payload, supabase }) {
  const { address } = payload || {};
  if (!address) return { status: 400, body: { error: "Missing address" } };
  const lc = String(address).toLowerCase();

  const { data: profile } = await supabase
    .from("community_profiles")
    .select("handle, is_private, ban_until")
    .eq("wallet_address", lc)
    .maybeSingle();

  if (profile?.is_private) {
    return { status: 200, body: { profile: { handle: profile.handle, is_private: true } } };
  }

  const { data: accounts } = await supabase
    .from("challenge_accounts")
    .select("account_size, phase, trader_address")
    .ilike("trader_address", lc);
  const list = accounts || [];
  const phaseRank = { phase_1: 1, phase_2: 2, funded: 3 };
  const maxPhase = list.reduce((p, a) => Math.max(p, phaseRank[a.phase] || 0), 0);
  const maxSize  = list.reduce((s, a) => Math.max(s, Number(a.account_size) || 0), 0);
  const active   = list.filter((a) => a.phase !== "failed" && a.phase !== "paid_out").length;

  const { data: payouts } = await supabase
    .from("payouts")
    .select("trader_share_usdc")
    .ilike("trader_address", lc)
    .eq("status", "settled");
  const payoutTotal = (payouts || []).reduce((s, p) => s + Number(p.trader_share_usdc || 0), 0);

  const { data: pointsRows } = await supabase
    .from("cfg_events")
    .select("points")
    .eq("contract", "distributor")
    .eq("event_name", "RegistrationRecorded")
    .ilike("address", lc);
  const totalPoints = (pointsRows || []).reduce((s, r) => s + Number(r.points || 0), 0);

  return {
    status: 200,
    body: {
      profile: {
        handle: profile?.handle || null,
        is_private: false,
        accounts_active: active,
        accounts_total: list.length,
        max_account_size: maxSize,
        max_phase: maxPhase,
        payout_total_usdc: payoutTotal,
        season_points: totalPoints,
      },
    },
  };
}

// Toggle a reaction. If the (message, emoji, reactor) triple exists, delete
// it; otherwise insert. Mute/ban check applies to inserts only — deleting
// your own existing reaction is always allowed.
// Batch profile lookup for message lists. Returns just enough per address to
// render @handle + a status badge: handle, is_private, is_admin, is_mod, and
// max_phase (0 = no account, 1 = phase 1, 2 = phase 2, 3 = funded).
async function handleCommunityProfilesBatch({ payload, supabase }) {
  const raw = Array.isArray(payload?.addresses) ? payload.addresses : [];
  const addresses = Array.from(
    new Set(
      raw
        .filter((a) => typeof a === "string" && a.length > 0)
        .map((a) => a.toLowerCase())
    )
  ).slice(0, 200);
  if (addresses.length === 0) return { status: 200, body: { profiles: {} } };

  const [{ data: profiles }, { data: mods }, { data: accounts }] = await Promise.all([
    supabase
      .from("community_profiles")
      .select("wallet_address, handle, is_private")
      .in("wallet_address", addresses),
    supabase
      .from("community_moderators")
      .select("wallet_address")
      .in("wallet_address", addresses),
    // challenge_accounts.trader_address is stored checksummed; match
    // case-insensitively so we don't miss accounts for the lowercased
    // input set.
    supabase
      .from("challenge_accounts")
      .select("trader_address, phase")
      .or(addresses.map((a) => `trader_address.ilike.${a}`).join(",")),
  ]);

  const phaseRank = { phase_1: 1, phase_2: 2, funded: 3 };
  const out = {};
  for (const a of addresses) {
    out[a] = {
      handle: null,
      is_private: false,
      is_admin: isAdminAddress(a),
      is_mod: false,
      max_phase: 0,
      accounts_total: 0,
    };
  }
  for (const p of profiles || []) {
    const k = (p.wallet_address || "").toLowerCase();
    if (!out[k]) continue;
    out[k].handle = p.handle || null;
    out[k].is_private = !!p.is_private;
  }
  for (const m of mods || []) {
    const k = (m.wallet_address || "").toLowerCase();
    if (out[k]) out[k].is_mod = true;
  }
  for (const a of accounts || []) {
    const k = (a.trader_address || "").toLowerCase();
    if (!out[k]) continue;
    out[k].accounts_total += 1;
    const r = phaseRank[a.phase] || 0;
    if (r > out[k].max_phase) out[k].max_phase = r;
  }

  return { status: 200, body: { profiles: out } };
}

// Public counters rendered above the channel list.
//   platformUsers   — distinct lifetime wallets across challenge_accounts
//                     (traders) and Base44 LPPosition (liquidity providers)
//   activePhase1    — challenge_accounts.phase = 'phase_1'
//   activePhase2    — challenge_accounts.phase = 'phase_2'
//   funded          — challenge_accounts.phase = 'funded'
async function handleCommunityStats({ supabase, base44 }) {
  const seen = new Set();

  // Trader wallets — case-insensitive dedupe in JS. Capped at 50k rows;
  // beyond that volume we'd switch to a Postgres aggregate / RPC.
  const { data: traderRows } = await supabase
    .from("challenge_accounts")
    .select("trader_address")
    .limit(50000);
  for (const r of traderRows || []) {
    const a = (r.trader_address || "").toLowerCase();
    if (a) seen.add(a);
  }

  // LP wallets — pulled from Base44 (LPPosition is the source of truth;
  // not mirrored to Supabase yet). Includes withdrawn / inactive positions
  // since this counter is lifetime, not active. Errors are swallowed so
  // a Base44 hiccup doesn't take the whole stats endpoint down.
  if (base44) {
    try {
      const lps = await base44.entities.LPPosition.list("-created_date", 10000);
      for (const p of Array.isArray(lps) ? lps : []) {
        const a = (p.lp_address || "").toLowerCase();
        if (a) seen.add(a);
      }
    } catch { /* ignore */ }
  }

  const phaseCount = async (phase) => {
    const { count } = await supabase
      .from("challenge_accounts")
      .select("*", { count: "exact", head: true })
      .eq("phase", phase);
    return count || 0;
  };
  const [activePhase1, activePhase2, funded] = await Promise.all([
    phaseCount("phase_1"),
    phaseCount("phase_2"),
    phaseCount("funded"),
  ]);

  return {
    status: 200,
    body: {
      stats: {
        platformUsers: seen.size,
        activePhase1,
        activePhase2,
        funded,
      },
    },
  };
}

async function handleCommunityReact({ payload, supabase }) {
  const auth = verifyToken(payload || {});
  if (!auth.ok) return { status: 401, body: { error: auth.error } };

  const { message_id, emoji } = payload || {};
  if (!message_id || !emoji) return { status: 400, body: { error: "Missing message_id or emoji" } };

  const { data: existing } = await supabase
    .from("community_reactions")
    .select("emoji")
    .eq("message_id", message_id)
    .eq("emoji", emoji)
    .eq("reactor_address", auth.address)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("community_reactions")
      .delete()
      .eq("message_id", message_id)
      .eq("emoji", emoji)
      .eq("reactor_address", auth.address);
    if (error) return { status: 500, body: { error: error.message } };
    return { status: 200, body: { reacted: false } };
  }

  // Ban check on insert
  const { data: profile } = await supabase
    .from("community_profiles")
    .select("ban_until")
    .eq("wallet_address", auth.address)
    .maybeSingle();
  if (profile?.ban_until && new Date(profile.ban_until) > new Date()) {
    return { status: 403, body: { error: "Banned" } };
  }

  const { error } = await supabase
    .from("community_reactions")
    .insert({ message_id, emoji, reactor_address: auth.address });
  if (error) return { status: 500, body: { error: error.message } };

  notifyOnReaction({ supabase, message_id, emoji, reactorAddress: auth.address }).catch(() => {});
  return { status: 200, body: { reacted: true } };
}

async function notifyOnReaction({ supabase, message_id, emoji, reactorAddress }) {
  const { data: msg } = await supabase
    .from("community_messages")
    .select("id, author_address, channel_id, content, deleted_at")
    .eq("id", message_id)
    .maybeSingle();
  if (!msg || msg.deleted_at) return;
  const recipient = (msg.author_address || "").toLowerCase();
  if (!recipient || recipient === reactorAddress) return;

  const { data: profile } = await supabase
    .from("community_profiles")
    .select("handle")
    .eq("wallet_address", reactorAddress)
    .maybeSingle();
  const fromLabel = profile?.handle
    ? `@${profile.handle}`
    : `${reactorAddress.slice(0, 6)}…${reactorAddress.slice(-4)}`;

  await createNotification(supabase, {
    recipient,
    type: "reaction",
    title: `${fromLabel} reacted ${emoji}`,
    body: (msg.content || "").slice(0, 200),
    link: `/Community?channel=${encodeURIComponent(msg.channel_id)}`,
    payload: { messageId: msg.id, channelId: msg.channel_id, emoji, fromAddress: reactorAddress },
  });
}

async function handleCommunityProfileUpdate({ payload, supabase }) {
  const auth = verifyToken(payload || {});
  if (!auth.ok) return { status: 401, body: { error: auth.error } };

  const update = {};
  if (payload.handle !== undefined) {
    if (payload.handle === null || payload.handle === "") {
      update.handle = null;
    } else if (!HANDLE_REGEX.test(payload.handle)) {
      return { status: 400, body: { error: "Handle must be 2–20 chars, letters / numbers / underscore" } };
    } else {
      update.handle = String(payload.handle).toLowerCase();
    }
  }
  if (payload.is_private !== undefined) {
    update.is_private = !!payload.is_private;
  }

  const row = { wallet_address: auth.address, ...update };
  const { data, error } = await supabase
    .from("community_profiles")
    .upsert(row, { onConflict: "wallet_address" })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      return { status: 409, body: { error: "Handle already taken" } };
    }
    return { status: 500, body: { error: error.message } };
  }
  return { status: 200, body: { profile: data } };
}

async function handleCommunityAcceptTerms({ payload, supabase }) {
  const auth = verifyToken(payload || {});
  if (!auth.ok) return { status: 401, body: { error: auth.error } };
  const version = parseInt(payload.version) || 1;
  const { error } = await supabase
    .from("community_terms_acceptances")
    .upsert({
      wallet_address: auth.address,
      version,
      accepted_at: new Date().toISOString(),
    }, { onConflict: "wallet_address" });
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { ok: true } };
}

// ── Moderation ───────────────────────────────────────────────────────────

async function handleCommunityFlag({ payload, supabase }) {
  const auth = verifyToken(payload || {});
  if (!auth.ok) return { status: 401, body: { error: auth.error } };
  const { message_id, reason } = payload || {};
  if (!message_id) return { status: 400, body: { error: "Missing message_id" } };

  const { data: msg } = await supabase
    .from("community_messages")
    .select("id, author_address, is_system")
    .eq("id", message_id)
    .maybeSingle();
  if (!msg) return { status: 404, body: { error: "Message not found" } };
  if (msg.is_system) return { status: 400, body: { error: "Can't flag system messages" } };
  if ((msg.author_address || "").toLowerCase() === auth.address) {
    return { status: 400, body: { error: "Can't flag your own message" } };
  }

  const { error } = await supabase
    .from("community_flags")
    .insert({
      message_id,
      reporter_address: auth.address,
      reason: reason ? String(reason).slice(0, 500) : null,
    });
  // Ignore unique-violation (already flagged this msg)
  if (error && error.code !== "23505") {
    return { status: 500, body: { error: error.message } };
  }
  return { status: 200, body: { ok: true } };
}

async function handleCommunityDelete({ payload, supabase }) {
  const auth = verifyToken(payload || {});
  if (!auth.ok) return { status: 401, body: { error: auth.error } };
  const { message_id } = payload || {};
  if (!message_id) return { status: 400, body: { error: "Missing message_id" } };

  const { data: msg } = await supabase
    .from("community_messages")
    .select("id, author_address, is_system, created_at, deleted_at")
    .eq("id", message_id)
    .maybeSingle();
  if (!msg) return { status: 404, body: { error: "Message not found" } };
  if (msg.deleted_at) return { status: 200, body: { ok: true } };

  const isOwn = (msg.author_address || "").toLowerCase() === auth.address;
  const isMod = await isModeratorAddress(supabase, auth.address);
  if (!isMod) {
    if (!isOwn) return { status: 403, body: { error: "Not authorised" } };
    if (Date.now() - new Date(msg.created_at).getTime() > SELF_DELETE_WINDOW_MS) {
      return { status: 403, body: { error: "Message too old to delete (5 min limit)" } };
    }
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("community_messages")
    .update({ deleted_at: now, deleted_by: auth.address })
    .eq("id", message_id);
  if (error) return { status: 500, body: { error: error.message } };

  // Auto-resolve any pending flags on this message.
  await supabase
    .from("community_flags")
    .update({ status: "resolved_delete", resolved_by: auth.address, resolved_at: now })
    .eq("message_id", message_id)
    .eq("status", "pending");

  // Notify the author when a mod (not the author themselves) removed it.
  if (!isOwn) {
    const recipient = (msg.author_address || "").toLowerCase();
    if (recipient) {
      createNotification(supabase, {
        recipient,
        type: "mod_action",
        title: "A moderator removed your message",
        body: "If you think this was a mistake, reach out in #help.",
        link: "/Community",
        payload: { action: "delete", messageId: msg.id },
      }).catch(() => {});
    }
  }

  return { status: 200, body: { ok: true } };
}

async function handleCommunityPin({ payload, supabase }) {
  const auth = verifyToken(payload || {});
  if (!auth.ok) return { status: 401, body: { error: auth.error } };
  if (!(await isModeratorAddress(supabase, auth.address))) {
    return { status: 403, body: { error: "Mod role required" } };
  }
  const { message_id, pinned } = payload || {};
  if (!message_id) return { status: 400, body: { error: "Missing message_id" } };

  if (pinned === false) {
    const { error } = await supabase
      .from("community_messages")
      .update({ pinned: false, pinned_by: null, pinned_at: null })
      .eq("id", message_id);
    if (error) return { status: 500, body: { error: error.message } };
    return { status: 200, body: { pinned: false } };
  }

  const { data: target } = await supabase
    .from("community_messages")
    .select("channel_id, pinned")
    .eq("id", message_id)
    .maybeSingle();
  if (!target) return { status: 404, body: { error: "Message not found" } };
  if (target.pinned) return { status: 200, body: { pinned: true } };

  const { count } = await supabase
    .from("community_messages")
    .select("*", { count: "exact", head: true })
    .eq("channel_id", target.channel_id)
    .eq("pinned", true);
  if ((count || 0) >= PINS_PER_CHANNEL) {
    return { status: 400, body: { error: `Pin limit reached (${PINS_PER_CHANNEL} per channel) — unpin one first` } };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("community_messages")
    .update({ pinned: true, pinned_by: auth.address, pinned_at: now })
    .eq("id", message_id);
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { pinned: true } };
}

async function handleCommunityListPinned({ payload, supabase }) {
  const { channel_id } = payload || {};
  let q = supabase
    .from("community_messages")
    .select("*")
    .eq("pinned", true)
    .is("deleted_at", null)
    .order("pinned_at", { ascending: false })
    .limit(50);
  if (channel_id) q = q.eq("channel_id", channel_id);
  const { data, error } = await q;
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { messages: data || [] } };
}

async function handleCommunityMute({ payload, supabase }) {
  const auth = verifyToken(payload || {});
  if (!auth.ok) return { status: 401, body: { error: auth.error } };
  if (!(await isModeratorAddress(supabase, auth.address))) {
    return { status: 403, body: { error: "Mod role required" } };
  }
  const { wallet, channel_id, duration_seconds, reason } = payload || {};
  if (!wallet) return { status: 400, body: { error: "Missing wallet" } };
  const target = String(wallet).toLowerCase();

  // duration_seconds=0 → unmute
  if (duration_seconds === 0) {
    let q = supabase.from("community_mutes").delete().eq("wallet_address", target);
    q = channel_id ? q.eq("channel_id", channel_id) : q.is("channel_id", null);
    const { error } = await q;
    if (error) return { status: 500, body: { error: error.message } };
    return { status: 200, body: { muted: false } };
  }

  const expiresAt = duration_seconds
    ? new Date(Date.now() + Number(duration_seconds) * 1000).toISOString()
    : null; // null = permanent
  const { error } = await supabase
    .from("community_mutes")
    .upsert({
      wallet_address: target,
      channel_id: channel_id || null,
      expires_at: expiresAt,
      muted_by: auth.address,
      reason: reason ? String(reason).slice(0, 500) : null,
    }, { onConflict: "wallet_address,channel_id" });
  if (error) return { status: 500, body: { error: error.message } };

  const scope = channel_id ? `#${channel_id}` : "the community";
  const durationLabel = expiresAt
    ? `until ${new Date(expiresAt).toUTCString()}`
    : "indefinitely";
  createNotification(supabase, {
    recipient: target,
    type: "mod_action",
    title: `You've been muted in ${scope}`,
    body: `${durationLabel}${reason ? ` — ${String(reason).slice(0, 240)}` : ""}`,
    link: "/Community",
    payload: { action: "mute", channelId: channel_id || null, expiresAt, reason: reason || null },
  }).catch(() => {});

  return { status: 200, body: { muted: true, expires_at: expiresAt } };
}

async function handleCommunityBan({ payload, supabase }) {
  const auth = verifyToken(payload || {});
  if (!auth.ok) return { status: 401, body: { error: auth.error } };
  if (!isAdminAddress(auth.address)) {
    return { status: 403, body: { error: "Admin role required" } };
  }
  const { wallet, until } = payload || {};
  if (!wallet) return { status: 400, body: { error: "Missing wallet" } };
  const target = String(wallet).toLowerCase();
  const banUntil = until === null ? null : (until || "9999-12-31T00:00:00Z");

  const { error } = await supabase
    .from("community_profiles")
    .upsert({ wallet_address: target, ban_until: banUntil }, { onConflict: "wallet_address" });
  if (error) return { status: 500, body: { error: error.message } };

  if (banUntil) {
    const banLabel = banUntil > "9999-01-01"
      ? "permanently"
      : `until ${new Date(banUntil).toUTCString()}`;
    createNotification(supabase, {
      recipient: target,
      type: "mod_action",
      title: `You've been banned from the community ${banLabel}`,
      body: "If you believe this is a mistake, contact the team.",
      link: "/Community",
      payload: { action: "ban", banUntil },
    }).catch(() => {});
  } else {
    createNotification(supabase, {
      recipient: target,
      type: "mod_action",
      title: "Your community ban has been lifted",
      body: null,
      link: "/Community",
      payload: { action: "unban" },
    }).catch(() => {});
  }

  return { status: 200, body: { ok: true, ban_until: banUntil } };
}

async function handleCommunityResolveFlag({ payload, supabase }) {
  const auth = verifyToken(payload || {});
  if (!auth.ok) return { status: 401, body: { error: auth.error } };
  if (!(await isModeratorAddress(supabase, auth.address))) {
    return { status: 403, body: { error: "Mod role required" } };
  }
  const { flag_id, action } = payload || {};
  if (!flag_id) return { status: 400, body: { error: "Missing flag_id" } };
  if (!["dismiss", "delete"].includes(action)) {
    return { status: 400, body: { error: "action must be 'dismiss' or 'delete'" } };
  }

  const { data: flag } = await supabase
    .from("community_flags")
    .select("id, message_id, status")
    .eq("id", flag_id)
    .maybeSingle();
  if (!flag) return { status: 404, body: { error: "Flag not found" } };
  if (flag.status !== "pending") return { status: 200, body: { ok: true } };

  const now = new Date().toISOString();
  if (action === "delete") {
    await supabase
      .from("community_messages")
      .update({ deleted_at: now, deleted_by: auth.address })
      .eq("id", flag.message_id);
  }
  const { error } = await supabase
    .from("community_flags")
    .update({
      status: action === "delete" ? "resolved_delete" : "dismissed",
      resolved_by: auth.address,
      resolved_at: now,
    })
    .eq("id", flag_id);
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { ok: true } };
}

async function handleCommunityModQueue({ payload, supabase }) {
  const auth = verifyToken(payload || {});
  if (!auth.ok) return { status: 401, body: { error: auth.error } };
  if (!(await isModeratorAddress(supabase, auth.address))) {
    return { status: 403, body: { error: "Mod role required" } };
  }
  const { data: flags } = await supabase
    .from("community_flags")
    .select("id, message_id, reporter_address, reason, status, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);
  const ids = (flags || []).map((f) => f.message_id);
  let messages = [];
  if (ids.length > 0) {
    const { data: msgs } = await supabase
      .from("community_messages")
      .select("*")
      .in("id", ids);
    messages = msgs || [];
  }
  return { status: 200, body: { flags: flags || [], messages } };
}

async function handleCommunityModeratorList({ payload, supabase }) {
  const { data, error } = await supabase
    .from("community_moderators")
    .select("wallet_address, granted_by, granted_at")
    .order("granted_at", { ascending: true });
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { moderators: data || [] } };
}

async function handleCommunityModeratorAdd({ payload, supabase }) {
  const auth = verifyToken(payload || {});
  if (!auth.ok) return { status: 401, body: { error: auth.error } };
  if (!isAdminAddress(auth.address)) {
    return { status: 403, body: { error: "Admin role required" } };
  }
  const { wallet } = payload || {};
  if (!wallet) return { status: 400, body: { error: "Missing wallet" } };
  const target = String(wallet).toLowerCase();
  const { error } = await supabase
    .from("community_moderators")
    .upsert({ wallet_address: target, granted_by: auth.address }, { onConflict: "wallet_address" });
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { ok: true } };
}

async function handleCommunityModeratorRemove({ payload, supabase }) {
  const auth = verifyToken(payload || {});
  if (!auth.ok) return { status: 401, body: { error: auth.error } };
  if (!isAdminAddress(auth.address)) {
    return { status: 403, body: { error: "Admin role required" } };
  }
  const { wallet } = payload || {};
  if (!wallet) return { status: 400, body: { error: "Missing wallet" } };
  const target = String(wallet).toLowerCase();
  const { error } = await supabase
    .from("community_moderators")
    .delete()
    .eq("wallet_address", target);
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { ok: true } };
}

// Admin-only system message — typically used for #announcements posts
// (maintenance windows, releases, governance reminders).
async function handleCommunityModSystem({ payload, supabase }) {
  const auth = verifyToken(payload || {});
  if (!auth.ok) return { status: 401, body: { error: auth.error } };
  if (!isAdminAddress(auth.address)) {
    return { status: 403, body: { error: "Admin role required" } };
  }
  const { channel_id, kind, content, payload: extra } = payload || {};
  if (!channel_id) return { status: 400, body: { error: "Missing channel_id" } };

  const channel = await loadChannel(supabase, channel_id);
  if (!channel) return { status: 404, body: { error: "Channel not found" } };

  const { data, error } = await supabase
    .from("community_messages")
    .insert({
      channel_id,
      author_address: null,
      content: content ? String(content).slice(0, 2000) : null,
      is_system: true,
      system_payload: { kind: kind || "maintenance", ...(extra || {}) },
    })
    .select()
    .single();
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { message: data } };
}

module.exports = {
  verifyToken,
  handleCommunityChannels,
  handleCommunityMessagesGet,
  handleCommunityPost,
  handleCommunityRead,
  handleCommunityProfileGet,
  handleCommunityProfileStats,
  handleCommunityProfilesBatch,
  handleCommunityStats,
  handleCommunityProfileUpdate,
  handleCommunityAcceptTerms,
  handleCommunityReact,
  handleCommunityHandlesSearch,
  handleCommunityShareTrade,
  handleCommunityFlag,
  handleCommunityDelete,
  handleCommunityPin,
  handleCommunityListPinned,
  handleCommunityMute,
  handleCommunityBan,
  handleCommunityResolveFlag,
  handleCommunityModQueue,
  handleCommunityModeratorList,
  handleCommunityModeratorAdd,
  handleCommunityModeratorRemove,
  handleCommunityModSystem,
};
