import { useState, useEffect, useCallback } from "react";
import BoltLoader from "@/components/brand/BoltLoader";
import { formatUtcDate, formatUtcTime } from "@/lib/datetime";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowUpRight,
  ArrowDownLeft,
  ExternalLink,
} from "lucide-react";
import { explorerTxUrl, chain } from "@/lib/thirdwebClient";
import { useAffiliateStats } from "@/hooks/useAffiliateStats";
import { getContract } from "thirdweb";
import { thirdwebClient } from "@/lib/thirdwebClient";

const POOL_ADDRESS = import.meta.env.VITE_REWARDS_POOL_ADDRESS;

const TOKEN_TABS = [
  { label: "All", value: "all" },
  { label: "USDC", value: "USDC" },
  { label: "CFG", value: "CFG" },
];

const TIME_FILTERS = [
  { label: "1D", days: 1 },
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "1Y", days: 365 },
  { label: "All", days: null },
];

function cutoffDate(days) {
  if (!days) return null;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function formatDate(dateStr) {
  return formatUtcDate(dateStr);
}

function formatTime(dateStr) {
  if (!dateStr) return "";
  return `${formatUtcTime(dateStr)} UTC`;
}

function shortAddr(addr) {
  if (!addr || addr.length < 12) return addr || "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Merges all transaction sources into a unified list.
 */
/**
 * Persist a wallet send to localStorage so it shows in transaction history.
 * Called by Wallet.jsx after a successful transfer.
 */
export function recordWalletSend({ token, amount, to, txHash, address }) {
  const key = "cf_wallet_sends";
  try {
    const sends = JSON.parse(localStorage.getItem(key) || "[]");
    sends.push({ token, amount, to, txHash, address, date: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(sends));
  } catch { /* ignore */ }
}

export function recordProfitClaim({ amount, txHash, address }) {
  const key = "cf_profit_claims";
  try {
    const claims = JSON.parse(localStorage.getItem(key) || "[]");
    claims.push({ amount, txHash, address, date: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(claims));
  } catch { /* ignore */ }
}

function loadWalletSends(address) {
  try {
    const sends = JSON.parse(localStorage.getItem("cf_wallet_sends") || "[]");
    return sends.filter(s => s.address?.toLowerCase() === address?.toLowerCase());
  } catch { return []; }
}

function loadProfitClaims(address) {
  try {
    const claims = JSON.parse(localStorage.getItem("cf_profit_claims") || "[]");
    return claims.filter(c => c.address?.toLowerCase() === address?.toLowerCase());
  } catch { return []; }
}

function buildTransactionList(challenges, payouts, lpPositions, affiliatePayments, profitClaims, walletSends) {
  const txs = [];

  // Challenge purchases (USDC outflow)
  for (const ch of challenges) {
    if (ch.challenge_fee_usdc > 0) {
      txs.push({
        token: "USDC", type: "Challenge Purchase",
        amount: -ch.challenge_fee_usdc,
        date: ch.created_date || ch.start_date,
        txHash: ch.fee_tx_hash,
        detail: `${ch.account_size?.toLocaleString()} account`,
      });
    }
  }

  // Payouts (USDC inflow)
  for (const p of payouts) {
    if (p.status === "settled" && p.trader_share_usdc > 0) {
      txs.push({
        token: "USDC", type: "Payout Claimed",
        amount: p.trader_share_usdc,
        date: p.requested_date || p.created_date,
        txHash: p.tx_hash,
        detail: `Profit: ${p.gross_profit_usdc?.toFixed(2)} USDC`,
      });
    }
  }

  // LP Deposits / Withdrawals (USDC)
  for (const lp of lpPositions) {
    if (lp.usdc_deposited > 0) {
      txs.push({
        token: "USDC", type: "LP Deposit",
        amount: -lp.usdc_deposited,
        date: lp.deposit_date || lp.created_date,
        txHash: lp.deposit_tx_hash,
        detail: `${lp.cfnd_tokens?.toFixed(2)} CFND received`,
      });
    }
    if (lp.status === "withdrawn" && lp.withdraw_tx_hash) {
      txs.push({
        token: "USDC", type: "LP Withdrawal",
        amount: lp.usdc_deposited,
        date: lp.withdraw_date || lp.created_date,
        txHash: lp.withdraw_tx_hash,
        detail: `${lp.cfnd_tokens?.toFixed(2)} CFND burned`,
      });
    }
  }

  // Affiliate commissions (USDC inflow)
  for (const ap of affiliatePayments) {
    if (ap.amountUsdc > 0) {
      txs.push({
        token: "USDC", type: "Affiliate Commission",
        amount: ap.amountUsdc,
        date: ap.seenAt ? new Date(ap.seenAt).toISOString() : null,
        txHash: ap.txHash,
        detail: `${ap.feeUsdc?.toFixed(2)} USDC referral fee`,
      });
    }
  }

  // LP Profit Claims (USDC inflow)
  for (const pc of profitClaims) {
    txs.push({
      token: "USDC", type: "LP Profit Claimed",
      amount: pc.amountUsdc,
      date: pc.date || null,
      txHash: pc.txHash,
      detail: "Pool profit distribution",
    });
  }

  // Wallet sends (recorded locally when user sends via platform UI)
  for (const s of walletSends) {
    txs.push({
      token: s.token, type: `${s.token} Sent`,
      amount: -Math.abs(s.amount),
      date: s.date,
      txHash: s.txHash,
      detail: `To ${shortAddr(s.to)}`,
    });
  }

  // Sort newest first — entries without dates go to the end
  txs.sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return db - da;
  });

  return txs;
}

export default function TransactionHistory({ address }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState(5); // default: All
  const [tokenTab, setTokenTab] = useState("all");
  const affiliateStats = useAffiliateStats(address);

  const fetchHistory = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const [challenges, payouts, lpPositions] = await Promise.all([
        base44.entities.ChallengeAccount.filter({ trader_address: address }, "-created_date").catch(() => []),
        base44.entities.Payout.filter({ trader_address: address }, "-created_date").catch(() => []),
        base44.entities.LPPosition.filter({ lp_address: address }, "-created_date").catch(() => []),
      ]);

      const profitClaims = loadProfitClaims(address).map(c => ({
        amountUsdc: c.amount,
        txHash: c.txHash,
        date: c.date,
      }));
      const walletSends = loadWalletSends(address);

      const allTxs = buildTransactionList(
        Array.isArray(challenges) ? challenges : [],
        Array.isArray(payouts) ? payouts : [],
        Array.isArray(lpPositions) ? lpPositions : [],
        affiliateStats.payments || [],
        profitClaims,
        walletSends,
      );
      setTransactions(allTxs);
    } catch (err) {
      console.error("Failed to load transaction history:", err);
    } finally {
      setLoading(false);
    }
  }, [address, affiliateStats.payments]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // Apply token + time filters
  // Entries without dates only show when time filter is "All"
  const filter = TIME_FILTERS[selectedFilter];
  const cutoff = cutoffDate(filter.days);
  const filtered = transactions.filter((tx) => {
    if (tokenTab !== "all" && tx.token !== tokenTab) return false;
    if (!tx.date) return !cutoff; // no date → only show in "All"
    if (cutoff && new Date(tx.date) < new Date(cutoff)) return false;
    return true;
  });

  // Summary
  const totalIn = filtered.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalOut = filtered.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  const netFlow = totalIn + totalOut;
  const summarySymbol = tokenTab === "all" ? "" : ` ${tokenTab}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Transaction History</h2>
        <div className="flex gap-3">
          {/* Token tabs */}
          <div className="flex gap-0.5 p-0.5 bg-muted rounded-md">
            {TOKEN_TABS.map((t) => (
              <Button
                key={t.value}
                variant={tokenTab === t.value ? "default" : "ghost"}
                size="sm"
                className={`text-xs h-7 px-2.5 ${tokenTab === t.value ? "bg-primary text-primary-foreground" : ""}`}
                onClick={() => setTokenTab(t.value)}
              >
                {t.label}
              </Button>
            ))}
          </div>
          {/* Time filters */}
          <div className="flex gap-1">
            {TIME_FILTERS.map((f, i) => (
              <Button
                key={f.label}
                variant={selectedFilter === i ? "default" : "ghost"}
                size="sm"
                className={`text-xs h-7 px-2 ${selectedFilter === i ? "bg-primary text-primary-foreground" : ""}`}
                onClick={() => setSelectedFilter(i)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary row */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card/50 border border-border rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">In</p>
            <p className="text-sm font-semibold text-green-400">+{totalIn.toFixed(2)}{summarySymbol}</p>
          </div>
          <div className="bg-card/50 border border-border rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">Out</p>
            <p className="text-sm font-semibold text-red-400">{totalOut.toFixed(2)}{summarySymbol}</p>
          </div>
          <div className="bg-card/50 border border-border rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">Net</p>
            <p className={`text-sm font-semibold ${netFlow >= 0 ? "text-green-400" : "text-red-400"}`}>
              {netFlow >= 0 ? "+" : ""}{netFlow.toFixed(2)}{summarySymbol}
            </p>
          </div>
        </div>
      )}

      {/* Transaction list */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <BoltLoader className="w-5 h-5 mr-2" /> Loading transactions...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No transactions found{tokenTab !== "all" ? ` for ${tokenTab}` : ""}{filter.days ? ` in the last ${filter.days} day${filter.days > 1 ? "s" : ""}` : ""}.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((tx, i) => (
            <Card key={`${tx.txHash || ""}-${i}`} className="border-border">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    tx.amount >= 0 ? "bg-green-500/10" : "bg-red-500/10"
                  }`}>
                    {tx.amount >= 0
                      ? <ArrowDownLeft className="w-4 h-4 text-green-400" />
                      : <ArrowUpRight className="w-4 h-4 text-red-400" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{tx.type}</p>
                      {tx.txHash && (
                        <a
                          href={explorerTxUrl(tx.txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground/50 hover:text-primary"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {tx.detail} · {formatDate(tx.date)} {formatTime(tx.date)}
                    </p>
                  </div>
                  <p className={`text-sm font-mono font-semibold shrink-0 ${
                    tx.amount >= 0 ? "text-green-400" : "text-red-400"
                  }`}>
                    {tx.amount >= 0 ? "+" : ""}{tx.amount.toFixed(2)} {tx.token}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
