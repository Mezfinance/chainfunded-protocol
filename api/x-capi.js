/**
 * api/x-capi.js — X (Twitter) Conversion API relay (server-side).
 *
 * First-party, same-origin endpoint the browser calls when it fires an X
 * pixel conversion. Because it's first-party, ad-blockers don't block it
 * (they block static.ads-twitter.com), so this recovers conversions the
 * browser pixel loses to blockers / ITP. The server attaches the request IP
 * + user-agent as match identifiers and forwards to X with the secret token.
 *
 * DORMANT until X_PIXEL_TOKEN is set: returns 204 and forwards nothing, so
 * it's safe to deploy before the campaign is configured.
 *
 * Dedup: the browser pixel and this relay send the SAME `conversion_id`
 * (the on-chain tx hash), so X counts each conversion once.
 *
 *   POST https://ads-api.x.com/12/measurement/conversions/{pixel_id}
 *   header  X-Pixel-Token: <token>
 *   body    { "conversions": [ { conversion_time, event_id, identifiers, ... } ] }
 */

const X_PIXEL_TOKEN = process.env.X_PIXEL_TOKEN || "";
const X_PIXEL_ID = process.env.X_PIXEL_ID || "rcsip";
const X_ADS_API_VERSION = process.env.X_ADS_API_VERSION || "12";

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  return req.headers["x-real-ip"] || req.socket?.remoteAddress || "";
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Dormant until the secret token is configured in the environment.
  if (!X_PIXEL_TOKEN) return res.status(204).end();

  try {
    const { event_id, conversion_id, event_source_url, twclid, value, currency } = req.body || {};

    // event_id is the X event-tag string (e.g. "tw-rcsip-xxxxx"). Reject
    // anything that isn't a well-formed tag so we never relay junk to X.
    if (typeof event_id !== "string" || !event_id.startsWith("tw-")) {
      return res.status(400).json({ error: "Invalid event_id" });
    }

    const ip = clientIp(req);
    const ua = req.headers["user-agent"] || "";

    // At least one of: twclid, hashed_email, hashed_phone, or the ip+ua pair.
    // ChainFunded is wallet-based (no email/phone), so we match on twclid +
    // ip/ua. No PII is stored here — it's forwarded straight to X.
    const identifier = {};
    if (typeof twclid === "string" && twclid) identifier.twclid = twclid;
    if (ip) identifier.ip_address = ip;
    if (ua) identifier.user_agent = ua;
    if (!identifier.twclid && !(identifier.ip_address && identifier.user_agent)) {
      return res.status(204).end(); // nothing X can match on — drop quietly
    }

    const conversion = {
      conversion_time: new Date().toISOString(),
      event_id,
      identifiers: [identifier],
    };
    if (typeof conversion_id === "string" && conversion_id) {
      conversion.conversion_id = conversion_id;
    }
    if (typeof event_source_url === "string" && event_source_url) {
      conversion.event_source_url = event_source_url;
    }
    // Conversion value for ROAS (X conversions schema: value + price_currency).
    // Guarded so they're only sent when present, matching the browser pixel.
    if (typeof value === "number" && Number.isFinite(value)) {
      conversion.value = value;
    }
    if (typeof currency === "string" && currency) {
      conversion.price_currency = currency;
    }

    const url = `https://ads-api.x.com/${X_ADS_API_VERSION}/measurement/conversions/${X_PIXEL_ID}`;
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Pixel-Token": X_PIXEL_TOKEN,
      },
      body: JSON.stringify({ conversions: [conversion] }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      console.error("[x-capi] upstream error", upstream.status, detail.slice(0, 500));
      // Never surface upstream failures to the browser — tracking must not
      // break UX. Accept the event; the problem is logged server-side.
      return res.status(202).end();
    }

    return res.status(204).end();
  } catch (err) {
    console.error("[x-capi] handler error", err);
    return res.status(202).end();
  }
}
