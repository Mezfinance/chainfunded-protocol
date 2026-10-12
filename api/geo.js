/**
 * api/geo.js — tells the client whether marketing consent is required.
 *
 * Vercel sets `x-vercel-ip-country` on every request. We map EU / EEA / UK
 * visitors to consentRequired=true so the consent banner gates the X pixel +
 * Conversion API for them; everyone else is fired by default (with opt-out).
 *
 * Fail-safe: if the country can't be determined, we require consent.
 */
const CONSENT_REQUIRED = new Set([
  // EU member states
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
  // EEA (non-EU)
  "IS", "LI", "NO",
  // United Kingdom
  "GB",
]);

export default function handler(req, res) {
  const country = String(req.headers["x-vercel-ip-country"] || "").toUpperCase();
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    country: country || null,
    // Unknown country → require consent (fail safe / privacy-preserving).
    consentRequired: country ? CONSENT_REQUIRED.has(country) : true,
  });
}
