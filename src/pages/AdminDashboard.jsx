import SEO from "@/components/SEO";
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, RefreshCw, Users, DollarSign, TrendingUp, Clock, Lock } from "lucide-react";
import ChallengeManager from "../components/admin/ChallengeManager";
import AdminAccountDetail from "../components/admin/AdminAccountDetail";
import PayoutQueue from "../components/admin/PayoutQueue";
import TradablePairsManager from "../components/admin/TradablePairsManager";
import WhitelistManager from "../components/admin/WhitelistManager";
import AgreementManager from "../components/admin/AgreementManager";
import ModeratorAdmin from "../components/admin/ModeratorAdmin";
import XBotQueue from "../components/admin/XBotQueue";
import ReviewsManager from "../components/admin/ReviewsManager";
import { useOnchainRegistrationSync } from "@/hooks/useOnchainRegistrationSync";

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <Card className="border-border">
      <CardContent className="pt-5 pb-4">
        <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center mb-3`}>
          <Icon className="w-4 h-4" />
        </div>
        <p className="text-lg font-grotesk font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}

const VALID_ADMIN_TABS = ["challenges", "payouts", "pairs", "whitelist", "agreements", "moderators", "xbot", "reviews"];

export default function AdminDashboard() {
  const { isAdmin, isAuthenticated, isLoadingAuth } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewingAccountId, setViewingAccountId] = useState(null);
  const initialTab = VALID_ADMIN_TABS.includes(searchParams.get("tab"))
    ? searchParams.get("tab")
    : "challenges";
  const [activeTab, setActiveTabState] = useState(initialTab);

  useEffect(() => {
    const fromUrl = searchParams.get("tab");
    if (VALID_ADMIN_TABS.includes(fromUrl) && fromUrl !== activeTab) {
      setActiveTabState(fromUrl);
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const setActiveTab = (t) => {
    setActiveTabState(t);
    setSearchParams(t === "challenges" ? {} : { tab: t });
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [accs, pays] = await Promise.all([
        base44.entities.ChallengeAccount.list("-created_date", 100),
        base44.entities.Payout.list("-created_date", 100),
      ]);
      setAccounts(Array.isArray(accs) ? accs : []);
      setPayouts(Array.isArray(pays) ? pays : []);
    } catch (err) {
      console.error("Failed to load admin data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isAdmin) fetchData(); }, [isAdmin]);

  // Poll on-chain every 3 s — auto-confirm any accounts that paid but weren't marked registered
  useOnchainRegistrationSync(accounts, (accId, wasPromotedToActive) => {
    setAccounts((prev) =>
      prev.map((a) =>
        a.id === accId
          ? { ...a, onchain_registered: true, ...(wasPromotedToActive && { status: "active" }) }
          : a
      )
    );
  });

  if (isLoadingAuth) {
    return <div className="text-center py-16 text-muted-foreground">Connecting wallet…</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4 bg-card border border-border rounded-2xl px-8 py-10 max-w-sm mx-auto">
          <div className="w-12 h-12 rounded-xl bg-destructive/10 border border-destructive/30 flex items-center justify-center mx-auto">
            <Lock className="w-5 h-5 text-destructive" />
          </div>
          <h2 className="text-lg font-grotesk font-bold text-foreground">Admin Access Only</h2>
          <p className="text-sm text-muted-foreground">Connect your admin wallet to access this page.</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4 bg-card border border-border rounded-2xl px-8 py-10 max-w-sm mx-auto">
          <div className="w-12 h-12 rounded-xl bg-destructive/10 border border-destructive/30 flex items-center justify-center mx-auto">
            <Lock className="w-5 h-5 text-destructive" />
          </div>
          <h2 className="text-lg font-grotesk font-bold text-foreground">Admin Access Only</h2>
          <p className="text-sm text-muted-foreground">This wallet is not authorised as an admin. Please contact the platform administrator.</p>
        </div>
      </div>
    );
  }

  const activeAccounts = accounts.filter(a => a.status === "active").length;
  const pendingPayouts = payouts.filter(p => p.status === "pending").length;
  const totalFees = accounts.reduce((s, a) => s + (a.challenge_fee_usdc || 0), 0);
  const fundedAccounts = accounts.filter(a => a.phase === "funded").length;

  return (
    <div className="space-y-8">
      <SEO title="Admin Dashboard" noindex />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-grotesk font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" /> Admin Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage challenge accounts, review payouts, and monitor platform activity</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 border-border" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Accounts" value={loading ? "—" : accounts.length} icon={Users} color="bg-primary/10 text-primary" />
        <StatCard label="Active Accounts" value={loading ? "—" : activeAccounts} icon={TrendingUp} color="bg-green-500/10 text-green-400" />
        <StatCard label="Funded Traders" value={loading ? "—" : fundedAccounts} icon={DollarSign} color="bg-blue-500/10 text-blue-400" />
        <StatCard label="Pending Payouts" value={loading ? "—" : pendingPayouts} icon={Clock} color="bg-yellow-500/10 text-yellow-400" />
      </div>

      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex flex-wrap gap-6 items-center">
        <div className="flex items-center gap-2 text-sm">
          <DollarSign className="w-4 h-4 text-primary" />
          <span className="text-muted-foreground">Total Fees Collected:</span>
          <span className="text-foreground font-semibold">${totalFees.toLocaleString()} USDC</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Users className="w-4 h-4 text-primary" />
          <span className="text-muted-foreground">Failed Challenges:</span>
          <span className="text-red-400 font-semibold">{accounts.filter(a => a.phase === "failed").length}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <TrendingUp className="w-4 h-4 text-primary" />
          <span className="text-muted-foreground">Phase 2 Accounts:</span>
          <span className="text-foreground font-semibold">{accounts.filter(a => a.phase === "phase_2").length}</span>
        </div>
      </div>

      <div>
        <div className="flex gap-1 mb-6 border-b border-border">
          <button
            onClick={() => setActiveTab("challenges")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "challenges" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Challenge Accounts ({accounts.length})
          </button>
          <button
            onClick={() => setActiveTab("payouts")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "payouts" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Payout Queue {pendingPayouts > 0 && <span className="ml-1.5 bg-yellow-500/20 text-yellow-400 text-xs px-1.5 py-0.5 rounded-full">{pendingPayouts}</span>}
          </button>
          <button
            onClick={() => setActiveTab("pairs")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "pairs" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Tradable Pairs
          </button>
          <button
            onClick={() => setActiveTab("whitelist")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "whitelist" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Whitelist
          </button>
          <button
            onClick={() => setActiveTab("agreements")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "agreements" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Agreements
          </button>
          <button
            onClick={() => setActiveTab("moderators")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "moderators" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Moderators
          </button>
          <button
            onClick={() => setActiveTab("xbot")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "xbot" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            X Bot
          </button>
          <button
            onClick={() => setActiveTab("reviews")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "reviews" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Reviews
          </button>
        </div>

        {viewingAccountId ? (
          <AdminAccountDetail
            accountId={viewingAccountId}
            onBack={() => setViewingAccountId(null)}
          />
        ) : loading && activeTab !== "pairs" ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground text-sm animate-pulse">
            Loading data...
          </div>
        ) : activeTab === "challenges" ? (
          <ChallengeManager
          accounts={accounts}
          onRefresh={fetchData}
          onViewAccount={(accId) => setViewingAccountId(accId)}
          onAccountRegistered={(accId) =>
            setAccounts((prev) =>
              prev.map((a) => (a.id === accId ? { ...a, onchain_registered: true } : a))
            )
          }
        />
        ) : activeTab === "payouts" ? (
          <PayoutQueue payouts={payouts} onRefresh={fetchData} />
        ) : activeTab === "pairs" ? (
          <TradablePairsManager />
        ) : activeTab === "agreements" ? (
          <AgreementManager />
        ) : activeTab === "moderators" ? (
          <ModeratorAdmin />
        ) : activeTab === "xbot" ? (
          <XBotQueue />
        ) : activeTab === "reviews" ? (
          <ReviewsManager />
        ) : (
          <WhitelistManager />
        )}
      </div>
    </div>
  );
}
