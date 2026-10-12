"use strict";

/**
 * worker/discord.js
 *
 * Discord bot for ChainFunded — runs on the leader instance only.
 *
 * Features:
 *   - DB-driven activity notifications:
 *       • Challenge buys           (challenge_accounts inserts)
 *       • Phase 2 promotions       (challenge_accounts.phase phase_1 → phase_2)
 *       • Funded promotions        (challenge_accounts.phase → funded)
 *       • Payouts settled          (payouts.status → settled, mirrored from Base44)
 *       • LP USDC profit claims    (cfg_events.UsdcProfitClaimed)
 *   - Slash commands: /price <asset>, /prices, /stats, /digest, /backfill
 *   - Daily digest at 09:00 UTC with 24h platform summary
 *   - Price alert forwarding from PriceMonitor
 *
 * Required env vars:
 *   DISCORD_BOT_TOKEN              — bot token from Discord Developer Portal
 *   DISCORD_GUILD_ID               — server (guild) ID
 *   DISCORD_CHALLENGES_CHANNEL_ID  — channel for challenge/phase events
 *   DISCORD_PAYOUTS_CHANNEL_ID     — channel for payout + LP profit-claim events
 *   DISCORD_DIGEST_CHANNEL_ID      — channel for daily digest (falls back to payouts)
 *   DISCORD_ALERTS_CHANNEL_ID      — channel for price alerts (falls back to payouts)
 */

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
} = require("discord.js");
const {
  CRYPTO_ASSETS,
  FX_ASSETS,
  COMMODITY_ASSETS,
  STOCK_ASSETS,
} = require("./assetConfig.cjs");

// ── Asset category sets (for classification and /prices filtering) ────────────

const CRYPTO_SYMS    = new Set(CRYPTO_ASSETS.map(a => a.symbol));
const FX_SYMS        = new Set(FX_ASSETS.map(a => a.symbol));
const COMMODITY_SYMS = new Set(COMMODITY_ASSETS.map(a => a.symbol));
const STOCK_SYMS     = new Set(STOCK_ASSETS.map(a => a.symbol));

// ── DB poll cadence ───────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000;
const POST_DELAY_MS    = 250;
const BACKFILL_MAX     = 100;

// ── Helpers ───────────────────────────────────────────────────────────────────

const USDC_DECIMALS = 6;

// Accepts a USDC amount expressed either as raw 6-decimal units (BigInt /
// string) or as a whole-USDC number (e.g. Base44's payout fields).
function fmtUsdc(value) {
  if (value == null) return "$0";
  if (typeof value === "bigint" || (typeof value === "string" && /^\d+$/.test(value))) {
    const n = typeof value === "bigint" ? value : BigInt(value);
    return "$" + (Number(n) / 10 ** USDC_DECIMALS).toLocaleString("en-US", {
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    });
  }
  // Plain number — already whole USDC
  return "$" + Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  });
}

function shortAddr(addr) {
  if (!addr || typeof addr !== "string" || addr.length < 10) return "`unknown`";
  return `\`${addr.slice(0, 6)}...${addr.slice(-4)}\``;
}

// Same as shortAddr without the surrounding backticks — for use inside
// markdown that already wraps the address (e.g. leaderboard rows).
function shortAddrPlain(addr) {
  if (!addr || typeof addr !== "string" || addr.length < 10) return "unknown";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// Compact formatter for CFG points (BigInt or numeric).
function fmtPts(n) {
  if (n == null) return "0";
  const v = typeof n === "bigint" ? Number(n) : Number(n);
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toLocaleString("en-US");
}

function fmtPrice(price) {
  if (price < 0.001) return price.toFixed(8);
  if (price < 1)     return price.toFixed(6);
  if (price < 100)   return price.toFixed(4);
  return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Resolve a user-typed symbol to a key that exists in the price cache.
// Tries increasingly broad interpretations in order.
function normaliseSymbol(input, cache) {
  const upper = input.toUpperCase().trim();

  // Direct hit (e.g. "BTCUSDT", "EUR/USD", "AAPL")
  if (cache.has(upper)) return upper;

  // Already has a slash — nothing more to try
  if (upper.includes("/")) return upper;

  // USDT suffix → crypto as typed
  if (upper.endsWith("USDT")) return upper;

  // 6 all-alpha chars → likely FX pair without slash (EURUSD → EUR/USD)
  if (/^[A-Z]{6}$/.test(upper)) {
    const slashed = `${upper.slice(0, 3)}/${upper.slice(3)}`;
    if (cache.has(slashed)) return slashed;
  }

  // 7 all-alpha chars with "USD" suffix → commodity-style (XAUUSD → XAU/USD)
  if (/^[A-Z]{3}USD$/.test(upper)) {
    const slashed = `${upper.slice(0, 3)}/USD`;
    if (cache.has(slashed)) return slashed;
  }

  // Try as crypto base (BTC → BTCUSDT)
  const withUsdt = `${upper}USDT`;
  if (cache.has(withUsdt)) return withUsdt;

  // Fall through — return as typed; caller will handle miss
  return upper;
}

// Compact display name: strip USDT suffix for crypto, keep slash notation for FX/commodities
function _displaySym(sym) {
  if (sym.endsWith("USDT")) return sym.slice(0, -4);
  return sym;
}

function _embed(title, fields, color) {
  return new EmbedBuilder()
    .setTitle(title)
    .addFields(fields)
    .setColor(color)
    .setFooter({ text: "Source: ChainFunded live feed" })
    .setTimestamp();
}

// ── DiscordBot ────────────────────────────────────────────────────────────────

class DiscordBot {
  constructor({ supabase }) {
    this._supabase  = supabase;
    this._client    = null;
    this._destroyed = false;

    // In-memory price cache — updated by worker on every price tick
    this._priceCache = new Map(); // symbol → price (number)

    this._digestTimer = null;
    this._pollTimer   = null;
    this._leaderboardTimer = null;

    // Phase memo: account_id → most-recently-seen phase. Seeded from DB on
    // first poll so we don't replay every account's lifecycle on bot restart.
    this._phaseMemo = new Map();
    this._phaseMemoSeeded = false;

    // Env
    this._token        = process.env.DISCORD_BOT_TOKEN;
    this._guildId      = process.env.DISCORD_GUILD_ID;
    this._chChallenges = process.env.DISCORD_CHALLENGES_CHANNEL_ID;
    this._chPayouts    = process.env.DISCORD_PAYOUTS_CHANNEL_ID;
    this._chDigest     = process.env.DISCORD_DIGEST_CHANNEL_ID || process.env.DISCORD_PAYOUTS_CHANNEL_ID;
    this._chAlerts     = process.env.DISCORD_ALERTS_CHANNEL_ID || process.env.DISCORD_PAYOUTS_CHANNEL_ID;
    this._chLeaderboard = process.env.DISCORD_LEADERBOARD_CHANNEL_ID;
    this._seasonId      = Number(process.env.LEADERBOARD_SEASON_ID || 1);
  }

  // Called on every price tick (all instances, not just leader)
  updatePrice(symbol, price) {
    this._priceCache.set(symbol, price);
  }

  isConfigured() {
    return !!(this._token && this._guildId);
  }

  async start() {
    console.log("[discord] start() called — configured:", this.isConfigured());
    if (!this.isConfigured()) {
      console.warn("[discord] DISCORD_BOT_TOKEN or DISCORD_GUILD_ID not set — bot disabled");
      return;
    }

    this._client = new Client({ intents: [GatewayIntentBits.Guilds] });

    // Listen on both "ready" (discord.js v14 < 14.18) and "clientReady"
    // (v14.18+) so the bot initialises regardless of which v14 minor was
    // resolved by `npm install`. The flag prevents double-init when both fire.
    let initialised = false;
    const onReady = async () => {
      if (initialised) return;
      initialised = true;
      console.log(`[discord] Logged in as ${this._client.user.tag}`);
      await this._registerSlashCommands();
      this._setupInteractionHandler();
      this._startDbPoller();
      this._scheduleDailyDigest();
      this._scheduleDailyLeaderboard();
    };
    this._client.once("clientReady", onReady);
    this._client.once("ready",       onReady);

    this._client.on("error", (err) => {
      console.error("[discord] Client error:", err.message);
    });

    await this._client.login(this._token);
  }

  async stop() {
    this._destroyed = true;
    if (this._digestTimer)      clearTimeout(this._digestTimer);
    if (this._pollTimer)        clearInterval(this._pollTimer);
    if (this._leaderboardTimer) clearTimeout(this._leaderboardTimer);
    if (this._client) {
      try { await this._client.destroy(); } catch {}
      this._client = null;
    }
    console.log("[discord] Bot stopped");
  }

  // ── Slash command registration ─────────────────────────────────────────────

  async _registerSlashCommands() {
    const commands = [
      new SlashCommandBuilder()
        .setName("price")
        .setDescription("Get the current live price for an asset")
        .addStringOption(opt =>
          opt.setName("asset")
            .setDescription("Symbol, e.g. BTC, ETH, EURUSD, XAUUSD")
            .setRequired(true)
        ),
      new SlashCommandBuilder()
        .setName("prices")
        .setDescription("Show live prices from the ChainFunded feed")
        .addStringOption(opt =>
          opt.setName("category")
            .setDescription("Asset class to show (default: overview)")
            .setRequired(false)
            .addChoices(
              { name: "Overview",     value: "overview"    },
              { name: "Crypto",       value: "crypto"      },
              { name: "Forex",        value: "forex"       },
              { name: "Commodities",  value: "commodities" },
              { name: "Stocks",       value: "stocks"      },
            )
        ),
      new SlashCommandBuilder()
        .setName("stats")
        .setDescription("Show today's ChainFunded platform stats"),
      new SlashCommandBuilder()
        .setName("digest")
        .setDescription("Post the daily ChainFunded digest on demand"),
      new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("Show the current trader leaderboard for the active season"),
      new SlashCommandBuilder()
        .setName("backfill")
        .setDescription("Repost recent activity to the appropriate channels (admin only)")
        .setDefaultMemberPermissions("0")
        .addIntegerOption(opt =>
          opt.setName("hours")
            .setDescription("How many hours back to fetch (1–168, default 24)")
            .setMinValue(1)
            .setMaxValue(168)
            .setRequired(false)
        )
        .addBooleanOption(opt =>
          opt.setName("all")
            .setDescription("Dump every row in Supabase, ignoring hours (use sparingly)")
            .setRequired(false)
        ),
    ].map(c => c.toJSON());

    const rest = new REST().setToken(this._token);
    try {
      await rest.put(
        Routes.applicationGuildCommands(this._client.application.id, this._guildId),
        { body: commands }
      );
      console.log("[discord] Slash commands registered");
    } catch (err) {
      console.error("[discord] Failed to register slash commands:", err.message);
    }
  }

  // ── Slash command handler ──────────────────────────────────────────────────

  _setupInteractionHandler() {
    this._client.on("interactionCreate", async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      try {
        if (interaction.commandName === "price")       await this._cmdPrice(interaction);
        if (interaction.commandName === "prices")      await this._cmdPrices(interaction);
        if (interaction.commandName === "stats")       await this._cmdStats(interaction);
        if (interaction.commandName === "digest")      await this._cmdStats(interaction);
        if (interaction.commandName === "leaderboard") await this._cmdLeaderboard(interaction);
        if (interaction.commandName === "backfill")    await this._cmdBackfill(interaction);
      } catch (err) {
        console.error("[discord] Interaction error:", err.message);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "Something went wrong.", ephemeral: true }).catch(() => {});
        }
      }
    });
  }

  async _cmdPrice(interaction) {
    const input  = interaction.options.getString("asset");
    const symbol = normaliseSymbol(input, this._priceCache);
    const price  = this._priceCache.get(symbol);

    if (!price) {
      await interaction.reply({
        content: `No price found for **${input.toUpperCase()}**. Try \`/prices\` to see available assets.`,
        ephemeral: true,
      });
      return;
    }

    // Determine display label — show slash-notation for FX/commodities
    const label = FX_SYMS.has(symbol) || COMMODITY_SYMS.has(symbol) ? symbol : input.toUpperCase();

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle(`${label}`)
          .setDescription(`**$${fmtPrice(price)}**`)
          .setColor(0x00C896)
          .setFooter({ text: "Source: ChainFunded live feed" })
          .setTimestamp(),
      ],
    });
  }

  async _cmdPrices(interaction) {
    const category = interaction.options.getString("category") ?? "overview";

    if (this._priceCache.size === 0) {
      await interaction.reply({ content: "Price feed not yet populated — try again in a moment.", ephemeral: true });
      return;
    }

    const embeds = this._buildPriceEmbeds(category);
    if (!embeds.length) {
      await interaction.reply({ content: "No prices available for that category yet.", ephemeral: true });
      return;
    }

    await interaction.reply({ embeds });
  }

  // Builds one or more embeds for /prices depending on category.
  // Discord caps at 10 embeds per message and 25 fields per embed.
  _buildPriceEmbeds(category) {
    const pick = (syms, limit = 25) =>
      syms
        .filter(s => this._priceCache.has(s))
        .slice(0, limit)
        .map(s => ({ name: _displaySym(s), value: `$${fmtPrice(this._priceCache.get(s))}`, inline: true }));

    if (category === "crypto") {
      return [_embed("Crypto", pick([...CRYPTO_SYMS]), 0xF7931A)];
    }
    if (category === "forex") {
      return [_embed("Forex", pick([...FX_SYMS]), 0x2196F3)];
    }
    if (category === "commodities") {
      return [_embed("Commodities", pick([...COMMODITY_SYMS]), 0xFFD700)];
    }
    if (category === "stocks") {
      return [_embed("Stocks", pick([...STOCK_SYMS]), 0x9C27B0)];
    }

    // Overview: up to 8 per category across 4 embeds
    return [
      _embed("Crypto",       pick([...CRYPTO_SYMS],    8), 0xF7931A),
      _embed("Forex",        pick([...FX_SYMS],         8), 0x2196F3),
      _embed("Commodities",  pick([...COMMODITY_SYMS],  8), 0xFFD700),
      _embed("Stocks",       pick([...STOCK_SYMS],      8), 0x9C27B0),
    ].filter(e => e.data.fields?.length);
  }

  async _cmdStats(interaction) {
    await interaction.deferReply();
    try {
      const embed = await this._buildDigestEmbed();
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error("[discord] /stats failed:", err.message);
      await interaction.editReply({ content: "Failed to fetch stats." });
    }
  }

  // ── Leaderboard ────────────────────────────────────────────────────────────
  // Read-only ephemeral reply — does NOT touch the pinned channel post.

  async _cmdLeaderboard(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const embed = await this._buildLeaderboardEmbed();
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error("[discord] /leaderboard failed:", err.message);
      await interaction.editReply({ content: "Failed to build leaderboard." });
    }
  }

  async _buildLeaderboardEmbed() {
    const { data, error } = await this._supabase
      .from("cfg_events")
      .select("address, points")
      .eq("contract", "distributor")
      .eq("event_name", "RegistrationRecorded")
      .eq("season_id", this._seasonId)
      .not("address", "is", null);
    if (error) throw error;

    const byTrader = new Map();
    for (const r of data || []) {
      if (!r.points) continue;
      const prev = byTrader.get(r.address) || 0n;
      try { byTrader.set(r.address, prev + BigInt(r.points)); } catch {}
    }
    const top = [...byTrader.entries()]
      .map(([address, points]) => ({ address, points }))
      .sort((a, b) => (b.points > a.points ? 1 : b.points < a.points ? -1 : 0))
      .slice(0, 10);

    const description = top.length === 0
      ? "_No registrations yet for this season._"
      : top.map((t, i) => {
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**${i + 1}.**`;
          return `${medal} \`${shortAddrPlain(t.address)}\` — **${fmtPts(t.points)}** pts`;
        }).join("\n");

    return new EmbedBuilder()
      .setTitle(`🏆 Season ${this._seasonId} — Trader Leaderboard`)
      .setDescription(description)
      .setColor(0xF5A623)
      .setFooter({ text: "ChainFunded · Top 10 by CFG points" })
      .setTimestamp();
  }

  // Edit-in-place strategy: keep a single pinned message in the leaderboard
  // channel. On each refresh, fetch the channel's pins, find the bot's
  // existing leaderboard message (matched by author + embed title), and edit
  // it. If absent, post a fresh one and pin it.
  async _postOrUpdateLeaderboard() {
    if (!this._chLeaderboard || !this._client) return;
    try {
      const channel = await this._client.channels.fetch(this._chLeaderboard);
      const embed = await this._buildLeaderboardEmbed();
      const expectedTitle = `🏆 Season ${this._seasonId} — Trader Leaderboard`;

      let existing = null;
      try {
        const pins = await channel.messages.fetchPinned();
        existing = pins.find(m =>
          m.author?.id === this._client.user?.id &&
          m.embeds?.[0]?.title === expectedTitle
        );
      } catch (err) {
        console.warn("[discord] fetchPinned failed:", err.message);
      }

      if (existing) {
        await existing.edit({ embeds: [embed] });
      } else {
        const msg = await channel.send({ embeds: [embed] });
        // Pin so future refreshes can find this message. Missing permission
        // (Manage Messages) just means we'll send a fresh message next time
        // instead of editing — not fatal.
        try { await msg.pin(); }
        catch (err) { console.warn("[discord] pin failed:", err.message); }
      }
    } catch (err) {
      console.error("[discord] leaderboard refresh failed:", err.message);
    }
  }

  _scheduleDailyLeaderboard() {
    if (!this._chLeaderboard) {
      console.log("[discord] DISCORD_LEADERBOARD_CHANNEL_ID not set — leaderboard disabled");
      return;
    }
    // Seed the channel immediately so the pinned message exists from the
    // moment the bot starts. Subsequent refreshes happen daily at 08:00 UTC.
    this._postOrUpdateLeaderboard();

    const now = new Date();
    const next = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8, 0, 0
    ));
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    const ms = next.getTime() - now.getTime();
    console.log(`[discord] Leaderboard refresh in ${(ms / 60_000).toFixed(1)} min (${next.toISOString()})`);

    this._leaderboardTimer = setTimeout(() => {
      if (this._destroyed) return;
      this._postOrUpdateLeaderboard();
      setInterval(() => {
        if (this._destroyed) return;
        this._postOrUpdateLeaderboard();
      }, 24 * 60 * 60 * 1000);
    }, ms);
  }

  // ── /backfill (DB-driven) ─────────────────────────────────────────────────

  async _cmdBackfill(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const hours = interaction.options.getInteger("hours") ?? 24;
    const all   = interaction.options.getBoolean("all") ?? false;
    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    const cap   = all ? 500 : BACKFILL_MAX;

    try {
      // Phase promotions can't be backfilled — challenge_accounts records
      // current phase only, no transition history.
      let challengesQ = this._supabase.from("challenge_accounts")
        .select("account_id, trader_address, account_size, phase, start_date");
      let payoutsQ = this._supabase.from("payouts")
        .select("trader_address, gross_profit_usdc, trader_share_usdc, firm_share_usdc, status, settled_at")
        .eq("status", "settled");
      let claimsQ = this._supabase.from("cfg_events")
        .select("address, amount, occurred_at")
        .eq("event_name", "UsdcProfitClaimed");

      if (!all) {
        challengesQ = challengesQ.gte("start_date", since);
        payoutsQ   = payoutsQ.gte("settled_at", since);
        claimsQ    = claimsQ.gte("occurred_at", since);
      }

      const [challenges, payouts, profitClaims] = await Promise.all([
        challengesQ.order("start_date", { ascending: true }).limit(cap),
        payoutsQ.order("settled_at",   { ascending: true }).limit(cap),
        claimsQ.order("occurred_at",   { ascending: true }).limit(cap),
      ]);

      const accs = challenges.data   || [];
      const pays = payouts.data      || [];
      const lps  = profitClaims.data || [];

      // Map each account to the embed kind that matches its current phase.
      // failed / paid_out are skipped — they aren't celebratory.
      const challengeEvents = accs.flatMap((a) => {
        if (a.phase === "funded")   return [{ kind: "funded",    at: a.start_date, row: a }];
        if (a.phase === "phase_2")  return [{ kind: "phase2",    at: a.start_date, row: a }];
        if (a.phase === "phase_1")  return [{ kind: "challenge", at: a.start_date, row: a }];
        return [];
      });

      const tagged = [
        ...challengeEvents,
        ...pays.map((p) => ({ kind: "payout",    at: p.settled_at,  row: p })),
        ...lps .map((c) => ({ kind: "lp_profit", at: c.occurred_at, row: c })),
      ].sort((a, b) => new Date(a.at) - new Date(b.at));

      const totalFound = tagged.length;
      const toPost = tagged.slice(0, cap);
      const counts = { challenge: 0, phase2: 0, funded: 0, payout: 0, lp_profit: 0 };

      for (const ev of toPost) {
        await this._postEvent(ev, { backfilled: true });
        counts[ev.kind]++;
        await new Promise((r) => setTimeout(r, POST_DELAY_MS));
      }

      const truncated = totalFound > cap ? ` (capped at ${cap}; ${totalFound - cap} skipped)` : "";
      const scope = all ? "every row in Supabase" : `the last **${hours}h**`;
      await interaction.editReply({
        content: `Backfilled ${scope} from the database:\n`
          + `• ${counts.challenge} challenges, ${counts.phase2} phase-2, `
          + `${counts.funded} funded, ${counts.payout} payouts, `
          + `${counts.lp_profit} LP profit claims${truncated}.`
          + (all ? "\n_Posts ordered by start_date / settled_at / occurred_at — "
                  + "rows backdated to epoch (pre-migration) appear first._"
                : ""),
      });
    } catch (err) {
      console.error("[discord] backfill failed:", err);
      await interaction.editReply({ content: `Backfill failed: ${err.message || "unknown error"}.` });
    }
  }

  // ── Embed builders (shared by live poller and /backfill) ──────────────────

  _embedFooter(backfilled) {
    return backfilled ? "ChainFunded · backfilled" : "ChainFunded";
  }

  _challengeEmbed({ trader, accountSize, phase }, { backfilled = false } = {}) {
    const phaseLabel = String(phase) === "phase_2" ? "Phase 2" : "Phase 1";
    return new EmbedBuilder()
      .setTitle("New Challenge Registered")
      .addFields(
        { name: "Account Size", value: fmtUsdc(accountSize), inline: true },
        { name: "Phase",        value: phaseLabel,           inline: true },
        { name: "Trader",       value: shortAddr(trader),    inline: true },
      )
      .setColor(0x5865F2)
      .setFooter({ text: this._embedFooter(backfilled) })
      .setTimestamp();
  }

  _phase2Embed({ trader, accountSize }, { backfilled = false } = {}) {
    return new EmbedBuilder()
      .setTitle("Trader Passed Phase 1")
      .setDescription("A trader has advanced to the Phase 2 evaluation.")
      .addFields(
        { name: "Account Size", value: fmtUsdc(accountSize), inline: true },
        { name: "Trader",       value: shortAddr(trader),    inline: true },
      )
      .setColor(0xF5A623)
      .setFooter({ text: this._embedFooter(backfilled) })
      .setTimestamp();
  }

  _fundedEmbed({ trader, accountSize }, { backfilled = false } = {}) {
    return new EmbedBuilder()
      .setTitle("New Funded Trader")
      .setDescription("A trader has passed both phases and is now funded.")
      .addFields(
        { name: "Funded Account Size", value: fmtUsdc(accountSize), inline: true },
        { name: "Trader",              value: shortAddr(trader),    inline: true },
      )
      .setColor(0x00C896)
      .setFooter({ text: this._embedFooter(backfilled) })
      .setTimestamp();
  }

  _payoutEmbed({ trader, grossProfitUsdc, traderShareUsdc, firmShareUsdc }, { backfilled = false } = {}) {
    const fields = [];
    if (traderShareUsdc != null)  fields.push({ name: "Trader Received", value: fmtUsdc(traderShareUsdc),  inline: true });
    if (grossProfitUsdc != null)  fields.push({ name: "Gross Profit",    value: fmtUsdc(grossProfitUsdc),  inline: true });
    if (firmShareUsdc   != null)  fields.push({ name: "Protocol + LP",   value: fmtUsdc(firmShareUsdc),    inline: true });
    fields.push({ name: "Trader", value: shortAddr(trader), inline: true });
    return new EmbedBuilder()
      .setTitle("Payout Settled")
      .addFields(fields)
      .setColor(0x00C896)
      .setFooter({ text: this._embedFooter(backfilled) })
      .setTimestamp();
  }

  _lpProfitEmbed({ lp, amount }, { backfilled = false } = {}) {
    return new EmbedBuilder()
      .setTitle("LP Profit Claimed")
      .addFields(
        { name: "LP",     value: shortAddr(lp),  inline: true },
        { name: "Amount", value: fmtUsdc(amount), inline: true },
      )
      .setColor(0x14B8A6)
      .setFooter({ text: this._embedFooter(backfilled) })
      .setTimestamp();
  }

  // Dispatch a tagged event { kind, row } to the right channel + embed.
  async _postEvent({ kind, row }, opts = {}) {
    if (kind === "challenge") {
      await this._post(this._chChallenges, this._challengeEmbed({
        trader:      row.trader_address,
        accountSize: row.account_size,
        phase:       row.phase,
      }, opts));
    } else if (kind === "phase2") {
      await this._post(this._chChallenges, this._phase2Embed({
        trader: row.trader_address, accountSize: row.account_size,
      }, opts));
    } else if (kind === "funded") {
      await this._post(this._chChallenges, this._fundedEmbed({
        trader: row.trader_address, accountSize: row.account_size,
      }, opts));
    } else if (kind === "payout") {
      await this._post(this._chPayouts, this._payoutEmbed({
        trader:           row.trader_address,
        grossProfitUsdc:  row.gross_profit_usdc,
        traderShareUsdc:  row.trader_share_usdc,
        firmShareUsdc:    row.firm_share_usdc,
      }, opts));
    } else if (kind === "lp_profit") {
      await this._post(this._chPayouts, this._lpProfitEmbed({
        lp: row.address, amount: row.amount,
      }, opts));
    }
  }

  // ── DB cursor helpers ─────────────────────────────────────────────────────

  async _loadCursor(name, fallbackIso) {
    try {
      const { data, error } = await this._supabase
        .from("discord_cursor")
        .select("last_seen")
        .eq("name", name)
        .maybeSingle();
      if (error) throw error;
      if (data?.last_seen) return data.last_seen;
    } catch (err) {
      console.warn(`[discord] _loadCursor(${name}) failed:`, err.message || err);
    }
    return fallbackIso;
  }

  async _saveCursor(name, iso) {
    try {
      const { error } = await this._supabase
        .from("discord_cursor")
        .upsert({ name, last_seen: iso, updated_at: new Date().toISOString() }, { onConflict: "name" });
      if (error) throw error;
    } catch (err) {
      console.warn(`[discord] _saveCursor(${name}) failed:`, err.message || err);
    }
  }

  // ── DB poller ─────────────────────────────────────────────────────────────

  _startDbPoller() {
    console.log(`[discord] Starting DB poller (${POLL_INTERVAL_MS / 1000}s interval)`);
    // Don't await; let interval handle scheduling.
    this._pollDb();
    this._pollTimer = setInterval(() => this._pollDb(), POLL_INTERVAL_MS);
  }

  async _pollDb() {
    if (this._destroyed) return;
    try {
      // Phase memo seeding runs once on the first tick. Until it completes,
      // skip transition detection entirely so we don't mis-fire on startup.
      await this._seedPhaseMemoOnce();

      // Run independently — one failing query shouldn't stall the others.
      await Promise.allSettled([
        this._pollChallengesAndPhases(),
        this._pollPayouts(),
        this._pollLpProfitClaims(),
      ]);
    } catch (err) {
      console.error("[discord] poll error:", err.message);
    }
  }

  async _seedPhaseMemoOnce() {
    if (this._phaseMemoSeeded) return;
    try {
      const { data, error } = await this._supabase
        .from("challenge_accounts")
        .select("account_id, phase");
      if (error) throw error;
      for (const r of (data || [])) {
        if (r.account_id) this._phaseMemo.set(r.account_id, r.phase || null);
      }
      this._phaseMemoSeeded = true;
      console.log(`[discord] Phase memo seeded with ${this._phaseMemo.size} accounts`);
    } catch (err) {
      console.warn("[discord] phase memo seed failed:", err.message || err);
    }
  }

  // Posts new challenges and phase 2 / funded promotions in one query.
  //
  // The Supabase challenge_accounts table is a stripped-down mirror that
  // doesn't carry status / onchain_registered / created_date / updated_at —
  // the lifecycle indicator is the `phase` column itself ('phase_1' | 'phase_2'
  // | 'funded' | 'failed' | 'paid_out'). So instead of cursor-based polling we
  // do a full scan every tick (cheap — at most a few thousand rows) and
  // diff against the in-memory phase memo to detect changes.
  async _pollChallengesAndPhases() {
    if (!this._phaseMemoSeeded) return; // wait for seed before posting anything
    const { data, error } = await this._supabase
      .from("challenge_accounts")
      .select("account_id, trader_address, account_size, phase")
      .limit(5000);
    if (error) {
      console.warn("[discord] _pollChallengesAndPhases:", error.message);
      return;
    }
    if (!data || data.length === 0) return;

    for (const row of data) {
      if (!row.account_id) continue;
      const phase = row.phase || null;
      const hadMemo = this._phaseMemo.has(row.account_id);
      const prev = this._phaseMemo.get(row.account_id);

      if (!hadMemo) {
        // New account discovered after the seed — treat as a fresh buy.
        // Skip if it appears already-promoted (e.g. backfill landing late).
        if (phase === "phase_1" || phase == null) {
          await this._postEvent({ kind: "challenge", row });
          await new Promise((r) => setTimeout(r, POST_DELAY_MS));
        }
      } else if (prev !== phase) {
        if (phase === "phase_2") {
          await this._postEvent({ kind: "phase2", row });
          await new Promise((r) => setTimeout(r, POST_DELAY_MS));
        } else if (phase === "funded") {
          await this._postEvent({ kind: "funded", row });
          await new Promise((r) => setTimeout(r, POST_DELAY_MS));
        }
        // Other transitions (failed, paid_out, etc.) are intentionally silent.
      }

      this._phaseMemo.set(row.account_id, phase);
    }
  }

  async _pollPayouts() {
    const cursor = await this._loadCursor("payouts", new Date().toISOString());
    const { data, error } = await this._supabase
      .from("payouts")
      .select("trader_address, account_id, gross_profit_usdc, trader_share_usdc, firm_share_usdc, status, settled_at")
      .eq("status", "settled")
      .gt("settled_at", cursor)
      .order("settled_at", { ascending: true })
      .limit(100);
    if (error) {
      console.warn("[discord] _pollPayouts:", error.message);
      return;
    }
    if (!data || data.length === 0) return;

    let maxSeen = cursor;
    for (const row of data) {
      await this._postEvent({ kind: "payout", row });
      await new Promise((r) => setTimeout(r, POST_DELAY_MS));
      if (row.settled_at && row.settled_at > maxSeen) maxSeen = row.settled_at;
    }
    if (maxSeen !== cursor) await this._saveCursor("payouts", maxSeen);
  }

  async _pollLpProfitClaims() {
    const cursor = await this._loadCursor("profit_claims", new Date().toISOString());
    const { data, error } = await this._supabase
      .from("cfg_events")
      .select("address, amount, occurred_at")
      .eq("event_name", "UsdcProfitClaimed")
      .gt("occurred_at", cursor)
      .order("occurred_at", { ascending: true })
      .limit(100);
    if (error) {
      console.warn("[discord] _pollLpProfitClaims:", error.message);
      return;
    }
    if (!data || data.length === 0) return;

    let maxSeen = cursor;
    for (const row of data) {
      await this._postEvent({ kind: "lp_profit", row });
      await new Promise((r) => setTimeout(r, POST_DELAY_MS));
      if (row.occurred_at && row.occurred_at > maxSeen) maxSeen = row.occurred_at;
    }
    if (maxSeen !== cursor) await this._saveCursor("profit_claims", maxSeen);
  }

  // ── Daily digest ───────────────────────────────────────────────────────────

  _scheduleDailyDigest() {
    const now = new Date();
    const next = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 9, 0, 0
    ));
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    const ms = next.getTime() - now.getTime();
    console.log(`[discord] Daily digest in ${(ms / 60_000).toFixed(1)} min (${next.toISOString()})`);

    this._digestTimer = setTimeout(async () => {
      if (this._destroyed) return;
      await this._postDailyDigest();
      setInterval(async () => {
        if (this._destroyed) return;
        await this._postDailyDigest();
      }, 24 * 60 * 60 * 1000);
    }, ms);
  }

  async _buildDigestEmbed() {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    let challenges24h = 0;
    let payouts24h    = 0;
    let payoutVol24h  = 0;
    let activeAccounts = 0;

    try {
      const { count } = await this._supabase
        .from("challenge_accounts")
        .select("*", { count: "exact", head: true })
        .gte("start_date", since);
      challenges24h = count || 0;
    } catch {}

    try {
      const { data } = await this._supabase
        .from("payouts")
        .select("trader_share_usdc")
        .eq("status", "settled")
        .gte("settled_at", since);
      const arr = data || [];
      payouts24h   = arr.length;
      payoutVol24h = arr.reduce((sum, p) => sum + (Number(p.trader_share_usdc) || 0), 0);
    } catch {}

    try {
      const { count } = await this._supabase
        .from("challenge_accounts")
        .select("*", { count: "exact", head: true })
        .not("phase", "in", "(failed,paid_out)");
      activeAccounts = count || 0;
    } catch {}

    const priceField = (sym) => {
      const p = this._priceCache.get(sym);
      return p ? `$${fmtPrice(p)}` : "—";
    };

    // Representative prices: 3 crypto, 3 FX, 3 commodities, 3 stocks
    const priceFields = [
      { name: "​", value: "**Crypto**", inline: false },
      { name: "BTC",    value: priceField("BTCUSDT"),  inline: true },
      { name: "ETH",    value: priceField("ETHUSDT"),  inline: true },
      { name: "SOL",    value: priceField("SOLUSDT"),  inline: true },
      { name: "​", value: "**Forex**", inline: false },
      { name: "EUR/USD", value: priceField("EUR/USD"), inline: true },
      { name: "GBP/USD", value: priceField("GBP/USD"), inline: true },
      { name: "USD/JPY", value: priceField("USD/JPY"), inline: true },
      { name: "​", value: "**Commodities**", inline: false },
      { name: "Gold",   value: priceField("XAU/USD"),  inline: true },
      { name: "Silver", value: priceField("XAG/USD"),  inline: true },
      { name: "WTI",    value: priceField("WTI/USD"),  inline: true },
      { name: "​", value: "**Stocks**", inline: false },
      { name: "AAPL",   value: priceField("AAPL"),     inline: true },
      { name: "NVDA",   value: priceField("NVDA"),     inline: true },
      { name: "TSLA",   value: priceField("TSLA"),     inline: true },
    ];

    return new EmbedBuilder()
      .setTitle("ChainFunded Daily Update")
      .setDescription("Platform summary for the past 24 hours.")
      .addFields(
        { name: "New Challenges",  value: String(challenges24h),                                    inline: true },
        { name: "Payouts Settled", value: String(payouts24h),                                       inline: true },
        { name: "Total Paid Out",  value: payouts24h > 0 ? fmtUsdc(payoutVol24h) : "$0",            inline: true },
        { name: "Active Accounts", value: String(activeAccounts),                                   inline: true },
        ...priceFields,
      )
      .setColor(0x5865F2)
      .setFooter({ text: "ChainFunded — On-chain Prop Trading" })
      .setTimestamp();
  }

  async _postDailyDigest() {
    if (!this._chDigest) return;
    try {
      await this._post(this._chDigest, await this._buildDigestEmbed());
    } catch (err) {
      console.error("[discord] Daily digest failed:", err.message);
    }
  }

  // ── Price alert (called by worker from PriceMonitor events) ───────────────

  async postAlert(message) {
    if (!this._chAlerts || !this._client) return;
    await this._post(this._chAlerts, new EmbedBuilder()
      .setTitle("Price Alert")
      .setDescription(message)
      .setColor(0xFF4444)
      .setTimestamp()
    );
  }

  // ── Internal post helper ──────────────────────────────────────────────────

  async _post(channelId, embed) {
    if (!channelId || !this._client) return;
    try {
      const channel = await this._client.channels.fetch(channelId);
      await channel.send({ embeds: [embed] });
    } catch (err) {
      console.error(`[discord] Failed to post to channel ${channelId}:`, err.message);
    }
  }
}

module.exports = { DiscordBot };
