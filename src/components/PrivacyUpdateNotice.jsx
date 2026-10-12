/**
 * PrivacyUpdateNotice — one-time "we updated the Privacy Policy" acknowledgement
 * for returning visitors. Shows a checkbox they must tick to confirm they've
 * viewed the updated policy, then records the acknowledgement to the DB and
 * never shows again (until the policy version is bumped).
 *
 * Brand-new first-time visitors are not prompted — they implicitly accept the
 * current policy. Returning visitors are detected via the cf_wallet_seen flag
 * (or a currently connected wallet).
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import {
  PRIVACY_POLICY_VERSION,
  isReturningVisitor,
  getAcknowledgedVersion,
  setAcknowledgedVersion,
  recordPrivacyAck,
} from "@/lib/privacyAcknowledgement";

const IS_SCREENSHOTS = import.meta.env.VITE_SCREENSHOTS === "true";

export default function PrivacyUpdateNotice() {
  const { address, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (IS_SCREENSHOTS) return;
    const returning = isReturningVisitor() || isAuthenticated;
    if (returning && getAcknowledgedVersion() !== PRIVACY_POLICY_VERSION) {
      setOpen(true);
    }
  }, [isAuthenticated]);

  if (!open) return null;

  const confirm = () => {
    if (!checked) return;
    setAcknowledgedVersion(PRIVACY_POLICY_VERSION);        // one-time, this browser
    recordPrivacyAck({ walletAddress: address || null });  // DB acknowledgement log
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Privacy Policy update"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6 shadow-xl">
        <h2 className="font-grotesk text-lg font-semibold text-foreground">
          We've updated our Privacy Policy
        </h2>
        <p className="text-sm text-muted-foreground">
          Our Privacy Policy was updated on June 5, 2026 — it now describes how we
          measure our advertising campaigns. Please review it and confirm you've
          seen the update.
        </p>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 accent-primary"
          />
          <span>
            I confirm I have viewed the updated{" "}
            <a
              href="/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:no-underline"
            >
              Privacy Policy
            </a>
            .
          </span>
        </label>
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={!checked}
            onClick={confirm}
            className="bg-primary text-primary-foreground"
          >
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
}
