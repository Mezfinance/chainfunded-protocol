"use strict";

// HTTP handlers for the X-bot admin flow. All endpoints require an admin
// EIP-191 token — same auth pattern as the community moderator endpoints.

const community = require("./community");
function verifyToken(payload) { return community.verifyToken(payload); }

// Hardcoded super-admin addresses, mirrors community.js.
const ADMIN_ADDRESSES = new Set(
  (process.env.ADMIN_ADDRESSES || process.env.VITE_ADMIN_ADDRESSES || "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

function requireAdmin(payload) {
  const auth = verifyToken(payload || {});
  if (!auth.ok) return { ok: false, status: 401, error: auth.error };
  if (!ADMIN_ADDRESSES.has(auth.address)) {
    return { ok: false, status: 403, error: "Admin role required" };
  }
  return { ok: true, address: auth.address };
}

const VALID_STATUSES = new Set(["pending_review", "approved", "posted", "rejected"]);

async function handleXBotList({ payload, supabase }) {
  const auth = requireAdmin(payload);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  const status = payload?.status && VALID_STATUSES.has(payload.status) ? payload.status : null;
  const limit = Math.min(Math.max(Number(payload?.limit) || 50, 1), 200);

  // IMPORTANT: do NOT include image_b64 here. Each row's image_b64 is a base64
  // 1080×1080 PNG (~1–2 MB); a 50-row response would load ~75 MB into the
  // worker just for image data and OOM-kill the 256 MB machine — that's what
  // crashed both sin and syd within seconds on 2026-06-04. The frontend
  // fetches each image lazily via /xbot/image?id=… when the row renders.
  let q = supabase
    .from("bot_posts")
    .select("id, topic, body, card_template, status, rejected_reason, tweet_url, posted_at, created_at, media_type, video_path")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { posts: data || [] } };
}

// Returns the base64 image for a single bot_post. Separate endpoint so the
// list call stays small (see handleXBotList comment).
async function handleXBotImage({ payload, supabase }) {
  const auth = requireAdmin(payload);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  const id = payload?.id;
  if (!id) return { status: 400, body: { error: "Missing id" } };

  const { data, error } = await supabase
    .from("bot_posts")
    .select("image_b64, media_type")
    .eq("id", id)
    .maybeSingle();
  if (error) return { status: 500, body: { error: error.message } };
  if (!data) return { status: 404, body: { error: "Not found" } };
  // Video posts have no image_b64 — caller renders the placeholder.
  return { status: 200, body: { image_b64: data.image_b64 || null, media_type: data.media_type } };
}

async function handleXBotApprove({ payload, supabase }) {
  const auth = requireAdmin(payload);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  const id = payload?.id;
  if (!id) return { status: 400, body: { error: "Missing id" } };

  const { error } = await supabase
    .from("bot_posts")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending_review");
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { ok: true } };
}

async function handleXBotReject({ payload, supabase }) {
  const auth = requireAdmin(payload);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  const id = payload?.id;
  if (!id) return { status: 400, body: { error: "Missing id" } };
  const reason = payload?.reason ? String(payload.reason).slice(0, 500) : null;

  const { error } = await supabase
    .from("bot_posts")
    .update({
      status: "rejected",
      rejected_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { ok: true } };
}

module.exports.handleXBotList = handleXBotList;
module.exports.handleXBotImage = handleXBotImage;
module.exports.handleXBotApprove = handleXBotApprove;
module.exports.handleXBotReject = handleXBotReject;
