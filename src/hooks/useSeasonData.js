import { useState, useEffect, useCallback } from "react";
import { readContract, getContract } from "thirdweb";
import { thirdwebClient, chain } from "@/lib/thirdwebClient";

const DISTRIBUTOR_ADDRESS = import.meta.env.VITE_CFG_DISTRIBUTOR_ADDRESS;
const LP_REWARDS_ADDRESS  = import.meta.env.VITE_CFG_LP_REWARDS_ADDRESS;
const CFG_TOKEN_ADDRESS   = import.meta.env.VITE_CFG_TOKEN_ADDRESS;
const POOL_ADDRESS        = import.meta.env.VITE_REWARDS_POOL_ADDRESS;

/**
 * Reads season state from CFGDistributor and CFGLPRewards contracts.
 * Provides the data needed by SeasonIndicator, SeasonBanner, TradingRewards, and LpStaking.
 *
 * @param {string|null} userAddress - Connected wallet address
 */
export default function useSeasonData(userAddress = null) {
  const [state, setState] = useState({
    // Season info (shared — both contracts use the same season timeline)
    activeSeason: null,
    seasonCount: null,
    seasonStart: null,
    seasonEnd: null,
    seasonBudgetTrader: null,
    seasonBudgetLp: null,

    // Between-season state
    nextSeasonId: null,
    nextSeasonStart: null,
    lastSeasonId: null,
    lastSeasonEnd: null,
    allSeasonsComplete: false,

    // Most recent ended season (results panel) + ended seasons nobody has finalized yet
    lastEndedSeason: null,   // { id, endTime, cfgBudget, totalPoints, finalized }
    pendingFinalize: [],     // [{ id, endTime, cfgBudget, totalPoints }]

    // Trader (CFGDistributor)
    traderTotalPoints: null,
    traderRegs: [],
    traderPoints: null,
    traderClaimable: [],   // [{ seasonId, cfgAmount, points }]
    traderPendingFinalize: [], // [{ seasonId, cfgAmount, points }] — claimable once finalizeSeason() is called

    // LP staking (CFGLPRewards)
    totalStaked: null,
    userStaked: null,
    earnedCfg: null,
    earnedUsdc: null,
    rewardRate: null,
    pendingUsdcHarvest: null, // unharvested USDC in the pool for the staking contract

    // User CFG balance
    cfgBalance: null,

    loading: true,
    error: null,
  });

  const fetchData = useCallback(async () => {
    if (!DISTRIBUTOR_ADDRESS && !LP_REWARDS_ADDRESS) {
      setState(s => ({ ...s, loading: false, error: "CFG reward contracts not configured." }));
      return;
    }

    try {
      const results = {};

      // ── Run all three contract groups in parallel ───────────────────────
      const distributorPromise = (async () => {
        if (!DISTRIBUTOR_ADDRESS) return;
        const dist = getContract({ client: thirdwebClient, chain, address: DISTRIBUTOR_ADDRESS });

        const [activeSeason, seasonCount] = await Promise.all([
          readContract({ contract: dist, method: "function activeSeason() view returns (uint256)" }),
          readContract({ contract: dist, method: "function seasonCount() view returns (uint256)" }),
        ]);

        results.activeSeason = Number(activeSeason);
        results.seasonCount = Number(seasonCount);

        // Fetch active season details
        if (results.activeSeason > 0) {
          const season = await readContract({
            contract: dist,
            method: "function seasons(uint256) view returns (uint256 startTime, uint256 endTime, uint256 cfgBudget, uint256 totalPoints, bool finalized)",
            params: [BigInt(results.activeSeason)],
          });
          results.seasonStart = Number(season[0]);
          results.seasonEnd = Number(season[1]);
          results.seasonBudgetTrader = season[2];
          results.traderTotalPoints = season[3];
        } else if (results.seasonCount > 0) {
          // No active season — fetch ALL seasons in parallel to find next/last
          const now = Math.floor(Date.now() / 1000);
          const seasonPromises = [];
          for (let i = 1; i <= results.seasonCount; i++) {
            seasonPromises.push(
              readContract({
                contract: dist,
                method: "function seasons(uint256) view returns (uint256 startTime, uint256 endTime, uint256 cfgBudget, uint256 totalPoints, bool finalized)",
                params: [BigInt(i)],
              }).then(s => ({ id: i, start: Number(s[0]), end: Number(s[1]), finalized: s[4] }))
            );
          }
          const allSeasons = await Promise.all(seasonPromises);
          for (const s of allSeasons) {
            if (!results.nextSeasonId && now < s.start) {
              results.nextSeasonId = s.id;
              results.nextSeasonStart = s.start;
              break;
            }
            results.lastSeasonId = s.id;
            results.lastSeasonEnd = s.end;
            results.lastSeasonFinalized = s.finalized;
          }
          if (!results.nextSeasonId) {
            results.allSeasonsComplete = results.lastSeasonFinalized &&
              results.lastSeasonId === results.seasonCount;
          }
        }

        // Ended seasons: the latest one feeds the results panel, and any that are
        // still unfinalized block claims (previewClaim returns 0 until someone
        // calls the permissionless finalizeSeason()).
        if (results.seasonCount > 0) {
          const nowSec = Math.floor(Date.now() / 1000);
          const lastCandidate = results.activeSeason > 0 ? results.activeSeason - 1 : results.seasonCount;
          const pastReads = [];
          for (let i = 1; i <= lastCandidate; i++) {
            pastReads.push(
              readContract({
                contract: dist,
                method: "function seasons(uint256) view returns (uint256 startTime, uint256 endTime, uint256 cfgBudget, uint256 totalPoints, bool finalized)",
                params: [BigInt(i)],
              }).then(s => ({ id: i, endTime: Number(s[1]), cfgBudget: s[2], totalPoints: s[3], finalized: s[4] }))
            );
          }
          const ended = (await Promise.all(pastReads)).filter(s => s.endTime <= nowSec);
          results.lastEndedSeason = ended.length ? ended[ended.length - 1] : null;
          results.pendingFinalize = ended.filter(s => !s.finalized && s.totalPoints > 0n);
        }

        // User-specific data: registrations + claimable seasons in parallel
        if (userAddress) {
          const userPromises = [];
          results.traderPendingFinalize = [];

          // Trader registrations for active season
          if (results.activeSeason > 0) {
            userPromises.push(
              (async () => {
                const regIds = await readContract({
                  contract: dist,
                  method: "function getTraderRegistrations(uint256, address) view returns (uint256[])",
                  params: [BigInt(results.activeSeason), userAddress],
                });
                // Fetch all registrations in parallel
                const regs = await Promise.all(
                  regIds.map(regId =>
                    readContract({
                      contract: dist,
                      method: "function registrations(uint256) view returns (address trader, uint256 accountSizeUsdc, uint8 phase, bool isWhitelist, uint256 points, uint256 seasonId, bool claimed)",
                      params: [regId],
                    }).then(reg => ({ points: reg[4], claimed: reg[6] }))
                  )
                );
                results.traderPoints = regs.reduce((sum, r) => r.claimed ? sum : sum + r.points, 0n);
                results.traderRegs = regIds;
              })()
            );
          }

          // Claimable past seasons — all in parallel
          if (results.seasonCount > 0) {
            userPromises.push(
              (async () => {
                const claimPromises = [];
                for (let i = 1; i <= results.seasonCount; i++) {
                  if (i === results.activeSeason) continue;
                  claimPromises.push(
                    readContract({
                      contract: dist,
                      method: "function previewClaim(uint256, address) view returns (uint256 cfgAmount, uint256 traderPoints)",
                      params: [BigInt(i), userAddress],
                    }).then(([cfgAmount, points]) =>
                      cfgAmount > 0n ? { seasonId: i, cfgAmount, points } : null
                    ).catch(() => null)
                  );
                }
                results.traderClaimable = (await Promise.all(claimPromises)).filter(Boolean);
              })()
            );
          }

          // Unfinalized ended seasons — estimate the trader's share so the UI can
          // offer "Finalize & claim" instead of hiding their rewards.
          if (results.pendingFinalize?.length) {
            userPromises.push(
              (async () => {
                const pending = await Promise.all(results.pendingFinalize.map(async (s) => {
                  const regIds = await readContract({
                    contract: dist,
                    method: "function getTraderRegistrations(uint256, address) view returns (uint256[])",
                    params: [BigInt(s.id), userAddress],
                  });
                  const regs = await Promise.all(regIds.map(regId =>
                    readContract({
                      contract: dist,
                      method: "function registrations(uint256) view returns (address trader, uint256 accountSizeUsdc, uint8 phase, bool isWhitelist, uint256 points, uint256 seasonId, bool claimed)",
                      params: [regId],
                    })
                  ));
                  const points = regs.reduce((sum, r) => r[6] ? sum : sum + r[4], 0n);
                  return points > 0n
                    ? { seasonId: s.id, points, cfgAmount: (points * s.cfgBudget) / s.totalPoints }
                    : null;
                }));
                results.traderPendingFinalize = pending.filter(Boolean);
              })()
            );
          }

          await Promise.all(userPromises);
        }
      })();

      const lpPromise = (async () => {
        if (!LP_REWARDS_ADDRESS) return;
        const lp = getContract({ client: thirdwebClient, chain, address: LP_REWARDS_ADDRESS });

        const [totalStaked, rewardRate] = await Promise.all([
          readContract({ contract: lp, method: "function totalStaked() view returns (uint256)" }),
          readContract({ contract: lp, method: "function currentRewardRate() view returns (uint256)" }),
        ]);

        results.totalStaked = totalStaked;
        results.rewardRate = rewardRate;

        // If we don't have season info from distributor, get it from LP rewards
        if (!results.activeSeason) {
          const [activeSeason, seasonCount] = await Promise.all([
            readContract({ contract: lp, method: "function activeSeason() view returns (uint256)" }),
            readContract({ contract: lp, method: "function seasonCount() view returns (uint256)" }),
          ]);
          results.activeSeason = Number(activeSeason);
          results.seasonCount = Number(seasonCount);

          if (results.activeSeason > 0) {
            const season = await readContract({
              contract: lp,
              method: "function seasons(uint256) view returns (uint256 startTime, uint256 endTime, uint256 cfgBudget, uint256 rewardRate)",
              params: [BigInt(results.activeSeason)],
            });
            results.seasonStart = Number(season[0]);
            results.seasonEnd = Number(season[1]);
            results.seasonBudgetLp = season[2];
          }
        } else if (results.activeSeason > 0) {
          try {
            const season = await readContract({
              contract: lp,
              method: "function seasons(uint256) view returns (uint256 startTime, uint256 endTime, uint256 cfgBudget, uint256 rewardRate)",
              params: [BigInt(results.activeSeason)],
            });
            results.seasonBudgetLp = season[2];
          } catch { /* LP rewards may not have this season */ }
        }

        // User LP data
        if (userAddress) {
          const [userStaked, earnedCfg, earnedUsdc] = await Promise.all([
            readContract({ contract: lp, method: "function stakedBalance(address) view returns (uint256)", params: [userAddress] }),
            readContract({ contract: lp, method: "function earnedCfg(address) view returns (uint256)", params: [userAddress] }),
            readContract({ contract: lp, method: "function earnedUsdc(address) view returns (uint256)", params: [userAddress] }),
          ]);
          results.userStaked = userStaked;
          results.earnedCfg = earnedCfg;
          results.earnedUsdc = earnedUsdc;
        }

        // Read unharvested USDC profit sitting in the pool for the staking contract
        if (POOL_ADDRESS && results.totalStaked && results.totalStaked > 0n) {
          try {
            const poolContract = getContract({ client: thirdwebClient, chain, address: POOL_ADDRESS });
            results.pendingUsdcHarvest = await readContract({
              contract: poolContract,
              method: "function pendingProfit(address lp) view returns (uint256)",
              params: [LP_REWARDS_ADDRESS],
            });
          } catch { /* pool may not support this */ }
        }
      })();

      const cfgPromise = (async () => {
        if (!userAddress || !CFG_TOKEN_ADDRESS) return;
        const cfgToken = getContract({ client: thirdwebClient, chain, address: CFG_TOKEN_ADDRESS });
        results.cfgBalance = await readContract({
          contract: cfgToken,
          method: "function balanceOf(address) view returns (uint256)",
          params: [userAddress],
        });
      })();

      // Distributor first (sets activeSeason), then LP + CFG in parallel
      await distributorPromise;
      await Promise.all([lpPromise, cfgPromise]);

      setState(s => ({ ...s, ...results, loading: false, error: null }));
    } catch (e) {
      console.error("useSeasonData error:", e);
      setState(s => ({ ...s, loading: false, error: e.message }));
    }
  }, [userAddress]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // poll every 10s
    return () => clearInterval(interval);
  }, [fetchData]);

  return { ...state, refetch: fetchData };
}
