"use strict";

/**
 * worker/logStore.js
 *
 * Best-effort persistence of the worker's console output to Supabase so we
 * have a durable, queryable history to audit after the fact. Fly's runtime
 * logs are a live tail only — nothing older than a few days survives — which
 * is why a past incident (a margin-reduce that left no trace) couldn't be
 * reconstructed from logs.
 *
 * Design (deliberately low-effort, loss-tolerant):
 *   - Patches console.{log,info,warn,error} to also buffer each line in memory.
 *   - Flushes the buffer to the `worker_logs` table on a long interval
 *     (default 24h) and once more on graceful shutdown.
 *   - A safety flush fires early if the buffer reaches MAX_BUFFER so a busy day
 *     can't balloon memory. If even that is outrun, the oldest lines are
 *     dropped (a marker row records how many) — missing the odd line is fine;
 *     this is an audit backstop, not the source of truth.
 *   - Logging never blocks or throws into the hot path: capture is synchronous
 *     and cheap, flushes are async and swallow their own errors.
 *
 * Run worker/schema/worker_logs.sql in Supabase before deploying.
 */

const util = require("util");

const MAX_BUFFER = 20_000;          // safety-flush threshold (≈ a few MB)
const INSERT_CHUNK = 1_000;         // rows per insert call
const DEFAULT_FLUSH_MS = 24 * 60 * 60 * 1000;

// Saved originals so the module's own logging never re-enters capture.
const orig = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

let buffer = [];
let dropped = 0;
let installed = false;
let flushing = false;

let _supabase = null;
let _interval = null;
let _region = process.env.FLY_REGION || "";
let _machine = process.env.FLY_MACHINE_ID || process.env.FLY_ALLOC_ID || "";

function record(level, args) {
  let line;
  try {
    line = util.format(...args);
  } catch {
    line = String(args?.[0] ?? "");
  }
  buffer.push({ ts: new Date().toISOString(), level, line });
  // Safety flush so memory stays bounded between the daily flushes.
  if (buffer.length >= MAX_BUFFER && !flushing && _supabase) {
    flush().catch(() => {});
  }
}

/** Patch console so every line is mirrored into the buffer (once). */
function installConsoleCapture() {
  if (installed) return;
  installed = true;
  console.log = (...a) => { orig.log(...a); record("info", a); };
  console.info = (...a) => { orig.info(...a); record("info", a); };
  console.warn = (...a) => { orig.warn(...a); record("warn", a); };
  console.error = (...a) => { orig.error(...a); record("error", a); };
}

/**
 * Flush the buffered lines to Supabase. Swaps the buffer up front so capture
 * keeps working during the (async) insert. Best-effort: on failure the batch
 * is dropped, not retried, to keep this off the critical path.
 */
async function flush() {
  if (!_supabase || flushing) return;
  if (buffer.length === 0 && dropped === 0) return;
  flushing = true;

  const batch = buffer;
  const droppedNow = dropped;
  buffer = [];
  dropped = 0;

  try {
    const rows = batch.map((e) => ({
      ts: e.ts, level: e.level, line: e.line, region: _region, machine: _machine,
    }));
    if (droppedNow > 0) {
      rows.unshift({
        ts: new Date().toISOString(), level: "warn", region: _region, machine: _machine,
        line: `[logStore] dropped ${droppedNow} buffered line(s) before this flush (buffer overflow)`,
      });
    }
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const chunk = rows.slice(i, i + INSERT_CHUNK);
      const { error } = await _supabase.from("worker_logs").insert(chunk);
      if (error) throw new Error(error.message);
    }
  } catch (err) {
    // Use the original console so this failure isn't itself captured/looped.
    orig.error(`[logStore] flush failed (${batch.length} lines dropped):`, err.message);
  } finally {
    flushing = false;
  }
}

/** Begin periodic flushing. Safe to call once Supabase is ready. */
function start({ supabase, intervalMs } = {}) {
  if (supabase) _supabase = supabase;
  if (_interval) return;
  const every = Number(process.env.WORKER_LOG_FLUSH_MS) || intervalMs || DEFAULT_FLUSH_MS;
  _interval = setInterval(() => { flush().catch(() => {}); }, every);
  if (_interval.unref) _interval.unref(); // don't keep the process alive for it
  orig.log(`[logStore] capturing console → worker_logs, flushing every ${Math.round(every / 3600000)}h`);
}

/** Stop the timer and do one final flush (call from shutdown). */
async function stopAndFlush() {
  if (_interval) { clearInterval(_interval); _interval = null; }
  await flush();
}

module.exports = { installConsoleCapture, start, flush, stopAndFlush };
