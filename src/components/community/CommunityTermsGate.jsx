import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import { useCommunityToken } from "@/hooks/useCommunityToken";
import { communityApi } from "@/lib/communityApi";

const STORAGE_KEY = "cf_community_terms_v1";
const TERMS_VERSION = 1;

const RULES = [
  "Be civil — no harassment, hate, or threats.",
  "No financial advice or guarantees of returns.",
  "No spam, scams, or unsolicited DMs / signals.",
  "Don't share other traders' private info.",
  "Moderators may delete, mute, or ban for breaches.",
];

/**
 * One-time gate shown to users who haven't accepted the community ToS yet.
 * Persists acceptance both to localStorage (fast check) and the server
 * (`community_terms_acceptances`) for audit. Children render only after
 * acceptance.
 */
export default function CommunityTermsGate({ children }) {
  const { isAuthenticated, address } = useAuth();
  const { token, signIn, signing } = useCommunityToken();
  const [accepted, setAccepted] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === String(TERMS_VERSION);
    } catch {
      return false;
    }
  });
  const [submitting, setSubmitting] = useState(false);

  // Re-evaluate on wallet change.
  useEffect(() => {
    try {
      setAccepted(localStorage.getItem(STORAGE_KEY) === String(TERMS_VERSION));
    } catch {}
  }, [address]);

  if (accepted || !isAuthenticated) return children;

  const handleAccept = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      let active = token;
      if (!active) active = await signIn();
      if (!active) return;
      await communityApi.acceptTerms(active, TERMS_VERSION);
      try { localStorage.setItem(STORAGE_KEY, String(TERMS_VERSION)); } catch {}
      setAccepted(true);
    } catch (err) {
      toast.error("Couldn't accept community terms", { description: err?.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-12 px-4">
      <Card className="border-primary/30">
        <CardContent className="p-6 space-y-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-grotesk font-bold text-foreground">Welcome to the Community</h2>
              <p className="text-xs text-muted-foreground">A few ground rules before you post.</p>
            </div>
          </div>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {RULES.map((r) => (
              <li key={r} className="flex gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" /> {r}
              </li>
            ))}
          </ul>
          <Button
            onClick={handleAccept}
            disabled={submitting || signing}
            className="w-full bg-primary text-primary-foreground"
          >
            {signing ? "Sign in your wallet…" : submitting ? "Submitting…" : "I agree — let me in"}
          </Button>
          <p className="text-[10px] text-muted-foreground/60 text-center">
            You'll sign one message to verify your wallet. It keeps you signed in and renews automatically while you're active — you won't be asked again.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
