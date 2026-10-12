"use strict";

/**
 * cfgIndexer — pulls events from CFGDistributor and CFGLPRewards into the
 * `cfg_events` Supabase table. Powers the leaderboard and any future
 * analytics that need to aggregate across all addresses.
 *
 * Strategy:
 *   - On startup, read last indexed block per contract from
 *     `cfg_indexer_cursor`. If absent, start from contract deployment
 *     block (or 0 — getLogs is fast enough on Sepolia).
 *   - Backfill in 5k-block chunks until caught up to head.
 *   - Then poll every 30s for new logs.
 *
 * Leader-only — no need for two instances to double-write.
 */

const { ethers } = require("ethers");
const { supabase } = require("./supabase");
const { createNotification } = require("./notifications");

// Format a raw token amount string with the given decimals into a short
// display string (e.g. 1234567890123456789 / 18 → "1.23"). Caps at 4
// significant digits below 100, 2 above.
function fmtTokenAmount(rawStr, decimals) {
  if (!rawStr) return "0";
  try {
    const big = BigInt(rawStr);
    const divisor = 10n ** BigInt(decimals);
    const whole = big / divisor;
    const frac = big % divisor;
    const wholeNum = Number(whole);
    const fracNum = Number(frac) / Number(divisor);
    const num = wholeNum + fracNum;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    if (num >= 100) return num.toFixed(0);
    return num.toFixed(num >= 1 ? 2 : 4);
  } catch {
    return rawStr;
  }
}

// Fans the same notification out to every distinct address in cfg_events
// matching `audienceFilter`. Used for season lifecycle events where there's
// no single on-chain recipient — we want to ping the relevant cohort
// (stakers for SeasonStarted, season-N point earners for SeasonFinalized).
async function broadcastSeasonNotification({ audienceFilter, type, title, body, link, payload }) {
  let q = supabase.from("cfg_events").select("address").not("address", "is", null);
  for (const [k, v] of Object.entries(audienceFilter || {})) {
    if (v == null) continue;
    q = q.eq(k, v);
  }
  // Cap: 5k rows is enough for current scale; bumps to a Postgres
  // distinct query / RPC if we ever exceed it.
  const { data, error } = await q.limit(5000);
  if (error) {
    console.warn("[cfgIndexer] broadcast audience query failed:", error.message);
    return;
  }
  const recipients = Array.from(
    new Set((data || []).map((r) => (r.address || "").toLowerCase()).filter(Boolean))
  );
  for (const recipient of recipients) {
    try {
      await createNotification(supabase, { recipient, type, title, body, link, payload });
    } catch { /* one-bad-row continues */ }
  }
}

async function fanOutCfgEventNotifications(rows) {
  for (const row of rows || []) {
    if (!row.address) continue;
    try {
      switch (row.event_name) {
        case "CfgRewardClaimed":
          await createNotification(supabase, {
            recipient: row.address,
            type: "lp_claim",
            title: `Claimed ${fmtTokenAmount(row.amount, 18)} CFG`,
            body: "Your LP CFG rewards landed in your wallet.",
            link: "/CfgRewards?tab=lp",
            payload: { kind: "cfg", txHash: row.tx_hash, amount: row.amount },
          });
          break;
        case "UsdcProfitClaimed":
          await createNotification(supabase, {
            recipient: row.address,
            type: "lp_claim",
            title: `Claimed $${fmtTokenAmount(row.amount, 6)} profit`,
            body: "Your LP USDC profit share has been distributed.",
            link: "/LPDashboard",
            payload: { kind: "usdc_profit", txHash: row.tx_hash, amount: row.amount },
          });
          break;
        case "RegistrationRecorded":
          await createNotification(supabase, {
            recipient: row.address,
            type: "cfg",
            title: `+${fmtTokenAmount(row.points, 0)} CFG points (Season ${row.season_id})`,
            body: "Points convert to CFG when the season finalizes.",
            link: "/CfgRewards",
            payload: { kind: "points", seasonId: row.season_id, points: row.points },
          });
          break;
        case "Deposited":
          await createNotification(supabase, {
            recipient: row.address,
            type: "lp_deposit",
            title: `LP deposit confirmed — $${fmtTokenAmount(row.amount, 6)} USDC`,
            body: "You're earning yield + CFG rewards.",
            link: "/LPDashboard",
            payload: { txHash: row.tx_hash, usdcAmount: row.amount },
          });
          break;
        case "Withdrawn":
          await createNotification(supabase, {
            recipient: row.address,
            type: "lp_withdraw",
            title: `LP withdrawal complete — $${fmtTokenAmount(row.amount, 6)} USDC returned`,
            body: null,
            link: "/LPDashboard",
            payload: { txHash: row.tx_hash, usdcReturned: row.amount },
          });
          break;
        case "ProfitClaimed":
          // Distinct from CFGLPRewards.UsdcProfitClaimed — this is the
          // pool's LP profit-pool share (trading fee distribution), not
          // the staking-rewards stream.
          await createNotification(supabase, {
            recipient: row.address,
            type: "lp_claim",
            title: `LP profit share claimed — $${fmtTokenAmount(row.amount, 6)}`,
            body: "Your share of the trading-fee profit pool.",
            link: "/LPDashboard",
            payload: { kind: "lp_profit_pool", txHash: row.tx_hash, amount: row.amount },
          });
          break;
        case "ChallengeRegistered":
          // Only when there's an actual affiliate + commission.
          if (row.address && row.address !== "0x0000000000000000000000000000000000000000" && row.amount && row.amount !== "0") {
            await createNotification(supabase, {
              recipient: row.address,
              type: "affiliate",
              title: `Affiliate commission — $${fmtTokenAmount(row.amount, 6)}`,
              body: "A trader you referred just bought a challenge.",
              link: "/AffiliateDashboard",
              payload: { txHash: row.tx_hash, commissionUsdc: row.amount },
            });
          }
          break;
        case "Staked":
          await createNotification(supabase, {
            recipient: row.address,
            type: "staking",
            title: `Staked ${fmtTokenAmount(row.amount, 18)} CFND`,
            body: "You're now earning CFG + USDC profit-share rewards.",
            link: "/CfgRewards?tab=lp",
            payload: { kind: "stake", txHash: row.tx_hash, amount: row.amount },
          });
          break;
        case "Unstaked":
          await createNotification(supabase, {
            recipient: row.address,
            type: "staking",
            title: `Unstaked ${fmtTokenAmount(row.amount, 18)} CFND`,
            body: "Your CFND has been returned to your wallet.",
            link: "/CfgRewards?tab=lp",
            payload: { kind: "unstake", txHash: row.tx_hash, amount: row.amount },
          });
          break;
        case "SeasonStarted":
          // Broadcast to every wallet that has ever staked CFND.
          await broadcastSeasonNotification({
            audienceFilter: { event_name: "Staked" },
            type: "cfg",
            title: `New rewards season — Season ${row.season_id} is live`,
            body: "Stake CFND or trade to earn CFG + USDC profit share.",
            link: "/CfgRewards?tab=lp",
            payload: { kind: "season_started", seasonId: row.season_id },
          });
          break;
        case "SeasonFinalized":
          // Broadcast to every trader who scored points in this season.
          await broadcastSeasonNotification({
            audienceFilter: { event_name: "RegistrationRecorded", season_id: row.season_id },
            type: "cfg",
            title: `Season ${row.season_id} finalized — your CFG is ready`,
            body: "Open the rewards page to claim your share.",
            link: "/CfgRewards",
            payload: { kind: "season_finalized", seasonId: row.season_id },
          });
          break;
        // SeasonCreated is the on-chain pre-announcement of SeasonStarted —
        // skip to avoid double-notifying on the same lifecycle event.
        default:
          break;
      }
    } catch { /* swallow per-row errors so one bad notify can't poison the loop */ }
  }
}

const CHUNK_SIZE      = 5_000;
const POLL_INTERVAL_MS = 30_000;

const DISTRIBUTOR_ABI = [
  "event RegistrationRecorded(uint256 indexed regId, uint256 indexed seasonId, address indexed trader, string accountId, uint256 accountSizeUsdc, uint8 phase, bool isWhitelist, uint256 points)",
  "event SeasonCreated(uint256 indexed seasonId, uint256 startTime, uint256 endTime, uint256 cfgBudget)",
  "event SeasonFinalized(uint256 indexed seasonId, uint256 totalPoints)",
];

const LP_REWARDS_ABI = [
  "event Staked(address indexed lp, uint256 amount)",
  "event Unstaked(address indexed lp, uint256 amount)",
  "event CfgRewardClaimed(address indexed lp, uint256 amount)",
  "event UsdcProfitClaimed(address indexed lp, uint256 amount)",
  "event SeasonStarted(uint256 indexed seasonId, uint256 startTime, uint256 endTime, uint256 cfgBudget, uint256 rewardRate)",
];

// ChainFundedPool — only the events we want to surface as notifications.
// Fee splits / housekeeping events are intentionally omitted so the indexer
// doesn't fan out a notification for every internal accounting change.
const POOL_ABI = [
  "event ChallengeRegistered(address indexed trader, string indexed accountId, uint256 accountSizeUsdc, uint8 phase, uint256 feeAmount, uint256 protocolRevenue, uint256 lpProfitPoolShare, uint256 lpCapitalShare, address indexed affiliate, uint256 affiliateRevenue)",
  "event Deposited(address indexed lp, uint256 usdcAmount, uint256 cfndMinted)",
  "event Withdrawn(address indexed lp, uint256 cfndBurned, uint256 usdcReturned)",
  "event ProfitClaimed(address indexed lp, uint256 amount)",
];

class CfgIndexer {
  constructor({ rpcUrl, distributorAddress, lpRewardsAddress, poolAddress, fromBlock = 0 }) {
    this._rpcUrl   = rpcUrl;
    this._fromBlk  = Number(fromBlock) || 0;
    this._provider = null;
    this._dist     = null;
    this._lp       = null;
    this._pool     = null;
    this._distAddr = distributorAddress || null;
    this._lpAddr   = lpRewardsAddress || null;
    this._poolAddr = poolAddress || null;
    this._timer    = null;
    this._stopped  = false;
    this._blockTsCache = new Map(); // blockNumber → unix seconds
  }

  start() {
    if (!this._rpcUrl) {
      console.warn("[cfgIndexer] RPC_URL not set — indexer disabled");
      return;
    }
    if (!this._distAddr && !this._lpAddr && !this._poolAddr) {
      console.warn("[cfgIndexer] No contract addresses configured — indexer disabled");
      return;
    }
    this._provider = new ethers.JsonRpcProvider(this._rpcUrl);
    if (this._distAddr) this._dist = new ethers.Contract(this._distAddr, DISTRIBUTOR_ABI, this._provider);
    if (this._lpAddr)   this._lp   = new ethers.Contract(this._lpAddr,   LP_REWARDS_ABI,   this._provider);
    if (this._poolAddr) this._pool = new ethers.Contract(this._poolAddr, POOL_ABI,         this._provider);
    console.log(`[cfgIndexer] Starting (distributor=${!!this._dist}, lpRewards=${!!this._lp}, pool=${!!this._pool})`);
    this._loop();
  }

  stop() {
    this._stopped = true;
    if (this._timer) clearTimeout(this._timer);
  }

  async _loop() {
    if (this._stopped) return;
    try {
      const head = await this._provider.getBlockNumber();
      if (this._dist) await this._syncContract("distributor", this._dist, head);
      if (this._lp)   await this._syncContract("lp_rewards",  this._lp,   head);
      if (this._pool) await this._syncContract("pool",        this._pool, head);
    } catch (err) {
      console.error("[cfgIndexer] sync error:", err.message);
    }
    if (!this._stopped) {
      this._timer = setTimeout(() => this._loop(), POLL_INTERVAL_MS);
    }
  }

  async _syncContract(label, contract, head) {
    const cursor = await this._loadCursor(label);
    let from = cursor != null ? cursor + 1 : this._fromBlk;
    if (from > head) return;

    let totalInserted = 0;
    while (from <= head && !this._stopped) {
      const to = Math.min(from + CHUNK_SIZE - 1, head);
      const logs = await this._fetchLogs(contract, from, to);
      const rows = await this._toRows(label, contract, logs);
      if (rows.length) {
        // ON CONFLICT DO NOTHING via upsert with ignoreDuplicates
        const { error } = await supabase
          .from("cfg_events")
          .upsert(rows, { onConflict: "tx_hash,log_index", ignoreDuplicates: true });
        if (error) {
          console.error(`[cfgIndexer] insert failed (${label} ${from}-${to}):`, error.message);
          return; // bail — try again next loop
        }
        totalInserted += rows.length;
        // Fire user-facing notifications for the relevant event types.
        // Best-effort; failures are swallowed inside.
        fanOutCfgEventNotifications(rows).catch(() => {});
      }
      await this._saveCursor(label, to);
      from = to + 1;
    }
    if (totalInserted > 0) {
      console.log(`[cfgIndexer] ${label}: indexed ${totalInserted} new event(s) up to block ${head}`);
    }
  }

  async _fetchLogs(contract, from, to) {
    // queryFilter with no filter returns all events the ABI knows about
    try {
      return await contract.queryFilter("*", from, to);
    } catch (err) {
      // Some RPCs reject wide ranges — narrow and retry once
      if (to - from > 1000) {
        const mid = Math.floor((from + to) / 2);
        const a = await this._fetchLogs(contract, from, mid);
        const b = await this._fetchLogs(contract, mid + 1, to);
        return [...a, ...b];
      }
      throw err;
    }
  }

  async _toRows(contractLabel, contract, logs) {
    const out = [];
    for (const log of logs) {
      // queryFilter returns parsed Log objects with `.fragment` for known events
      const ev = log.fragment;
      if (!ev) continue; // unknown / not in our ABI
      const args = log.args || {};
      const ts = await this._blockTimestamp(log.blockNumber);
      const row = {
        contract:     contractLabel,
        event_name:   ev.name,
        block_number: log.blockNumber,
        tx_hash:      log.transactionHash,
        log_index:    log.index ?? log.logIndex ?? 0,
        occurred_at:  new Date(ts * 1000).toISOString(),
        address:      null,
        amount:       null,
        season_id:    null,
        points:       null,
        args:         this._jsonifyArgs(args),
      };

      // Denormalize the fields the leaderboard queries on
      switch (ev.name) {
        case "RegistrationRecorded":
          row.address   = (args.trader || "").toLowerCase();
          row.season_id = Number(args.seasonId);
          row.points    = args.points?.toString() ?? null;
          break;
        case "Staked":
        case "Unstaked":
        case "CfgRewardClaimed":
        case "UsdcProfitClaimed":
          row.address = (args.lp || "").toLowerCase();
          row.amount  = args.amount?.toString() ?? null;
          break;
        case "SeasonStarted":
        case "SeasonCreated":
          row.season_id = Number(args.seasonId);
          break;
        case "SeasonFinalized":
          row.season_id = Number(args.seasonId);
          break;
        // Pool events
        case "Deposited":
          row.address = (args.lp || "").toLowerCase();
          row.amount  = args.usdcAmount?.toString() ?? null;
          break;
        case "Withdrawn":
          row.address = (args.lp || "").toLowerCase();
          row.amount  = args.usdcReturned?.toString() ?? null;
          break;
        case "ProfitClaimed":
          row.address = (args.lp || "").toLowerCase();
          row.amount  = args.amount?.toString() ?? null;
          break;
        case "ChallengeRegistered":
          // Address column tracks the affiliate (the recipient of any
          // notification); trader / accountSize stay in args for the
          // leaderboard's own queries.
          row.address = (args.affiliate || "").toLowerCase();
          row.amount  = args.affiliateRevenue?.toString() ?? null;
          break;
      }
      out.push(row);
    }
    return out;
  }

  _jsonifyArgs(args) {
    const out = {};
    for (const k of Object.keys(args)) {
      if (/^\d+$/.test(k)) continue; // skip positional duplicates
      const v = args[k];
      out[k] = typeof v === "bigint" ? v.toString() : v;
    }
    return out;
  }

  async _blockTimestamp(blockNumber) {
    if (this._blockTsCache.has(blockNumber)) return this._blockTsCache.get(blockNumber);
    const blk = await this._provider.getBlock(blockNumber);
    const ts  = blk?.timestamp ?? Math.floor(Date.now() / 1000);
    this._blockTsCache.set(blockNumber, ts);
    // Cap cache size
    if (this._blockTsCache.size > 10_000) {
      const first = this._blockTsCache.keys().next().value;
      this._blockTsCache.delete(first);
    }
    return ts;
  }

  async _loadCursor(contract) {
    const { data } = await supabase
      .from("cfg_indexer_cursor")
      .select("last_indexed_block")
      .eq("contract", contract)
      .maybeSingle();
    return data?.last_indexed_block != null ? Number(data.last_indexed_block) : null;
  }

  async _saveCursor(contract, blockNumber) {
    const { error } = await supabase
      .from("cfg_indexer_cursor")
      .upsert(
        { contract, last_indexed_block: blockNumber, updated_at: new Date().toISOString() },
        { onConflict: "contract" }
      );
    if (error) console.error(`[cfgIndexer] cursor save failed (${contract}):`, error.message);
  }
}

module.exports = { CfgIndexer };
