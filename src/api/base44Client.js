import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import {
  MOCK_ACCOUNTS,
  MOCK_TRADES,
  MOCK_PAYOUTS,
  MOCK_LP_POSITIONS,
  createMockEntity,
} from '@/lib/screenshotMocks';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

const IS_SCREENSHOTS = import.meta.env.VITE_SCREENSHOTS === 'true';

// Compliance proof matching the funded account's trade fixture data
const MOCK_PROOF = {
  grossProfitUsdc:   4231.10,
  worstDailyLossBps:  370,   // 3.7% worst day   — under 5% limit
  maxDrawdownBps:     120,   // 1.2% max drawdown — under 10% limit
  tradingDaysCount:     5,   // 5 days traded     — ≥ 4 required
  bestDayBps:        3707,   // 37.07% best day   — ≤ 50% limit
  payoutId: 'py-settled-001',
  signature: '0xmocksignature',
};

const mockClient = {
  entities: {
    ChallengeAccount: createMockEntity(MOCK_ACCOUNTS),
    Trade:            createMockEntity(MOCK_TRADES),
    Payout:           createMockEntity(MOCK_PAYOUTS),
    LPPosition:       createMockEntity(MOCK_LP_POSITIONS),
    TradablePair:     createMockEntity([]),
    Whitelist:        createMockEntity([]),
    TermsAcceptance:  createMockEntity([]),
  },
  functions: {
    invoke: async (name) => {
      if (name === 'generatePayoutProof') return { data: MOCK_PROOF };
      return { data: null };
    },
  },
};

// serverUrl: use the Base44 app's own URL (VITE_BASE44_APP_BASE_URL) as the API server,
// which is what serverUrl:'' was resolving to when hosted on Base44.
// Falls back to the SDK default if not set.
const realClient = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: appBaseUrl || 'https://base44.app',
  requiresAuth: false,
  appBaseUrl,
});

export const base44 = IS_SCREENSHOTS ? mockClient : realClient;
