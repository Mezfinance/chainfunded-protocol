import { useState, useEffect, useCallback } from 'react';
import { readContract, getContract } from 'thirdweb';
import { ethereum, sepolia } from 'thirdweb/chains';
import { thirdwebClient } from '@/lib/thirdwebClient';
import { base44 } from '@/api/base44Client';

/**
 * OFAC Sanctions Screening Hook
 *
 * Three-layer screening (checked in order):
 *   1. Hardcoded OFAC SDN addresses (instant, zero latency)
 *   2. Chainalysis On-Chain Oracle (free, permissionless, no API key)
 *      Contract: 0x40C57923924B5c5c5455c48D93317139ADDaC8fb
 *      Deployed on Ethereum mainnet — we read from mainnet regardless
 *      of which chain the app is deployed on.
 *   3. Chainalysis Sanctions API via backend function (API key is server-side
 *      only — never exposed in the client bundle). See base44/functions/checkOFAC/.
 *
 * Mirrors the Uniswap Labs approach: screening at the frontend/interface layer,
 * not at the protocol layer. The smart contract remains permissionless.
 */

// Chainalysis On-Chain Oracle — deployed on Ethereum mainnet
// Same address on Ethereum, Polygon, BSC, Avalanche, Optimism, Arbitrum, Celo
const ORACLE_ADDRESS = '0x40C57923924B5c5c5455c48D93317139ADDaC8fb';

// Layer 3 now uses a backend function (base44/functions/checkOFAC) so the
// Chainalysis API key is never in the client bundle. See FE-M-01 in pentest.

// Hardcoded OFAC-sanctioned Ethereum addresses
// Source: https://www.treasury.gov/ofac/downloads/sdnlist.txt
const HARDCODED_SANCTIONED = new Set([
  // Tornado Cash (OFAC sanctioned August 2022)
  '0x8589427373d6d84e98730d7795d8f6f8731fda16',
  '0x722122df12d4e14e13ac3b6895a86e84145b6967',
  '0xdd4c48c0b24039969fc16d1cdf626eab821d3384',
  '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b',
  '0xd96f2b1ef7ed56cb62ea5e1270e59e72f9a7be30',
  '0x4736dcf1b7a3d580672cce6e7c65cd5cc9cfbfa9',
  '0xd4b88df4d29f5cedd6857912842cff3b20c8cfa3',
  '0x910cbd523d972eb0a6f4cae4618ad62622b39dbf',
  '0xa160cdab225685da1d56aa342ad8841c3b53f291',
  '0xfd8610d20aa15b7b2e3be39b396a1bc3516c7144',
  '0xf60dd140cff0706bae9cd734ac3683550e9065d0',
  '0x22aaa7720ddd5388a3c0a3333430953c68f1849b',
  '0xba214c1c1928a32bffe790263e38b4af9bfcd659',
  '0xb1c8094b234dce6e03f10a5b673c1d8c69739a00',
  '0x527653ea119f3e6a1f5bd18fbf4714081d7b31ce',
  '0x58e8dcc13be9780fc42e8723d8ead4cf46943df2',
  '0xd691f27f38b395864ea86cfc7253969b409c362d',
  '0xaeaac358560e11f52454d997aaff2c5731b6f8a6',
  '0x1356c899d8c9467c7f71c195612f8a395abf2f0a',
  '0xa7e5d5a720f06526557c513402f2e6b5fa20b008',
  // Lazarus Group (North Korea)
  '0x098b716b8aaf21512996dc57eb0615e2383e2f96',
  '0xa0e1c89ef1a489c9c7de96311ed5ce5d32c20e4b',
  '0x3cffd56b47b7b41c56258d9c7731abadc360e460',
  '0x53b6936513e738f44fb50d2b9476730c0ab3bfc1',
]);

// Cache results in sessionStorage (1 hour TTL)
const CACHE_KEY = 'cf_ofac_screen';
const CACHE_TTL = 3600000;

function getCachedResult(address) {
  try {
    const cached = sessionStorage.getItem(`${CACHE_KEY}_${address.toLowerCase()}`);
    if (!cached) return null;
    const { result, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_TTL) {
      sessionStorage.removeItem(`${CACHE_KEY}_${address.toLowerCase()}`);
      return null;
    }
    return result;
  } catch {
    return null;
  }
}

function setCachedResult(address, result) {
  try {
    sessionStorage.setItem(
      `${CACHE_KEY}_${address.toLowerCase()}`,
      JSON.stringify({ result, timestamp: Date.now() })
    );
  } catch {
    // sessionStorage unavailable; fail silently
  }
}

/**
 * Check the Chainalysis On-Chain Oracle (Ethereum mainnet).
 * Returns true if sanctioned, false if clean, null if call failed.
 */
async function checkOnChainOracle(addr) {
  try {
    const oracle = getContract({
      client: thirdwebClient,
      chain: ethereum,
      address: ORACLE_ADDRESS,
    });

    const result = await readContract({
      contract: oracle,
      method: 'function isSanctioned(address addr) external view returns (bool)',
      params: [addr],
    });

    return result;
  } catch (err) {
    console.warn('[OFAC] On-chain oracle call failed:', err.message);
    return null; // null = unknown, try next method
  }
}

/**
 * Check the Chainalysis REST API via server-side backend function.
 * The API key is stored server-side (CHAINALYSIS_API_KEY env var in Base44),
 * never exposed in the client bundle.
 * Returns true if sanctioned, false if clean, null if unavailable.
 */
async function checkChainalysisAPI(addr) {
  try {
    const resp = await base44.functions.invoke("checkOFAC", { address: addr });
    if (resp && resp.sanctioned !== undefined && resp.sanctioned !== null) {
      return resp.sanctioned;
    }
    return null; // API unavailable or not configured — fall back
  } catch (err) {
    console.warn('[OFAC] Chainalysis API backend unavailable:', err.message);
    return null;
  }
}

export function useOFACScreening(address) {
  const [isSanctioned, setIsSanctioned] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState(null);

  const checkAddress = useCallback(async (addr) => {
    if (!addr) {
      setIsSanctioned(false);
      setIsChecking(false);
      return;
    }

    const normalised = addr.toLowerCase();

    // Layer 1: Hardcoded list (instant)
    if (HARDCODED_SANCTIONED.has(normalised)) {
      setIsSanctioned(true);
      setIsChecking(false);
      setCachedResult(normalised, true);
      return;
    }

    // Check cache
    const cached = getCachedResult(normalised);
    if (cached !== null) {
      setIsSanctioned(cached);
      setIsChecking(false);
      return;
    }

    setIsChecking(true);
    setError(null);

    try {
      // Layer 2: On-chain oracle (Chainalysis, Ethereum mainnet)
      const oracleResult = await checkOnChainOracle(addr);
      if (oracleResult !== null) {
        setIsSanctioned(oracleResult);
        setCachedResult(normalised, oracleResult);
        setIsChecking(false);
        if (oracleResult) return; // Sanctioned — no need for further checks
      }

      // Layer 3: Chainalysis REST API (if key is configured)
      const apiResult = await checkChainalysisAPI(addr);
      if (apiResult !== null) {
        setIsSanctioned(apiResult);
        setCachedResult(normalised, apiResult);
        setIsChecking(false);
        return;
      }

      // Both oracle and API unavailable — fall back to hardcoded only (already checked)
      if (oracleResult === null && apiResult === null) {
        setError('All screening methods unavailable — using hardcoded list only');
      }
      setIsSanctioned(false);
      setCachedResult(normalised, false);
    } catch (err) {
      console.warn('[OFAC] Screening error:', err.message);
      setIsSanctioned(false);
      setError(err.message);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkAddress(address);
  }, [address, checkAddress]);

  return { isSanctioned, isChecking, error };
}
