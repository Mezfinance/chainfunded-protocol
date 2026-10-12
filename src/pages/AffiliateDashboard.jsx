import SEO from "@/components/SEO";
import BoltLoader from "@/components/brand/BoltLoader";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { walletToCode } from "@/lib/affiliateCode";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Copy,
  CheckCircle2,
  Wallet,
  DollarSign,
  TrendingUp,
  Zap,
  ExternalLink,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";
import { useConnectModal } from "thirdweb/react";
import { thirdwebClient, chain, wallets, appMetadata, explorerTxUrl } from "@/lib/thirdwebClient";
import { useAffiliateStats } from "@/hooks/useAffiliateStats";
import {
  AFFILIATE_TIERS,
  getTierForVolume,
  getNextTier,
  volumeToNextTier,
} from "@/data/affiliateTiers";
import MarketingKit from "@/components/affiliate/MarketingKit";

// ─── localStorage key for join state ─────────────────────────────────────────
const STORAGE_KEY = "cf_affiliates_v1";
function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
}
function saveStore(store) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* ignore */ }
}

function fmt(n) {
  return n == null ? "—" : `$${n.toFixed(2)}`;
}
function fmtVolume(n) {
  if (n == null) return "—";
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, loading, highlight }) {
  return (
    <Card className={`border-border ${highlight ? "border-primary/40 bg-primary/5" : ""}`}>
      <CardContent className="pt-5 pb-4 flex items-center gap-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${highlight ? "bg-primary/20" : "bg-primary/10"}`}>
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          {loading
            ? <div className="h-6 w-20 bg-secondary rounded animate-pulse mt-1" />
            : <p className={`text-xl font-grotesk font-bold ${highlight ? "text-primary" : "text-foreground"}`}>{value}</p>
          }
          {sub && !loading && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Commission scale table (collapsible) ─────────────────────────────────────
function CommissionScale({ currentTier }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Commission Scale</span>
          <Badge className="bg-primary/15 text-primary border-primary/25 text-xs">8% – 20%</Badge>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-5 pb-4 space-y-2">
          <p className="text-xs text-muted-foreground mb-3">
            Rate applies to the <strong className="text-foreground">first evaluation fee</strong> of each referred trader.
            Volume resets on the 1st of each calendar month (UTC).
          </p>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40">
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Monthly Volume</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Commission Rate</th>
                </tr>
              </thead>
              <tbody>
                {AFFILIATE_TIERS.map((tier, i) => {
                  const isActive = tier === currentTier;
                  const volLabel = tier.maxVolume === Infinity
                    ? `$${tier.minVolume.toLocaleString()}+`
                    : `$${tier.minVolume.toLocaleString()} – $${tier.maxVolume.toLocaleString()}`;
                  return (
                    <tr
                      key={i}
                      className={`border-b border-border last:border-0 ${isActive ? "bg-primary/8" : ""}`}
                    >
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {volLabel}
                        {isActive && (
                          <Badge className="ml-2 bg-primary/15 text-primary border-primary/25 text-[10px] py-0">
                            Current
                          </Badge>
                        )}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-grotesk font-bold text-sm ${isActive ? "text-primary" : "text-foreground"}`}>
                        {tier.label}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tier progress widget ─────────────────────────────────────────────────────
function TierProgress({ monthlyVolumeUsdc, loading }) {
  if (loading) {
    return <div className="h-24 bg-secondary rounded-xl animate-pulse" />;
  }

  const volume = monthlyVolumeUsdc ?? 0;
  const tier = getTierForVolume(volume);
  const next = getNextTier(tier);
  const toNext = volumeToNextTier(volume);

  // Progress within current tier band
  const bandSize = next ? next.minVolume - tier.minVolume : 1;
  const progress = next
    ? Math.min(100, ((volume - tier.minVolume) / bandSize) * 100)
    : 100;

  const monthName = new Date().toLocaleString("en-US", { month: "long", timeZone: "UTC" });

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{monthName} referral volume</p>
          <p className="text-2xl font-grotesk font-bold text-foreground mt-0.5">
            {fmtVolume(volume)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Current rate</p>
          <p className="text-2xl font-grotesk font-bold text-primary">{tier.label}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="h-2 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        {next ? (
          <p className="text-xs text-muted-foreground">
            <span className="text-foreground font-medium">{fmt(toNext)}</span> more in fees to unlock{" "}
            <span className="text-primary font-semibold">{next.label}</span>
          </p>
        ) : (
          <p className="text-xs text-primary font-medium">Maximum rate reached</p>
        )}
      </div>

      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground/60" />
        <span>Earns on the first challenge fee per referred trader only. Volume resets 1st of each month (UTC).</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AffiliateDashboard() {
  const { address, isAuthenticated } = useAuth();
  const { connect } = useConnectModal();

  const [joined, setJoined]   = useState(false);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [copied, setCopied]   = useState(false);
  const [affiliateCode, setAffiliateCode] = useState("");

  // Compute the obfuscated 10-char code from the wallet (SHA-256 truncated)
  useEffect(() => {
    if (!address) { setAffiliateCode(""); return; }
    let cancelled = false;
    walletToCode(address).then((code) => {
      if (!cancelled) setAffiliateCode(code);
    });
    return () => { cancelled = true; };
  }, [address]);

  const {
    totalCommissionUsdc,
    totalReferrals,
    monthlyVolumeUsdc,
    payments,
    loading: statsLoading,
    refetch,
  } = useAffiliateStats(joined ? address : null);

  useEffect(() => {
    if (!address) { setJoined(false); setLoading(false); return; }
    const store = loadStore();
    setJoined(!!store[address.toLowerCase()]);
    setLoading(false);
  }, [address]);

  const handleJoin = () => {
    if (!address) return;
    setJoining(true);
    const store = loadStore();
    store[address.toLowerCase()] = { joinedAt: new Date().toISOString() };
    saveStore(store);
    setJoined(true);
    setJoining(false);
  };

  const referralLink = affiliateCode
    ? `${window.location.origin}/?ref=${affiliateCode}`
    : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentTier = getTierForVolume(monthlyVolumeUsdc ?? 0);

  // ── Not connected ───────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-6">
        <div className="w-16 h-16 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
          <Users className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-grotesk font-bold text-foreground mb-2">Affiliate Program</h2>
          <p className="text-muted-foreground max-w-sm">
            Earn 8–20% of the first challenge fee for every trader you refer — paid on-chain, instantly.
          </p>
        </div>
        <Button
          className="border-primary/40 text-primary hover:bg-primary/10 gap-1.5"
          variant="outline"
          onClick={() => connect({ client: thirdwebClient, chain, wallets, appMetadata })}
        >
          <Wallet className="w-3.5 h-3.5" /> Connect Wallet
        </Button>
      </div>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <BoltLoader className="w-8 h-8 text-primary" />
      </div>
    );
  }

  // ── Join prompt ─────────────────────────────────────────────────────────
  if (!joined) {
    return (
      <div className="max-w-lg mx-auto space-y-8 py-12 text-center">
        <div>
          <div className="w-16 h-16 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-grotesk font-bold text-foreground mb-3">Affiliate Program</h1>
          <p className="text-muted-foreground">
            Share your referral link. When a trader pays their{" "}
            <span className="text-foreground font-semibold">first challenge fee</span> through your link,
            you earn <span className="text-foreground font-semibold">8–20% of that fee</span> in
            USDC — sent on-chain in the same transaction.
          </p>
        </div>

        <div className="grid gap-4 text-left">
          {[
            {
              icon: Zap,
              label: "Instant on-chain payment",
              desc: "Commission hits your wallet the moment the trader pays. No claiming, no waiting.",
            },
            {
              icon: TrendingUp,
              label: "8–20% sliding commission",
              desc: "Start at 8% and scale up to 20% as your monthly referral volume grows. More referrals = higher rate on all fees that month.",
            },
            {
              icon: DollarSign,
              label: "First evaluation fee only",
              desc: "You earn on the first challenge fee paid by each trader you refer. A $1,080 fee at 20% = $216 in your wallet.",
            },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex gap-3 p-4 bg-card border border-border rounded-lg">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tier preview table */}
        <div className="text-left rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/20">
            <p className="text-xs font-semibold text-foreground">Commission tiers (monthly volume)</p>
          </div>
          <table className="w-full">
            <tbody>
              {AFFILIATE_TIERS.map((tier, i) => {
                const volLabel = tier.maxVolume === Infinity
                  ? `$${tier.minVolume.toLocaleString()}+`
                  : `$${tier.minVolume.toLocaleString()} – $${tier.maxVolume.toLocaleString()}`;
                return (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{volLabel}</td>
                    <td className="px-4 py-2.5 text-right font-grotesk font-bold text-sm text-primary">{tier.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Button
          className="bg-primary text-primary-foreground glow-green-sm gap-2 w-full"
          onClick={handleJoin}
          disabled={joining}
        >
          {joining ? (
            <><BoltLoader className="w-4 h-4" /> Joining…</>
          ) : (
            <><Users className="w-4 h-4" /> Join Affiliate Program</>
          )}
        </Button>
      </div>
    );
  }

  // ── Dashboard ───────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <SEO title="Affiliate Dashboard" noindex />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-grotesk font-bold text-foreground">Affiliate Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Code: <span className="font-mono text-foreground">{affiliateCode || "…"}</span>
            <Badge
              variant="outline"
              className="ml-2 border-primary/30 text-primary text-xs"
            >
              {statsLoading ? "…" : currentTier.label} this month
            </Badge>
          </p>
        </div>
        <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={refetch}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* Referral link */}
      <div className="bg-primary/5 border border-primary/30 rounded-xl p-5 space-y-3">
        <p className="text-sm font-semibold text-foreground">Your Referral Link</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-secondary rounded-lg px-3 py-2 text-sm font-mono text-muted-foreground truncate">
            {referralLink}
          </code>
          <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={handleCopy}>
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          When a trader pays their first challenge fee through this link, your commission is sent to your wallet on-chain instantly.
        </p>
      </div>

      {/* Tier progress */}
      <TierProgress monthlyVolumeUsdc={monthlyVolumeUsdc} loading={statsLoading} />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={DollarSign}
          label="Total Earned (USDC)"
          value={fmt(totalCommissionUsdc)}
          loading={statsLoading}
        />
        <StatCard
          icon={Users}
          label="Total Referrals"
          value={totalReferrals == null ? "—" : totalReferrals}
          sub="unique traders"
          loading={statsLoading}
        />
        <StatCard
          icon={TrendingUp}
          label="Current Rate"
          value={statsLoading ? "—" : currentTier.label}
          sub="based on this month's volume"
          loading={false}
          highlight
        />
      </div>

      {/* Commission scale */}
      <CommissionScale currentTier={currentTier} />

      {/* Marketing kit */}
      <MarketingKit />

      {/* Payment history */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Commission History</h2>
        {statsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-secondary rounded-lg animate-pulse" />
            ))}
          </div>
        ) : payments.length === 0 ? (
          <div className="border border-border rounded-xl p-8 text-center text-muted-foreground text-sm">
            No commissions yet. Share your referral link to start earning.
          </div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Tx Hash</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Earned (USDC)</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">Referred Trader</th>
                </tr>
              </thead>
              <tbody>
                {[...payments].reverse().map((p) => (
                  <tr key={p.txHash} className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      <a
                        href={explorerTxUrl(p.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:text-primary transition-colors"
                      >
                        {p.txHash.slice(0, 10)}…{p.txHash.slice(-6)}
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-primary">
                      +{fmt(p.amountUsdc)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground hidden sm:table-cell">
                      {p.traderAddress ? `${p.traderAddress.slice(0, 6)}…${p.traderAddress.slice(-4)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
