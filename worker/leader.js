"use strict";

/**
 * worker/leader.js
 *
 * Postgres-backed leader election for multi-region redundancy.
 *
 * How it works:
 *   - A single row in `worker_leader` tracks the active leader.
 *   - On startup each worker tries to claim leadership by updating the row
 *     WHERE the heartbeat has expired OR the row doesn't exist yet.
 *   - The leader heartbeats every HEARTBEAT_INTERVAL_MS.
 *   - Standbys poll every POLL_INTERVAL_MS and take over if the heartbeat
 *     is older than LEASE_TTL_MS.
 *   - Failover is automatic and takes at most LEASE_TTL_MS + POLL_INTERVAL_MS.
 *
 * Requires a Supabase table:
 *
 *   CREATE TABLE IF NOT EXISTS worker_leader (
 *     id            int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
 *     leader_id     text NOT NULL,
 *     region        text NOT NULL DEFAULT '',
 *     last_heartbeat timestamptz NOT NULL DEFAULT now()
 *   );
 *   INSERT INTO worker_leader (id, leader_id) VALUES (1, '')
 *     ON CONFLICT DO NOTHING;
 */

const crypto = require("crypto");

const LEASE_TTL_MS        = 30_000;   // leader must heartbeat within this window
const HEARTBEAT_INTERVAL_MS = 10_000; // leader heartbeats every 10s
const POLL_INTERVAL_MS      = 10_000; // standbys check every 10s

// If consecutive Supabase round-trips fail this many times, this machine's
// outbound network is almost certainly wedged (the Sydney 2026-06-03 incident
// is the prototype: TLS handshakes failing to Supabase, Base44 AND Pyth at
// once, traffic still routed to a useless machine). Exit so Fly restarts us —
// the cluster keeps running on the other regions. At POLL_INTERVAL_MS=10s,
// the default of 12 means ~2 minutes of broken networking before self-eviction.
// During a real Supabase outage every machine will restart in turn, but they'd
// be useless anyway since they can't reach Supabase.
const MAX_CONSECUTIVE_FAILURES = parseInt(
  process.env.LEADER_MAX_CONSECUTIVE_FAILURES || "12", 10);

class LeaderElection {
  /**
   * @param {import("@supabase/supabase-js").SupabaseClient} supabase
   * @param {object} opts
   * @param {string} [opts.region] - Fly region (FLY_REGION env var)
   */
  constructor(supabase, opts = {}) {
    this._supabase   = supabase;
    // Prefer Fly's machine id so standbys can return `fly-replay:
    // instance=<id>` headers and have Fly's edge proxy forward leader-only
    // requests to the right machine. Falls back to a random UUID for local
    // dev (no Fly env).
    this._id         = process.env.FLY_MACHINE_ID || crypto.randomUUID();
    this._region     = opts.region || process.env.FLY_REGION || "local";
    this._isLeader   = false;
    this._heartbeatTimer = null;
    this._pollTimer      = null;
    this._onPromote  = null;
    this._onDemote   = null;
    // Last seen leader id (any machine — leader, standby, or follower).
    // Updated whenever we read worker_leader. Used for fly-replay routing.
    this._currentLeaderId = null;
    // Consecutive Supabase-call failures across the leader loop (claim +
    // heartbeat). Reset on any successful round-trip; triggers process.exit(1)
    // at MAX_CONSECUTIVE_FAILURES so Fly restarts a wedged machine.
    this._consecutiveFailures = 0;
  }

  _recordSuccess() { this._consecutiveFailures = 0; }

  _recordFailure(context, msg) {
    this._consecutiveFailures++;
    console.error(`[leader] ${context}: ${msg} (consecutive failures: ${this._consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`);
    if (this._consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.error(`[leader] FATAL: ${this._consecutiveFailures} consecutive Supabase failures — outbound network looks wedged. Exiting so Fly restarts the machine.`);
      // Stop the timers so we don't fire more callbacks during exit.
      this.stop();
      // Exit non-zero so Fly restarts. Brief delay so the log flushes.
      setTimeout(() => process.exit(1), 100);
    }
  }

  get isLeader() { return this._isLeader; }
  get id()       { return this._id; }
  get region()   { return this._region; }
  /** ID of the currently elected leader, or null if unknown. */
  get currentLeaderId() { return this._currentLeaderId; }

  /** Register callback for when this instance becomes leader. */
  onPromote(fn) { this._onPromote = fn; }

  /** Register callback for when this instance loses leadership. */
  onDemote(fn) { this._onDemote = fn; }

  /**
   * Start the election loop. Attempts to claim leadership immediately,
   * then polls on interval.
   */
  async start() {
    console.log(`[leader] Worker ${this._id} (${this._region}) starting election`);
    await this._tryAcquire();
    this._pollTimer = setInterval(() => this._tryAcquire(), POLL_INTERVAL_MS);
  }

  stop() {
    clearInterval(this._heartbeatTimer);
    clearInterval(this._pollTimer);
    this._heartbeatTimer = null;
    this._pollTimer = null;
  }

  async _tryAcquire() {
    try {
      const cutoff = new Date(Date.now() - LEASE_TTL_MS).toISOString();

      // Attempt to claim: only succeeds if heartbeat expired or we already own it
      const { data, error } = await this._supabase.rpc("worker_claim_leader", {
        p_leader_id: this._id,
        p_region: this._region,
        p_cutoff: cutoff,
      });

      if (error) {
        // If the RPC doesn't exist yet, fall back to direct query approach
        if (error.code === "42883") {
          await this._tryAcquireDirect(cutoff);
          return;
        }
        this._recordFailure("Claim RPC error", error.message);
        return;
      }

      this._recordSuccess();
      const claimed = data === true || data === this._id;
      this._handleResult(claimed);
      // Refresh our view of who currently holds leadership so standbys can
      // route trade requests via fly-replay.
      await this._refreshCurrentLeader();
    } catch (err) {
      this._recordFailure("Election error", err.message);
    }
  }

  /**
   * Fallback: direct UPDATE if the RPC isn't deployed yet.
   * Uses a conditional update — only succeeds if lease expired or we own it.
   */
  async _tryAcquireDirect(cutoff) {
    const now = new Date().toISOString();

    // Try to take over expired lease
    const { data, error } = await this._supabase
      .from("worker_leader")
      .update({
        leader_id: this._id,
        region: this._region,
        last_heartbeat: now,
      })
      .eq("id", 1)
      .or(`last_heartbeat.lt.${cutoff},leader_id.eq.${this._id}`)
      .select("leader_id");

    if (error) {
      this._recordFailure("Direct claim error", error.message);
      return;
    }

    this._recordSuccess();
    const claimed = data && data.length > 0 && data[0].leader_id === this._id;
    this._handleResult(claimed);
    await this._refreshCurrentLeader();
  }

  _handleResult(claimed) {
    if (claimed && !this._isLeader) {
      // Promoted
      this._isLeader = true;
      console.log(`[leader] PROMOTED — this worker is now the active leader (${this._region})`);
      this._startHeartbeat();
      if (this._onPromote) this._onPromote();
    } else if (!claimed && this._isLeader) {
      // Demoted (another worker took over — shouldn't happen normally)
      this._isLeader = false;
      console.warn(`[leader] DEMOTED — another worker claimed leadership`);
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
      if (this._onDemote) this._onDemote();
    }
    // else: no change
  }

  _startHeartbeat() {
    clearInterval(this._heartbeatTimer);
    this._heartbeatTimer = setInterval(() => this._heartbeat(), HEARTBEAT_INTERVAL_MS);
  }

  async _heartbeat() {
    try {
      const { error } = await this._supabase
        .from("worker_leader")
        .update({ last_heartbeat: new Date().toISOString() })
        .eq("id", 1)
        .eq("leader_id", this._id);

      if (error) {
        this._recordFailure("Heartbeat error", error.message);
      } else {
        this._recordSuccess();
      }
    } catch (err) {
      this._recordFailure("Heartbeat exception", err.message);
    }
  }

  // Pulls the current leader_id from the worker_leader row so standbys can
  // emit a fly-replay header pointing at the right machine. Treats stale
  // (heartbeat older than LEASE_TTL_MS) as no leader so we don't forward
  // requests into a black hole during failover.
  async _refreshCurrentLeader() {
    try {
      const { data, error } = await this._supabase
        .from("worker_leader")
        .select("leader_id, last_heartbeat")
        .eq("id", 1)
        .maybeSingle();
      if (error || !data) {
        this._currentLeaderId = null;
        return;
      }
      const ageMs = Date.now() - new Date(data.last_heartbeat).getTime();
      this._currentLeaderId = ageMs <= LEASE_TTL_MS ? data.leader_id || null : null;
    } catch {
      this._currentLeaderId = null;
    }
  }
}

module.exports = { LeaderElection };
