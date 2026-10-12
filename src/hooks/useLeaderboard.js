import { useState, useEffect } from "react";
import { getContract, getContractEvents, prepareEvent, readContract } from "thirdweb";
import { thirdwebClient, chain } from "@/lib/thirdwebClient";
import { supabase } from "@/lib/supabaseClient";

const DISTRIBUTOR_ADDRESS = import.meta.env.VITE_CFG_DISTRIBUTOR_ADDRESS;
const LP_REWARDS_ADDRESS  = import.meta.env.VITE_CFG_LP_REWARDS_ADDRESS;

const registrationRecordedEvent = prepareEvent({
  signature:
    "event RegistrationRecorded(uint256 indexed regId, uint256 indexed seasonId, address indexed trader, string accountId, uint256 accountSizeUsdc, uint8 phase, bool isWhitelist, uint256 points)",
});

const cfgRewardClaimedEvent = prepareEvent({
  signature: "event CfgRewardClaimed(address indexed lp, uint256 amount)",
});

const stakedEvent = prepareEvent({
  signature: "event Staked(address indexed lp, uint256 amount)",
});

/**
 * Aggregates leaderboards for traders (CFG points) and LPs (CFG claimed
 * or current stake). Reads from the indexed `cfg_events` Supabase table
 * when available; falls back to on-chain getContractEvents if the table
 * is empty (indexer hasn't caught up or env not configured).
 *
 * @param {object}  opts
 * @param {"all"|"season"} opts.scope         — "all" lifetime · "season" active season only
 * @param {number|null}    opts.activeSeason  — required when scope === "season"
 * @param {number|null}    opts.seasonStartTs — unix seconds; for LP per-season filtering
 */
export default function useLeaderboard({ scope = "all", activeSeason = null, seasonStartTs = null }) {
  const [state, setState] = useState({
    traders: [], // [{ address, points: bigint }]
    lps:     [], // [{ address, value: bigint, label: string }]
    loading: true,
    error:   null,
    source:  null, // 'indexer' | 'chain'
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const indexed = await loadFromIndexer({ scope, activeSeason, seasonStartTs });
        if (cancelled) return;
        if (indexed && (indexed.traders.length || indexed.lps.length)) {
          setState({ ...indexed, loading: false, error: null, source: "indexer" });
          return;
        }
        // Indexer empty → fall back to direct chain queries (slower)
        const chainData = await loadFromChain({ scope, activeSeason });
        if (cancelled) return;
        setState({ ...chainData, loading: false, error: null, source: "chain" });
      } catch (e) {
        if (cancelled) return;
        console.error("useLeaderboard error:", e);
        setState(s => ({ ...s, loading: false, error: e.message }));
      }
    })();
    return () => { cancelled = true; };
  }, [scope, activeSeason, seasonStartTs]);

  return state;
}

// ── Indexer (cfg_events Supabase table) ──────────────────────────────────────

async function loadFromIndexer({ scope, activeSeason, seasonStartTs }) {
  // Trader: aggregate points from RegistrationRecorded
  const traderQuery = supabase
    .from("cfg_events")
    .select("address, points, season_id")
    .eq("contract", "distributor")
    .eq("event_name", "RegistrationRecorded")
    .not("address", "is", null);
  if (scope === "season" && activeSeason) {
    traderQuery.eq("season_id", Number(activeSeason));
  }
  const { data: traderRows, error: traderErr } = await traderQuery;
  if (traderErr) throw traderErr;

  const traderMap = new Map();
  for (const r of traderRows || []) {
    const v = BigInt(r.points || 0);
    traderMap.set(r.address, (traderMap.get(r.address) || 0n) + v);
  }
  const traders = [...traderMap.entries()]
    .map(([address, points]) => ({ address, points }))
    .sort((a, b) => (b.points > a.points ? 1 : b.points < a.points ? -1 : 0))
    .slice(0, 10);

  // LP: rank by CFG earned = claimed (from events) + currently unclaimed
  // (from contract earnedCfg). For season scope, claimed events are filtered
  // to the season window; earnedCfg always reflects unclaimed-since-last-
  // claim, which is in-season as long as the season is active.
  const lpQuery = supabase
    .from("cfg_events")
    .select("address, amount, occurred_at")
    .eq("contract", "lp_rewards")
    .in("event_name", ["CfgRewardClaimed", "Staked"])
    .not("address", "is", null);
  if (scope === "season" && seasonStartTs) {
    // Pull all stake events (so we know who's an LP) but only count claims
    // that occurred during the season. Filter claims in JS below.
  }
  const { data: lpRows, error: lpErr } = await lpQuery;
  if (lpErr) throw lpErr;

  const claimedMap = new Map();   // every LP address that has staked
  const seasonStartIso = scope === "season" && seasonStartTs
    ? new Date(seasonStartTs * 1000).toISOString()
    : null;
  for (const r of lpRows || []) {
    if (!claimedMap.has(r.address)) claimedMap.set(r.address, 0n);
    if (r.amount && r.occurred_at) {
      // Only CfgRewardClaimed rows have amount populated for our purposes
      // here; Staked rows contribute address membership only.
      if (!seasonStartIso || r.occurred_at >= seasonStartIso) {
        claimedMap.set(r.address, claimedMap.get(r.address) + BigInt(r.amount));
      }
    }
  }

  // Add live unclaimed earnings from the contract for every known LP.
  const unclaimedMap = LP_REWARDS_ADDRESS
    ? await fetchUnclaimedCfg([...claimedMap.keys()])
    : new Map();

  const lps = [...claimedMap.keys()]
    .map(address => {
      const claimed   = claimedMap.get(address)   || 0n;
      const unclaimed = unclaimedMap.get(address) || 0n;
      return { address, value: claimed + unclaimed, label: "earned" };
    })
    .filter(r => r.value > 0n)
    .sort((a, b) => (b.value > a.value ? 1 : b.value < a.value ? -1 : 0))
    .slice(0, 10);

  return { traders, lps };
}

async function fetchUnclaimedCfg(addresses) {
  const out = new Map();
  if (!addresses.length) return out;
  const lp = getContract({ client: thirdwebClient, chain, address: LP_REWARDS_ADDRESS });
  const results = await Promise.all(addresses.map(addr =>
    readContract({
      contract: lp,
      method:   "function earnedCfg(address) view returns (uint256)",
      params:   [addr],
    }).then(v => [addr, BigInt(v || 0)])
      .catch(() => [addr, 0n])
  ));
  for (const [addr, v] of results) out.set(addr, v);
  return out;
}

// ── On-chain fallback (used when indexer hasn't caught up) ───────────────────

async function loadFromChain({ scope, activeSeason }) {
  const tasks = [];

  if (DISTRIBUTOR_ADDRESS) {
    const dist = getContract({ client: thirdwebClient, chain, address: DISTRIBUTOR_ADDRESS });
    tasks.push((async () => {
      const events = await getContractEvents({ contract: dist, events: [registrationRecordedEvent] }).catch(() => []);
      const filtered = scope === "season" && activeSeason
        ? events.filter(e => Number(e.args?.seasonId) === Number(activeSeason))
        : events;
      const byTrader = new Map();
      for (const e of filtered) {
        const t = (e.args?.trader || "").toLowerCase();
        const p = e.args?.points ?? 0n;
        if (!t) continue;
        byTrader.set(t, (byTrader.get(t) || 0n) + BigInt(p));
      }
      return [...byTrader.entries()]
        .map(([address, points]) => ({ address, points }))
        .sort((a, b) => (b.points > a.points ? 1 : b.points < a.points ? -1 : 0))
        .slice(0, 10);
    })());
  } else {
    tasks.push(Promise.resolve([]));
  }

  if (LP_REWARDS_ADDRESS) {
    const lp = getContract({ client: thirdwebClient, chain, address: LP_REWARDS_ADDRESS });
    tasks.push((async () => {
      // Discover every LP (anyone who's ever staked) and sum their claimed
      // CFG. Add live unclaimed earnedCfg for the "earned" total.
      const [stakedEvents, claimEvents] = await Promise.all([
        getContractEvents({ contract: lp, events: [stakedEvent] }).catch(() => []),
        getContractEvents({ contract: lp, events: [cfgRewardClaimedEvent] }).catch(() => []),
      ]);
      const lps = new Set([
        ...stakedEvents.map(e => (e.args?.lp || "").toLowerCase()),
        ...claimEvents.map(e => (e.args?.lp || "").toLowerCase()),
      ].filter(Boolean));

      // Claimed CFG (filter to active season window when applicable)
      const claimed = new Map();
      for (const e of claimEvents) {
        const a = (e.args?.lp || "").toLowerCase();
        if (!a) continue;
        // For season scope, the on-chain fallback can't easily filter by
        // block timestamp without an extra call per event — leave it
        // unfiltered (acceptable since this path only runs while the
        // indexer is empty).
        claimed.set(a, (claimed.get(a) || 0n) + BigInt(e.args?.amount ?? 0n));
      }

      // Live unclaimed
      const earned = await Promise.all([...lps].map(addr =>
        readContract({
          contract: lp,
          method:   "function earnedCfg(address) view returns (uint256)",
          params:   [addr],
        }).then(v => [addr, BigInt(v || 0)])
          .catch(() => [addr, 0n])
      ));
      const earnedMap = new Map(earned);

      return [...lps]
        .map(address => ({
          address,
          value: (claimed.get(address) || 0n) + (earnedMap.get(address) || 0n),
          label: "earned",
        }))
        .filter(r => r.value > 0n)
        .sort((a, b) => (b.value > a.value ? 1 : b.value < a.value ? -1 : 0))
        .slice(0, 10);
    })());
  } else {
    tasks.push(Promise.resolve([]));
  }

  const [traders, lps] = await Promise.all(tasks);
  return { traders, lps };
}
