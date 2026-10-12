import { useEffect, useState } from "react";

/**
 * IntroSequence — "First Settlement" opening animation.
 *
 * Opens in the same dark grid as the SettlementField, a pulse streaks in and
 * blooms the ChainFunded bolt, two phrases land, the bolt fills green, the glow
 * blooms — then the whole overlay fades out, revealing the app's identical
 * field beneath (seamless handoff).
 *
 * - Plays once per session (sessionStorage), dark mode only.
 * - Skipped entirely under prefers-reduced-motion.
 * - Click / Skip / Esc dismisses early.
 *
 * Mounted once in App. Choreography lives in src/index.css (.cf-intro*).
 */
const PHRASES = ["Payouts in seconds.", "Don't trust — verify.", "Settled on-chain."];
const DURATION = 7000; // ms — matches the CSS timeline + fade-out

export default function IntroSequence() {
  const [show, setShow] = useState(false);

  // Decide post-mount (avoids SSR/hydration mismatch — server renders nothing).
  useEffect(() => {
    let played = false;
    try { played = !!sessionStorage.getItem("cf-intro-played"); } catch { /* ignore */ }
    if (played) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const dark = document.documentElement.classList.contains("dark");
    // Don't delay the paid-ad funnels — they're optimised for low exit.
    const path = window.location.pathname.toLowerCase();
    const campaign = path.startsWith("/funded") || path.startsWith("/onboarding");
    // Mark played for the whole session regardless, so it only ever auto-plays
    // once and never interrupts later navigation.
    try { sessionStorage.setItem("cf-intro-played", "1"); } catch { /* ignore */ }
    if (reduce || !dark || campaign) return;
    setShow(true);
  }, []);

  useEffect(() => {
    if (!show) return;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") setShow(false); };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => setShow(false), DURATION);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [show]);

  if (!show) return null;

  return (
    <div className="cf-intro" onClick={() => setShow(false)} role="presentation">
      <div className="cf-intro-grid" />
      <div className="cf-intro-glow" />
      <span className="cf-intro-pulse cf-intro-pulse-1" />
      <span className="cf-intro-pulse cf-intro-pulse-2" />

      <div className="cf-intro-stage">
        <svg className="cf-intro-bolt" viewBox="0 0 512 512" aria-hidden="true">
          <defs>
            <clipPath id="cfIntroBoltClip">
              <rect className="cf-intro-fill" x="0" y="512" width="512" height="512" />
            </clipPath>
          </defs>
          <polygon
            className="cf-intro-bolt-outline"
            points="278 42 64 298 256 298 234 470 448 214 256 214 278 42"
          />
          <polygon
            className="cf-intro-bolt-solid"
            points="278 42 64 298 256 298 234 470 448 214 256 214 278 42"
            clipPath="url(#cfIntroBoltClip)"
          />
        </svg>

        <div className="cf-intro-phrases">
          <span className="cf-intro-phrase cf-intro-phrase-1">{PHRASES[0]}</span>
          <span className="cf-intro-phrase cf-intro-phrase-2">{PHRASES[1]}</span>
          <span className="cf-intro-phrase cf-intro-phrase-3">{PHRASES[2]}</span>
        </div>
      </div>

      <button className="cf-intro-skip" onClick={() => setShow(false)}>Skip</button>
    </div>
  );
}
