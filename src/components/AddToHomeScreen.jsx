import { useState, useEffect } from "react";
import { X, Share, Plus } from "lucide-react";

// Show the prompt once per week at most, and never if already installed.
const STORAGE_KEY = "a2hs_dismissed_at";
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}

function isAndroid() {
  return /Android/.test(navigator.userAgent);
}

function isStandalone() {
  return (
    window.navigator.standalone === true ||                       // iOS PWA
    window.matchMedia("(display-mode: standalone)").matches      // Android PWA
  );
}

function shouldShow() {
  if (isStandalone()) return false;
  if (!isIOS() && !isAndroid()) return false;
  const last = localStorage.getItem(STORAGE_KEY);
  if (last && Date.now() - parseInt(last, 10) < COOLDOWN_MS) return false;
  return true;
}

export default function AddToHomeScreen() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Delay 3 s so the user has a moment to orient themselves first
    const t = setTimeout(() => {
      if (shouldShow()) setVisible(true);
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setVisible(false);
  }

  if (!visible) return null;

  const ios = isIOS();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] flex justify-center px-4 pb-6 pointer-events-none">
      <div
        className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-4 pointer-events-auto"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <img
              src="/apple-touch-icon.png"
              alt="ChainFunded"
              className="w-12 h-12 rounded-xl shrink-0"
            />
            <div>
              <p className="font-semibold text-foreground text-sm">Add to Home Screen</p>
              <p className="text-xs text-muted-foreground">
                Get the full-screen trading experience
              </p>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground p-1 shrink-0 -mt-0.5"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Instructions */}
        {ios ? (
          <div className="flex items-center gap-3 bg-secondary/60 rounded-xl px-4 py-3">
            <span className="text-sm text-muted-foreground leading-snug">
              Tap{" "}
              <span className="inline-flex items-center gap-0.5 align-middle">
                <Share className="w-4 h-4 text-blue-400 inline" />
              </span>{" "}
              <span className="text-foreground font-medium">Share</span>
              {" "}in Safari, then tap{" "}
              <span className="inline-flex items-center gap-0.5 align-middle">
                <Plus className="w-3.5 h-3.5 text-foreground inline border border-foreground/40 rounded-[3px]" />
              </span>{" "}
              <span className="text-foreground font-medium">Add to Home Screen</span>
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3 bg-secondary/60 rounded-xl px-4 py-3">
            <span className="text-sm text-muted-foreground leading-snug">
              Tap the{" "}
              <span className="text-foreground font-medium">⋮ menu</span>
              {" "}in Chrome, then tap{" "}
              <span className="text-foreground font-medium">Add to Home Screen</span>
            </span>
          </div>
        )}

        {/* Arrow pointing down toward the browser bar on iOS */}
        {ios && (
          <div className="flex justify-center mt-2">
            <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
              <path d="M10 12 L0 0 L20 0 Z" fill="rgba(255,255,255,0.15)" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
