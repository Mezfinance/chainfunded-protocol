/**
 * ConsentBanner — marketing-cookie consent prompt.
 *
 * Only renders when the consent layer asks for a decision (EU/EEA/UK visitors
 * with no prior choice, or when geo can't be determined). Accept enables the X
 * pixel + Conversion API; Decline keeps them off. Decline is as prominent as
 * Accept, per GDPR/ePrivacy — no pre-selected choice, no tracking until opt-in.
 */
import { useConsent } from "@/lib/consent";
import { Button } from "@/components/ui/button";

export default function ConsentBanner() {
  const { showBanner, accept, decline } = useConsent();
  if (!showBanner) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Marketing cookie consent"
      className="fixed inset-x-0 bottom-0 z-[100] p-3 sm:p-4"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground sm:text-sm">
          We use marketing cookies (the X / Twitter pixel) to measure our ad
          campaigns. They load only if you accept. See our{" "}
          <a href="/PrivacyPolicy" className="text-primary underline hover:no-underline">
            Privacy Policy
          </a>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={decline} className="flex-1 sm:flex-none">
            Decline
          </Button>
          <Button size="sm" onClick={accept} className="flex-1 bg-primary text-primary-foreground sm:flex-none">
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
