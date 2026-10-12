/**
 * datetime — centralised UTC formatting for all platform timestamps.
 *
 * The platform's rules run on UTC: the daily-loss limit resets and the
 * trading-day count rolls at 00:00 UTC (worker/index.js resetDailyLoss +
 * worker/executors.js). Displaying timestamps in the viewer's local timezone
 * made trades/records appear on a different day than the rules enforced, which
 * confused traders. Every user-facing timestamp must go through these helpers
 * so the whole app speaks UTC. A global "times are UTC" note lives in the
 * Layout footer.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => String(n).padStart(2, "0");

function toDate(value) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// "Jun 23, 2026" (year optional → "Jun 23"). Date-only carries no timezone
// suffix; the global footer note covers it.
export function formatUtcDate(value, { year = true } = {}) {
  const d = toDate(value);
  if (!d) return "—";
  const base = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return year ? `${base}, ${d.getUTCFullYear()}` : base;
}

// "23:30" — 24h UTC clock time, no suffix (caller adds "UTC" if standalone).
export function formatUtcTime(value) {
  const d = toDate(value);
  if (!d) return "—";
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// "Jun 23, 23:30 UTC" (year optional). Combined date+time always carries the
// explicit "UTC" suffix since it reads as "when this happened".
export function formatUtcDateTime(value, { year = false } = {}) {
  const d = toDate(value);
  if (!d) return "—";
  return `${formatUtcDate(d, { year })}, ${formatUtcTime(d)} UTC`;
}
