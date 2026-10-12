/**
 * ManageCookiesLink — re-opens the marketing-consent banner so a user can
 * change their choice at any time (required for a valid withdraw-consent path).
 * Self-contained so footers only need to drop it in. Styling is passed in to
 * match each footer's link styles.
 */
import { useConsent } from "@/lib/consent";

export default function ManageCookiesLink({ className = "" }) {
  const { reopen } = useConsent();
  return (
    <button type="button" onClick={reopen} className={className}>
      Manage cookies
    </button>
  );
}
