import SEO from "@/components/SEO";
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, DollarSign, Award } from "lucide-react";
import ProfileSection from "../components/account/ProfileSection.jsx";

import PayoutHistory from "../components/account/PayoutHistory.jsx";
import { useConnectModal } from "thirdweb/react";
import { thirdwebClient, chain, wallets, appMetadata } from "@/lib/thirdwebClient";
import { Wallet } from "lucide-react";

export default function MyAccount() {
  const { address, isAuthenticated, isLoadingAuth } = useAuth();
  const { connect } = useConnectModal();
  const [loading, setLoading] = useState(true);
  const [totalPayouts, setTotalPayouts] = useState(0);
  const [payouts, setPayouts] = useState([]);
  // Profile data stored locally, keyed by wallet address
  const [profile, setProfile] = useState({});

  useEffect(() => {
    if (!address) { setLoading(false); return; }

    // Load locally stored profile for this wallet
    const stored = localStorage.getItem(`cf_profile_${address}`);
    if (stored) setProfile(JSON.parse(stored));

    const fetchData = async () => {
      try {
        const raw = await base44.entities.Payout.filter({ trader_address: address }, "-requested_date");
        const userPayouts = Array.isArray(raw) ? raw : [];
        setPayouts(userPayouts);
        const totalSettled = userPayouts
          .filter(p => p.status === "settled")
          .reduce((sum, p) => sum + (p.trader_share_usdc || 0), 0);
        setTotalPayouts(totalSettled);
      } catch (err) {
        console.error("Error fetching account data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [address]);

  const handleProfileUpdate = (updatedProfile) => {
    setProfile(updatedProfile);
    localStorage.setItem(`cf_profile_${address}`, JSON.stringify(updatedProfile));
  };

  if (isLoadingAuth) {
    return <div className="text-center py-16 text-muted-foreground">Connecting wallet…</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="text-center py-16 space-y-4">
        <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground" />
        <p className="text-muted-foreground">Connect your wallet to view your account.</p>
        <Button variant="outline" className="border-primary/40 text-primary hover:bg-primary/10 gap-1.5" onClick={() => connect({ client: thirdwebClient, chain, wallets, appMetadata })}>
          <Wallet className="w-3.5 h-3.5" /> Connect Wallet
        </Button>
      </div>
    );
  }

  if (loading) {
    return <div className="text-center py-16 text-muted-foreground">Loading your account...</div>;
  }

  return (
    <div className="space-y-8">
      <SEO title="My Account" noindex />
      <div>
        <h1 className="text-2xl font-grotesk font-bold text-foreground">My Account</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your profile, verification, and account settings
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Total Rewards Paid</p>
                <p className="text-2xl font-grotesk font-bold text-foreground">
                  ${totalPayouts.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Pending Payouts</p>
                <p className="text-2xl font-grotesk font-bold text-foreground">
                  {payouts.filter(p => p.status === "pending").length}
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                <Award className="w-5 h-5 text-yellow-400" />
              </div>
            </div>
          </CardContent>
        </Card>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <ProfileSection profile={profile} onUpdate={handleProfileUpdate} />
        </div>

        <div>
          <Card className="border-border sticky top-24">
            <CardHeader>
              <CardTitle className="text-base">Account Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs mb-1">Wallet Address</p>
                <p className="text-foreground font-mono text-xs break-all">{address}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">Account Role</p>
                <Badge className="bg-primary/20 text-primary border-primary/30 capitalize">
                  Trader
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <PayoutHistory payouts={payouts} />
    </div>
  );
}
