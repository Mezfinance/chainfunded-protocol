/**
 * api/contact.js — Contact form relay (server-side).
 *
 * Same-origin endpoint the Support → Contact form POSTs to. Validates the
 * submission, then forwards it as an email to the support inbox via the
 * Resend HTTP API (no SMTP, no extra npm deps — just fetch).
 *
 * DORMANT until RESEND_API_KEY is set: returns 503 with a `fallback` address
 * so the UI can tell the user to email support@ directly. Safe to deploy
 * before the mail provider is configured.
 *
 *   POST https://api.resend.com/emails
 *   header  Authorization: Bearer <RESEND_API_KEY>
 *   body    { from, to, reply_to, subject, text }
 *
 * Env:
 *   RESEND_API_KEY     — Resend API key (endpoint is dormant without it)
 *   CONTACT_TO_EMAIL   — inbox to deliver to   (default support@chainfunded.io)
 *   CONTACT_FROM_EMAIL — verified sender        (default noreply@chainfunded.io)
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const TO_EMAIL = process.env.CONTACT_TO_EMAIL || "support@chainfunded.io";
const FROM_EMAIL = process.env.CONTACT_FROM_EMAIL || "ChainFunded Contact <noreply@chainfunded.io>";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Lightweight in-memory rate limit ──────────────────────────────────────────
// Best-effort, per-instance. Vercel reuses warm instances, so this throttles the
// common "single IP bursting the endpoint" case. It is NOT a distributed limit —
// cold starts and parallel instances each get their own map. For a hard limit,
// back this with Upstash / Vercel KV. Map of ip → recent request timestamps (ms).
const RATE_LIMIT_MAX = 5; // requests…
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // …per 10 minutes, per IP
const hits = new Map();

function rateLimited(ip) {
  if (!ip) return false; // can't identify the caller — don't block legit users
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;

  // Opportunistic cleanup so the map can't grow unbounded under attack.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (!v.some((t) => t > cutoff)) hits.delete(k);
    }
  }

  const recent = (hits.get(ip) || []).filter((t) => t > cutoff);
  if (recent.length >= RATE_LIMIT_MAX) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  return req.headers["x-real-ip"] || req.socket?.remoteAddress || "";
}

function str(v) {
  return typeof v === "string" ? v.trim() : "";
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const ip = clientIp(req);

    // Throttle abusive bursts before doing any real work.
    if (rateLimited(ip)) {
      res.setHeader("Retry-After", String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)));
      return res.status(429).json({ error: "Too many messages — please try again in a few minutes." });
    }

    const body = req.body || {};

    // Honeypot — bots fill hidden fields. Pretend success and drop silently.
    if (str(body.company)) return res.status(200).json({ ok: true });

    const name = str(body.name).slice(0, 100);
    const email = str(body.email).slice(0, 200);
    const subject = str(body.subject).slice(0, 150);
    const message = str(body.message).slice(0, 5000);

    if (!name || !email || !message) {
      return res.status(400).json({ error: "Name, email, and message are required." });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }

    // Dormant until the mail provider is configured — tell the UI to fall back.
    if (!RESEND_API_KEY) {
      return res.status(503).json({
        error: "Contact form is not yet configured.",
        fallback: TO_EMAIL,
      });
    }

    const ua = req.headers["user-agent"] || "";
    const subjectLine = subject ? `Contact form: ${subject}` : `Contact form message from ${name}`;

    const text = [
      `Name:    ${name}`,
      `Email:   ${email}`,
      subject ? `Subject: ${subject}` : null,
      "",
      message,
      "",
      "—",
      `Sent from the ChainFunded contact form.`,
      `IP: ${ip}`,
      `UA: ${ua}`,
    ].filter((l) => l !== null).join("\n");

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [TO_EMAIL],
        reply_to: email,
        subject: subjectLine,
        text,
      }),
    });

    if (!resendRes.ok) {
      const detail = await resendRes.text().catch(() => "");
      console.error("Resend error", resendRes.status, detail);
      return res.status(502).json({ error: "Could not send your message. Please try again." });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("contact handler error", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
