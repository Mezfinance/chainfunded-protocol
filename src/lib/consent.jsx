/**
 * consent.jsx — marketing-consent gate for the X pixel + Conversion API.
 *
 * Geo-gated per the EU/EEA/UK "opt-in before tracking" rule (GDPR + ePrivacy):
 *   - EU/EEA/UK visitor, no prior choice → show the banner; tracking stays OFF
 *     until they click Accept (Decline keeps it off, no effect on access).
 *   - Everywhere else → enable tracking by default (still recorded so a user
 *     can change it later).
 *   - Geo unknown / endpoint down → fail safe: show the banner (don't fire).
 *
 * The actual on/off switch lives in xpixel.js (enableXTracking); this layer
 * only decides when to flip it and whether to surface the banner.
 */
import { createContext, useContext, useEffect, useState } from 'react';
import { enableXTracking, disableXTracking } from '@/lib/xpixel';

const STORAGE_KEY = 'cf_marketing_consent'; // 'granted' | 'denied'

const ConsentContext = createContext({
  showBanner: false,
  accept: () => {},
  decline: () => {},
  reopen: () => {},
});

function storedChoice() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}
function persist(choice) {
  try { localStorage.setItem(STORAGE_KEY, choice); } catch { /* ignore */ }
}

export function ConsentProvider({ children }) {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const choice = storedChoice();
    if (choice === 'granted') { enableXTracking(); return; }
    if (choice === 'denied')  { return; }

    // Undecided — geo-gate the decision.
    let cancelled = false;
    fetch('/api/geo')
      .then((r) => r.json())
      .then((g) => {
        if (cancelled) return;
        if (g.consentRequired) {
          setShowBanner(true);          // EU/EEA/UK → wait for opt-in
        } else {
          persist('granted');
          enableXTracking();            // elsewhere → fire by default
        }
      })
      .catch(() => {
        if (!cancelled) setShowBanner(true); // fail safe: ask, don't fire
      });
    return () => { cancelled = true; };
  }, []);

  const accept  = () => { persist('granted'); enableXTracking(); setShowBanner(false); };
  const decline = () => { persist('denied'); disableXTracking(); setShowBanner(false); };
  // Re-open the banner so a user can change their choice later (e.g. from the
  // "Manage cookies" footer link). Available in every region.
  const reopen  = () => setShowBanner(true);

  return (
    <ConsentContext.Provider value={{ showBanner, accept, decline, reopen }}>
      {children}
    </ConsentContext.Provider>
  );
}

export const useConsent = () => useContext(ConsentContext);
