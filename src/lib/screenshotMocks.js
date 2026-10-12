/**
 * screenshotMocks.js
 *
 * Fixture data, mock providers, and mock prices used when VITE_SCREENSHOTS=true.
 * Nothing in this file runs in production builds where the env flag is absent.
 */

export const MOCK_ADDRESS = "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9012";

// ─── Accounts ────────────────────────────────────────────────────────────────

export const MOCK_ACCOUNTS = [
  // Phase 1 — main account (3/4 trading days, ~55% toward 10% target)
  {
    id: "acc-p1-1234abcd",
    trader_address: MOCK_ADDRESS,
    account_size: 50000,
    starting_balance: 50000,
    current_balance: 52734.56,
    peak_balance: 52734.56,
    phase: "phase_1",
    max_daily_loss_pct: 5,
    max_total_loss_pct: 10,
    daily_loss_today: 0,
    trading_days_count: 3,
    min_trading_days: 4,
    start_date: "2026-03-18",
    fee_tx_hash: "0xfee1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9",
    onchain_registered: true,
    challenge_fee_usdc: 345,
    status: "active",
  },
  // Phase 1 — pre-trade (25K, 5+ trading days, all gauges green)
  {
    id: "acc-p1-pretrade",
    trader_address: MOCK_ADDRESS,
    account_size: 25000,
    starting_balance: 25000,
    current_balance: 25142.30,
    peak_balance: 25142.30,
    phase: "phase_1",
    max_daily_loss_pct: 5,
    max_total_loss_pct: 10,
    daily_loss_today: 0,
    trading_days_count: 5,
    min_trading_days: 4,
    start_date: "2026-03-20",
    fee_tx_hash: "0xfee_pretrade_abc123",
    onchain_registered: true,
    challenge_fee_usdc: 250,
    status: "active",
  },
  // Phase 2 — in progress (~73% toward 5% target)
  {
    id: "acc-p2-5678efgh",
    trader_address: MOCK_ADDRESS,
    account_size: 50000,
    starting_balance: 50000,
    current_balance: 51834.20,
    peak_balance: 51834.20,
    phase: "phase_2",
    max_daily_loss_pct: 5,
    max_total_loss_pct: 10,
    daily_loss_today: 0,
    trading_days_count: 3,
    min_trading_days: 3,
    start_date: "2026-03-22",
    fee_tx_hash: "0xfee5678efgh1234567",
    onchain_registered: true,
    challenge_fee_usdc: 345,
    status: "active",
  },
  // Funded account — 8.46% profit, all compliance rules met
  {
    id: "acc-fn-9abc0def",
    trader_address: MOCK_ADDRESS,
    account_size: 50000,
    starting_balance: 50000,
    current_balance: 54231.10,
    peak_balance: 54231.10,
    phase: "funded",
    max_daily_loss_pct: 5,
    max_total_loss_pct: 10,
    daily_loss_today: 0,
    trading_days_count: 5,
    min_trading_days: 4,
    start_date: "2026-03-10",
    fee_tx_hash: "0xfeeabcdef9012345",
    onchain_registered: true,
    challenge_fee_usdc: 345,
    status: "active",
  },
  // Funded $10K account — $90 profit, 4 trading days (for payout screenshots)
  {
    id: "acc-fn-10k-payout",
    trader_address: MOCK_ADDRESS,
    account_size: 10000,
    starting_balance: 10000,
    current_balance: 10090,
    peak_balance: 10090,
    phase: "funded",
    max_daily_loss_pct: 5,
    max_total_loss_pct: 10,
    daily_loss_today: 0,
    trading_days_count: 4,
    min_trading_days: 4,
    start_date: "2026-03-18",
    fee_tx_hash: "0xfee10k1234567890",
    onchain_registered: true,
    challenge_fee_usdc: 99,
    status: "active",
  },
  // Phase 1 complete — 10.3% profit, 5 days (all targets met, ready to advance)
  {
    id: "acc-p1-complete",
    trader_address: MOCK_ADDRESS,
    account_size: 50000,
    starting_balance: 50000,
    current_balance: 55148.40,
    peak_balance: 55148.40,
    phase: "phase_1",
    max_daily_loss_pct: 5,
    max_total_loss_pct: 10,
    daily_loss_today: 0,
    trading_days_count: 5,
    min_trading_days: 4,
    start_date: "2026-03-17",
    fee_tx_hash: "0xfeep1complete1234abcdef",
    onchain_registered: true,
    challenge_fee_usdc: 345,
    status: "active",
  },
  // Phase 2 complete — 5.1% profit, 3 days (all targets met, ready for funded)
  {
    id: "acc-p2-complete",
    trader_address: MOCK_ADDRESS,
    account_size: 50000,
    starting_balance: 50000,
    current_balance: 52552.10,
    peak_balance: 52552.10,
    phase: "phase_2",
    max_daily_loss_pct: 5,
    max_total_loss_pct: 10,
    daily_loss_today: 0,
    trading_days_count: 3,
    min_trading_days: 3,
    start_date: "2026-03-21",
    fee_tx_hash: "0xfeep2complete5678efgh",
    onchain_registered: true,
    challenge_fee_usdc: 345,
    status: "active",
  },
  // Failed account — breached 10% total loss
  {
    id: "acc-xx-1234cafe",
    trader_address: MOCK_ADDRESS,
    account_size: 50000,
    starting_balance: 50000,
    current_balance: 44978.23,
    peak_balance: 50000,
    phase: "failed",
    max_daily_loss_pct: 5,
    max_total_loss_pct: 10,
    daily_loss_today: -2341.50,
    trading_days_count: 2,
    min_trading_days: 4,
    start_date: "2026-03-01",
    fee_tx_hash: "0xfeecafe12345abcdef",
    onchain_registered: true,
    challenge_fee_usdc: 345,
    status: "active",
  },
];

// ─── Trades ───────────────────────────────────────────────────────────────────

export const MOCK_TRADES = [
  // Phase 1 main account — closed trades across multiple days
  { id: "tr-p1-01", account_id: "acc-p1-1234abcd", symbol: "BTCUSDT", direction: "long",  entry_price: 85100, exit_price: 85642, size: 5000, leverage: 5, pnl: 134.50, pnl_pct: 13.45, status: "closed", open_time: "2026-03-19T09:15:00Z", close_time: "2026-03-19T14:30:00Z" },
  { id: "tr-p1-02", account_id: "acc-p1-1234abcd", symbol: "ETHUSDT", direction: "short", entry_price: 2180, exit_price: 2154, size: 2000, leverage: 3, pnl: 256.80, pnl_pct: 17.12, status: "closed", open_time: "2026-03-20T08:00:00Z", close_time: "2026-03-20T11:45:00Z" },
  { id: "tr-p1-03", account_id: "acc-p1-1234abcd", symbol: "BTCUSDT", direction: "long",  entry_price: 86400, exit_price: 86148, size: 3000, leverage: 4, pnl: -87.30, pnl_pct: -11.64, status: "closed", open_time: "2026-03-21T10:00:00Z", close_time: "2026-03-21T12:20:00Z" },
  { id: "tr-p1-04", account_id: "acc-p1-1234abcd", symbol: "SOLUSDT", direction: "long",  entry_price: 126.5, exit_price: 130.2, size: 1500, leverage: 6, pnl: 439.53, pnl_pct: 29.30, status: "closed", open_time: "2026-03-22T08:30:00Z", close_time: "2026-03-22T15:00:00Z" },
  { id: "tr-p1-05", account_id: "acc-p1-1234abcd", symbol: "BTCUSDT", direction: "short", entry_price: 87200, exit_price: 86845, size: 2500, leverage: 5, pnl: 114.68, pnl_pct: 22.94, status: "closed", open_time: "2026-03-24T09:00:00Z", close_time: "2026-03-24T11:15:00Z" },
  // Phase 1 open position (for positions panel in trading terminal)
  { id: "tr-p1-06", account_id: "acc-p1-1234abcd", symbol: "BTCUSDT", direction: "long",  entry_price: 84500, exit_price: null, size: 3500, leverage: 4, pnl: null, pnl_pct: null, status: "open", open_time: "2026-03-25T09:00:00Z", close_time: null },

  // Phase 1 complete account — 5 days, 10.3% profit (all rules met)
  { id: "tr-p1c-01", account_id: "acc-p1-complete", symbol: "BTCUSDT", direction: "long",  entry_price: 85100, exit_price: 86300, size: 5000, leverage: 5, pnl: 706.30, pnl_pct: 14.13, status: "closed", open_time: "2026-03-17T09:00:00Z", close_time: "2026-03-17T14:00:00Z" },
  { id: "tr-p1c-02", account_id: "acc-p1-complete", symbol: "ETHUSDT", direction: "long",  entry_price: 2200, exit_price: 2268, size: 4000, leverage: 4, pnl: 1234.50, pnl_pct: 30.86, status: "closed", open_time: "2026-03-18T09:00:00Z", close_time: "2026-03-18T14:00:00Z" },
  { id: "tr-p1c-03", account_id: "acc-p1-complete", symbol: "BTCUSDT", direction: "short", entry_price: 87000, exit_price: 86500, size: 3500, leverage: 5, pnl:  893.20, pnl_pct: 25.52, status: "closed", open_time: "2026-03-19T09:00:00Z", close_time: "2026-03-19T13:00:00Z" },
  { id: "tr-p1c-04", account_id: "acc-p1-complete", symbol: "SOLUSDT", direction: "long",  entry_price: 126.0, exit_price: 130.5, size: 2000, leverage: 6, pnl: 1071.40, pnl_pct: 53.57, status: "closed", open_time: "2026-03-20T09:00:00Z", close_time: "2026-03-20T12:00:00Z" },
  { id: "tr-p1c-05", account_id: "acc-p1-complete", symbol: "BTCUSDT", direction: "long",  entry_price: 86000, exit_price: 86600, size: 2500, leverage: 4, pnl: 1443.00, pnl_pct: 57.72, status: "closed", open_time: "2026-03-21T09:00:00Z", close_time: "2026-03-21T14:00:00Z" },

  // Phase 2 complete account — 3 days, 5.1% profit
  { id: "tr-p2c-01", account_id: "acc-p2-complete", symbol: "BTCUSDT", direction: "long",  entry_price: 85500, exit_price: 86800, size: 5000, leverage: 5, pnl: 1112.40, pnl_pct: 22.25, status: "closed", open_time: "2026-03-21T09:00:00Z", close_time: "2026-03-21T14:00:00Z" },
  { id: "tr-p2c-02", account_id: "acc-p2-complete", symbol: "ETHUSDT", direction: "long",  entry_price: 2210, exit_price: 2268, size: 4000, leverage: 4, pnl:  887.20, pnl_pct: 22.18, status: "closed", open_time: "2026-03-22T09:00:00Z", close_time: "2026-03-22T14:00:00Z" },
  { id: "tr-p2c-03", account_id: "acc-p2-complete", symbol: "BTCUSDT", direction: "short", entry_price: 87200, exit_price: 86550, size: 3000, leverage: 5, pnl:  552.50, pnl_pct: 18.42, status: "closed", open_time: "2026-03-23T09:00:00Z", close_time: "2026-03-23T13:00:00Z" },

  // Phase 2 account — closed trades
  { id: "tr-p2-01", account_id: "acc-p2-5678efgh", symbol: "BTCUSDT", direction: "long",  entry_price: 86200, exit_price: 87500, size: 4000, leverage: 4, pnl: 603.70, pnl_pct: 15.09, status: "closed", open_time: "2026-03-22T10:00:00Z", close_time: "2026-03-22T15:30:00Z" },
  { id: "tr-p2-02", account_id: "acc-p2-5678efgh", symbol: "ETHUSDT", direction: "long",  entry_price: 2205, exit_price: 2270, size: 3000, leverage: 5, pnl: 884.15, pnl_pct: 29.47, status: "closed", open_time: "2026-03-23T09:00:00Z", close_time: "2026-03-23T14:45:00Z" },
  { id: "tr-p2-03", account_id: "acc-p2-5678efgh", symbol: "BTCUSDT", direction: "short", entry_price: 87800, exit_price: 87450, size: 2000, leverage: 5, pnl:  79.73, pnl_pct: 19.93, status: "closed", open_time: "2026-03-24T11:00:00Z", close_time: "2026-03-24T13:20:00Z" },
  { id: "tr-p2-04", account_id: "acc-p2-5678efgh", symbol: "SOLUSDT", direction: "long",  entry_price: 128.3, exit_price: 131.7, size: 1800, leverage: 6, pnl: 266.62, pnl_pct: 22.13, status: "closed", open_time: "2026-03-25T08:30:00Z", close_time: "2026-03-25T10:15:00Z" },

  // Funded $10K account — 4 trading days, $90 total profit (for payout screenshots)
  { id: "tr-10k-01", account_id: "acc-fn-10k-payout", symbol: "BTCUSDT", direction: "long",  entry_price: 87000, exit_price: 87200, size: 1000, leverage: 10, pnl: 22.99, pnl_pct: 22.99, status: "closed", open_time: "2026-03-20T10:00:00Z", close_time: "2026-03-20T14:30:00Z" },
  { id: "tr-10k-02", account_id: "acc-fn-10k-payout", symbol: "ETHUSDT", direction: "long",  entry_price: 2200,  exit_price: 2220,  size: 1200, leverage: 10, pnl: 21.82, pnl_pct: 18.18, status: "closed", open_time: "2026-03-21T09:00:00Z", close_time: "2026-03-21T13:00:00Z" },
  { id: "tr-10k-03", account_id: "acc-fn-10k-payout", symbol: "BTCUSDT", direction: "short", entry_price: 87500, exit_price: 87200, size: 1500, leverage: 10, pnl: 25.71, pnl_pct: 17.14, status: "closed", open_time: "2026-03-22T11:00:00Z", close_time: "2026-03-22T15:00:00Z" },
  { id: "tr-10k-04", account_id: "acc-fn-10k-payout", symbol: "SOLUSDT", direction: "long",  entry_price: 128.0, exit_price: 130.5, size:  600, leverage:  5, pnl: 19.48, pnl_pct: 16.23, status: "closed", open_time: "2026-03-23T08:30:00Z", close_time: "2026-03-23T10:15:00Z" },

  // Funded account — closed trades (5 trading days, all positive → compliance passes)
  { id: "tr-fn-02", account_id: "acc-fn-9abc0def", symbol: "BTCUSDT", direction: "long",  entry_price: 85100, exit_price: 86250, size: 5000, leverage: 5, pnl:  892.40, pnl_pct: 8.92,  status: "closed", open_time: "2026-03-15T09:00:00Z", close_time: "2026-03-15T14:30:00Z" },
  { id: "tr-fn-03", account_id: "acc-fn-9abc0def", symbol: "ETHUSDT", direction: "long",  entry_price: 2180, exit_price: 2235, size: 4500, leverage: 4, pnl: 1124.80, pnl_pct: 24.98, status: "closed", open_time: "2026-03-16T09:00:00Z", close_time: "2026-03-16T14:30:00Z" },
  { id: "tr-fn-04", account_id: "acc-fn-9abc0def", symbol: "BTCUSDT", direction: "short", entry_price: 87200, exit_price: 86500, size: 6000, leverage: 5, pnl: 1567.90, pnl_pct: 26.13, status: "closed", open_time: "2026-03-17T09:00:00Z", close_time: "2026-03-17T14:30:00Z" },
  { id: "tr-fn-05", account_id: "acc-fn-9abc0def", symbol: "SOLUSDT", direction: "long",  entry_price: 126.5, exit_price: 128.4, size: 2500, leverage: 6, pnl:  346.00, pnl_pct: 13.84, status: "closed", open_time: "2026-03-18T09:00:00Z", close_time: "2026-03-18T11:30:00Z" },
  { id: "tr-fn-06", account_id: "acc-fn-9abc0def", symbol: "BTCUSDT", direction: "long",  entry_price: 86000, exit_price: 86300, size: 2000, leverage: 3, pnl:  300.00, pnl_pct: 15.00, status: "closed", open_time: "2026-03-19T10:00:00Z", close_time: "2026-03-19T13:00:00Z" },
  // Funded account open position (entry below mock price → positive unrealised P&L for balance bar)
  { id: "tr-fn-01", account_id: "acc-fn-9abc0def", symbol: "BTCUSDT", direction: "long",  entry_price: 84500, exit_price: null, size: 3500, leverage: 4, pnl: null, pnl_pct: null, status: "open", open_time: "2026-03-25T08:00:00Z", close_time: null },
];

// ─── Payouts ──────────────────────────────────────────────────────────────────

export const MOCK_PAYOUTS = [
  {
    id: "py-settled-001",
    trader_address: MOCK_ADDRESS,
    account_id: "acc-fn-9abc0def",
    status: "settled",
    trader_share_usdc: 3384.88,
    firm_share_usdc:    846.22,
    gross_profit_usdc: 4231.10,
    requested_date: "2026-03-15T10:00:00Z",
    tx_hash: "0xa1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678",
  },
  {
    id: "py-approved-002",
    trader_address: MOCK_ADDRESS,
    account_id: "acc-fn-9abc0def",
    status: "approved",
    trader_share_usdc: 1248.30,
    firm_share_usdc:    312.08,
    gross_profit_usdc: 1560.38,
    requested_date: "2026-03-20T14:30:00Z",
    tx_hash: null,
  },
  {
    id: "py-pending-003",
    trader_address: MOCK_ADDRESS,
    account_id: "acc-fn-9abc0def",
    status: "pending",
    trader_share_usdc:  876.50,
    firm_share_usdc:    219.13,
    gross_profit_usdc: 1095.63,
    requested_date: "2026-03-24T09:15:00Z",
    tx_hash: null,
  },
];

// ─── LP positions ─────────────────────────────────────────────────────────────

export const MOCK_LP_POSITIONS = [
  {
    id: "lp-pos-001",
    lp_address: MOCK_ADDRESS,
    usdc_deposited: 10000,
    cfnd_tokens:     9876.54,
    share_pct:          4.23,
    yield_earned_usdc:  124.50,
    status: "active",
    deposit_date: "2026-03-10",
    withdraw_date: null,
    deposit_tx_hash:  "0xdeposit1a2b3c4d5e6f7890abcdef",
    withdraw_tx_hash: null,
  },
];

// ─── On-chain pool state ──────────────────────────────────────────────────────

export const MOCK_CHAIN_POOL = {
  lpCapitalUsdc:     236453.12,
  profitPoolUsdc:      8234.56,
  cfndSupply:        233456.78,
  cfndPriceUsdc:          1.0129,
  userCfndBalance:     9876.54,
  userPositionUsdc:   10004.31,
  userPendingProfit:    247.83,
  userYieldClaimed:     124.50,
  lpYields: { [MOCK_ADDRESS]: 247.83 },
  loading: false,
  error: null,
};

// ─── Affiliate stats ──────────────────────────────────────────────────────────

export const MOCK_AFFILIATE_STATS = {
  totalCommissionUsdc: 148.20,
  totalReferrals: 12,
  payments: [
    { txHash: "0xaff01a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f", amountUsdc: 10.35, traderAddress: "0xabcdef1234567890abcdef1234567890abcdef12", blockNumber: 7234567 },
    { txHash: "0xaff02b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f90", amountUsdc: 10.35, traderAddress: "0xbcdef1234567890abcdef1234567890abcdef123", blockNumber: 7234890 },
    { txHash: "0xaff03c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9012", amountUsdc: 10.35, traderAddress: "0xcdef1234567890abcdef1234567890abcdef1234", blockNumber: 7235100 },
    { txHash: "0xaff04d5e6f7a8b9c0d1e2f3a4b5c6d7e8f90123a", amountUsdc: 13.80, traderAddress: "0xdef1234567890abcdef1234567890abcdef12345", blockNumber: 7235400 },
    { txHash: "0xaff05e6f7a8b9c0d1e2f3a4b5c6d7e8f901234ab", amountUsdc: 13.80, traderAddress: "0xef1234567890abcdef1234567890abcdef123456", blockNumber: 7235700 },
    { txHash: "0xaff06f7a8b9c0d1e2f3a4b5c6d7e8f9012345abc", amountUsdc: 16.20, traderAddress: "0xf1234567890abcdef1234567890abcdef1234567", blockNumber: 7236000 },
    { txHash: "0xaff077a8b9c0d1e2f3a4b5c6d7e8f9012345abcd", amountUsdc: 16.20, traderAddress: "0x1234567890abcdef1234567890abcdef12345678", blockNumber: 7236300 },
    { txHash: "0xaff088b9c0d1e2f3a4b5c6d7e8f9012345abcde1", amountUsdc: 16.20, traderAddress: "0x234567890abcdef1234567890abcdef123456789", blockNumber: 7236600 },
    { txHash: "0xaff09b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a", amountUsdc: 10.35, traderAddress: "0x34567890abcdef1234567890abcdef1234567890", blockNumber: 7236900 },
    { txHash: "0xaff10c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b", amountUsdc: 10.35, traderAddress: "0x4567890abcdef1234567890abcdef12345678901", blockNumber: 7237200 },
    { txHash: "0xaff11d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c", amountUsdc: 13.80, traderAddress: "0x567890abcdef1234567890abcdef123456789012", blockNumber: 7237500 },
    { txHash: "0xaff12e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d", amountUsdc: 16.25, traderAddress: "0x67890abcdef1234567890abcdef1234567890123", blockNumber: 7237800 },
  ],
  loading: false,
  error: null,
};

// ─── Protocol stats (landing page) ───────────────────────────────────────────

export const MOCK_PROTOCOL_STATS = {
  tvlUsdc:          244687.68,
  totalPayoutsUsdc:  18432.50,
  totalYieldUsdc:     8234.56,
  payoutCount:          312,
  loading: false,
  error: null,
};

// ─── Prices ───────────────────────────────────────────────────────────────────

export const MOCK_PRICES = {
  BTCUSDT:  { price: 86512.50, open24h: 85180.00, high24h: 87340.00, low24h: 84920.00, volume: 28347.12, quoteVolume: 2451823456 },
  ETHUSDT:  { price:  2234.80, open24h:  2190.00, high24h:  2280.00, low24h:  2175.00, volume: 145231.40, quoteVolume:  324567890 },
  SOLUSDT:  { price:   129.50, open24h:   126.00, high24h:   132.40, low24h:   125.10, volume: 1823456.00, quoteVolume:  236123456 },
  BNBUSDT:  { price:   567.80, open24h:   558.00, high24h:   574.20, low24h:   554.30, volume:  123456.00, quoteVolume:   70123456 },
  XRPUSDT:  { price:     0.5234, open24h:   0.5100, high24h:   0.5380, low24h: 0.5060, volume: 98765432.00, quoteVolume:  51234567 },
  "EUR/USD": { price:  1.08234, open24h:  1.07980, high24h:  1.08450, low24h:  1.07820, volume: null, quoteVolume: null },
  "XAU/USD": { price: 2024.50,  open24h: 2018.00,  high24h: 2031.20,  low24h: 2015.40,  volume: null, quoteVolume: null },
  "SPX":     { price: 5234.80,  open24h: 5210.00,  high24h: 5248.60,  low24h: 5205.30,  volume: null, quoteVolume: null },
};

// ─── Mock filter helper ───────────────────────────────────────────────────────

function applyFilter(data, conditions) {
  if (!conditions || Object.keys(conditions).length === 0) return [...data];
  return data.filter((item) =>
    Object.entries(conditions).every(([k, v]) => item[k] === v)
  );
}

// ─── Mock base44 entities factory ────────────────────────────────────────────

export function createMockEntity(data) {
  const store = [...data]; // shallow copy so updates don't mutate fixtures
  return {
    filter:  (conditions) => Promise.resolve(applyFilter(store, conditions)),
    list:    ()           => Promise.resolve([...store]),
    get:     (id)         => Promise.resolve(store.find((d) => d.id === id) ?? null),
    create:  (item)       => {
      const rec = { id: `mock-${Date.now()}`, ...item };
      store.push(rec);
      return Promise.resolve(rec);
    },
    update:  (id, updates) => {
      const idx = store.findIndex((d) => d.id === id);
      if (idx !== -1) Object.assign(store[idx], updates);
      return Promise.resolve({ id, ...updates });
    },
    delete:  (id)         => {
      const idx = store.findIndex((d) => d.id === id);
      if (idx !== -1) store.splice(idx, 1);
      return Promise.resolve();
    },
  };
}
