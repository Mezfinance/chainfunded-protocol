/**
 * xpixel.js — X (Twitter) Pixel + conversion tracking.
 *
 * Mirrors src/lib/posthog.jsx: the integration is DORMANT until
 * VITE_X_PIXEL_ID is set, so it ships inert and activates the moment the IDs
 * are populated in env — nothing fires (and no script loads) without an ID.
 *
 * Event IDs are the full event-tag strings copied from the X Ads "Events
 * Manager" (e.g. "tw-oabc1-de234"). Storing them in env keeps this file free
 * of account-specific values and lets ops swap them without a code change.
 *
 * Server-side Conversion API (CAPI) — added later — reuses the same
 * `conversion_id` (the on-chain tx hash) so X de-duplicates the browser
 * pixel hit against the server event. We also capture `twclid` from the
 * ad-click URL here so CAPI can match a conversion back to the click.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const PIXEL_ID = import.meta.env.VITE_X_PIXEL_ID;

/** Full event-tag strings from X Events Manager. Empty → that event no-ops. */
export const X_EVENTS = {
  pageView:    import.meta.env.VITE_X_EVENT_PAGEVIEW,
  contentView: import.meta.env.VITE_X_EVENT_CONTENT_VIEW,
  lead:        import.meta.env.VITE_X_EVENT_LEAD,
  purchase:    import.meta.env.VITE_X_EVENT_PURCHASE,
  deposit:     import.meta.env.VITE_X_EVENT_DEPOSIT,
};

const TWCLID_KEY = 'cf_twclid';

// Capture the X click identifier from the ad-click URL and persist it so the
// server-side Conversion API can match conversions back to the click later.
function captureTwclid() {
  if (typeof window === 'undefined') return;
  try {
    const twclid = new URLSearchParams(window.location.search).get('twclid');
    if (twclid) localStorage.setItem(TWCLID_KEY, twclid);
  } catch { /* ignore */ }
}

/** The stored X click id, for the server-side Conversion API. */
export function getTwclid() {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem(TWCLID_KEY); } catch { return null; }
}

// Tracking stays OFF until the consent layer turns it on. This is what makes
// the integration consent-safe: in the EU/EEA/UK nothing loads or fires until
// the visitor opts in; elsewhere the consent provider enables it by default.
let enabled = false;

/**
 * Boot the X pixel and allow events to fire. Called by the consent provider
 * once consent is granted (EU/EEA/UK) or where consent isn't required.
 * Idempotent; no-ops when no pixel id is configured.
 */
export function enableXTracking() {
  if (enabled || !PIXEL_ID || typeof window === 'undefined') return;
  enabled = true;
  // Standard X uwt.js loader snippet (verbatim from X Events Manager).
  !function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);},s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');
  window.twq('config', PIXEL_ID);
  captureTwclid();
}

/**
 * Stop firing pixel + CAPI events. Used when a user withdraws consent. The
 * uwt.js script can't be unloaded once injected, but flipping `enabled` off
 * means no further events are sent and nothing loads on the next visit.
 */
export function disableXTracking() {
  enabled = false;
}

/** Whether tracking is active (consent granted / not required). */
export function isXTrackingEnabled() {
  return enabled;
}

/**
 * Fire a conversion event to the X pixel. No-ops cleanly when the pixel or
 * the specific event id isn't configured. `params` may include value,
 * currency, conversion_id (dedup key), contents, etc. Empty fields are stripped.
 */
export function trackXEvent(eventId, params = {}) {
  if (!enabled || !eventId || typeof window === 'undefined' || !window.twq) return;
  const payload = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
  try { window.twq('event', eventId, payload); } catch { /* non-blocking */ }
}

const CAPI_ENDPOINT = '/api/x-capi';

/**
 * Mirror a conversion to the server-side Conversion API (api/x-capi.js).
 * First-party, so it survives ad-blockers that kill the browser pixel. The
 * server adds the request IP + user-agent; we pass `twclid` and the shared
 * `conversion_id` so X de-duplicates against the pixel hit. Fire-and-forget;
 * no-ops until the event tag is configured.
 */
export function sendCapiEvent(eventId, { conversion_id, value, currency } = {}) {
  if (!enabled || !eventId || typeof window === 'undefined') return;
  try {
    fetch(CAPI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // keepalive lets the request finish even if the page navigates away.
      keepalive: true,
      body: JSON.stringify({
        event_id: eventId,
        conversion_id: conversion_id || undefined,
        value: typeof value === 'number' ? value : undefined,
        currency: currency || undefined,
        event_source_url: window.location.href,
        twclid: getTwclid() || undefined,
      }),
    }).catch(() => { /* non-blocking */ });
  } catch { /* non-blocking */ }
}

/**
 * Fire a conversion through BOTH the browser pixel and the server-side
 * Conversion API, sharing one `conversion_id` so X counts it once. Used for
 * the high-value events (purchase, deposit, lead); PageView / ContentView
 * stay pixel-only via the tracker below.
 */
export function trackConversion(eventKey, params = {}) {
  const eventId = X_EVENTS[eventKey];
  trackXEvent(eventId, params);
  sendCapiEvent(eventId, {
    conversion_id: params.conversion_id,
    value: params.value,
    currency: params.currency,
  });
}

/**
 * Route-change tracker — fires PageView on every navigation and an extra
 * ContentView on the two BOFU offer pages. Mirrors posthog's PageviewTracker.
 * Returns null (no JSX) so this stays a plain .js module.
 */
export function XPixelTracker() {
  const location = useLocation();
  useEffect(() => {
    if (!PIXEL_ID) return;
    trackXEvent(X_EVENTS.pageView, {});
    if (location.pathname === '/Onboarding' || location.pathname === '/LPDashboard') {
      trackXEvent(X_EVENTS.contentView, {});
    }
  }, [location.pathname]);
  return null;
}
