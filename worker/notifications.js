"use strict";

// Lazy lookup to avoid the community.js ↔ notifications.js cycle. By the
// time any HTTP handler runs both modules are fully loaded, so the
// indirection here is purely a load-order safety net.
const community = require("./community");
function verifyToken(payload) {
  return community.verifyToken(payload);
}

const LIST_LIMIT = 50;

/**
 * Internal helper used by other handlers to enqueue a notification.
 * Pass the supabase client + a notification record (recipient lower-cased,
 * type, human-readable title/body, optional link + payload). Returns the
 * inserted row or null on error — failures should never break the
 * triggering action.
 */
async function createNotification(supabase, {
  recipient,
  type,
  title,
  body = null,
  link = null,
  payload = {},
}) {
  if (!supabase || !recipient || !type || !title) return null;
  const row = {
    recipient_address: String(recipient).toLowerCase(),
    type: String(type),
    title: String(title).slice(0, 200),
    body: body == null ? null : String(body).slice(0, 1000),
    link: link == null ? null : String(link).slice(0, 500),
    payload: payload || {},
  };
  try {
    const { data, error } = await supabase
      .from("notifications")
      .insert(row)
      .select()
      .single();
    if (error) {
      console.error("[notifications] insert failed:", error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error("[notifications] insert threw:", err?.message || err);
    return null;
  }
}

async function handleNotificationsList({ payload, supabase }) {
  const auth = verifyToken(payload || {});
  if (!auth.ok) return { status: 401, body: { error: auth.error } };

  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, payload, read_at, created_at")
    .eq("recipient_address", auth.address)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) return { status: 500, body: { error: error.message } };

  const { count: unread } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("recipient_address", auth.address)
    .is("read_at", null);

  return { status: 200, body: { notifications: data || [], unread: unread || 0 } };
}

async function handleNotificationMarkRead({ payload, supabase }) {
  const auth = verifyToken(payload || {});
  if (!auth.ok) return { status: 401, body: { error: auth.error } };

  const id = payload?.id;
  if (!id) return { status: 400, body: { error: "Missing id" } };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("recipient_address", auth.address)
    .is("read_at", null);
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { ok: true } };
}

async function handleNotificationMarkAllRead({ payload, supabase }) {
  const auth = verifyToken(payload || {});
  if (!auth.ok) return { status: 401, body: { error: auth.error } };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_address", auth.address)
    .is("read_at", null);
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { ok: true } };
}

// Mutate the existing module.exports rather than replacing it, so callers
// caught in the community.js ↔ notifications.js cycle (which capture this
// object before notifications.js finishes loading) end up pointing at the
// same instance once it's fully populated. A reassignment via
// `module.exports = { ... }` would orphan their early-captured reference.
module.exports.createNotification = createNotification;
module.exports.handleNotificationsList = handleNotificationsList;
module.exports.handleNotificationMarkRead = handleNotificationMarkRead;
module.exports.handleNotificationMarkAllRead = handleNotificationMarkAllRead;
