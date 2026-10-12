import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL     = "https://drjpicmejsnixetyqvkv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRyanBpY21lanNuaXhldHlxdmt2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NjU3NzAsImV4cCI6MjA5MDA0MTc3MH0.vQuSN1fuN-Mh2ecQeR_r0wBZW28FZZcivTz5WZoXU1w";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Fire-and-forget sync helpers ──────────────────────────────────────────────
// These never throw and never block the UI.
// They keep Supabase in sync with base44 so the worker has fresh data.

// Only send columns that exist in the Supabase trades table.
// base44 returns extra system fields (created_date, created_by, etc.)
// that would cause the upsert to fail.
const TRADE_COLS = [
  "account_id", "trader_address", "symbol", "direction", "entry_price",
  "exit_price", "size", "leverage", "pnl", "pnl_pct", "status",
  "open_time", "close_time", "order_type", "limit_price", "stop_price",
  "sl", "tp", "reduce_only", "trailing_rate",
];

function pickTradeFields(data) {
  const out = {};
  for (const k of TRADE_COLS) {
    if (data[k] !== undefined) out[k] = data[k];
  }
  return out;
}

const ACCOUNT_COLS = [
  "account_id",
  "trader_address",     "account_size",
  "starting_balance",   "current_balance",
  "phase",
  "max_daily_loss_pct", "max_total_loss_pct",
  "daily_loss_today",   "day_start_balance",
  "api_secret",
  "start_date",
  "chain_id",
];

function pickAccountFields(data) {
  const out = {};
  for (const k of ACCOUNT_COLS) {
    if (data[k] !== undefined) out[k] = data[k];
  }
  return out;
}

export async function syncTrade(id, data) {
  const row = { id, ...pickTradeFields(data) };
  const { error } = await supabase.from("trades").upsert(row, { onConflict: "id" });
  if (error) console.error("[syncTrade] Supabase error:", error.message, error.details, error.hint);
}

export async function syncAccount(id, data) {
  const fields = pickAccountFields(data);
  // UPDATE first — works regardless of whether the UNIQUE constraint on
  // account_id has been applied. If no row matches, fall through to INSERT.
  const { data: updated, error: updateErr } = await supabase
    .from("challenge_accounts")
    .update(fields)
    .eq("account_id", id)
    .select("account_id");
  if (updateErr) {
    console.error("[syncAccount] update error:", updateErr.message, updateErr.details, updateErr.hint);
    return;
  }
  if (updated && updated.length > 0) return;
  const { error: insertErr } = await supabase
    .from("challenge_accounts")
    .insert({ account_id: id, ...fields });
  if (insertErr) console.error("[syncAccount] insert error:", insertErr.message, insertErr.details, insertErr.hint);
}

