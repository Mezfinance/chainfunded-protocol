# pages/ — Page Components

Each file in this directory is a top-level route in the application. Pages are auto-registered in `pages.config.js` — just add a file here and it becomes a route.

## Pages

| Page | Route | Purpose |
|------|-------|---------|
| `Onboarding.jsx` | `/` (main page) | Landing/onboarding flow — wallet connection, challenge selection |
| `TradingTerminal.jsx` | `/TradingTerminal` | Live trading terminal with chart, order panel, positions |
| `TraderDashboard.jsx` | `/TraderDashboard` | Challenge progress, P&L history, account overview |
| `LPDashboard.jsx` | `/LPDashboard` | LP deposit/withdraw, pool stats, yield history |
| `AffiliateDashboard.jsx` | `/AffiliateDashboard` | Referral tracking, commission history, affiliate link |
| `AdminDashboard.jsx` | `/AdminDashboard` | Admin-only: challenge management, payout queue, pair config |
| `Payouts.jsx` | `/Payouts` | Payout history and pending payout status |
| `MyAccount.jsx` | `/MyAccount` | Profile, connected wallet, account settings |
| `FAQ.jsx` | `/FAQ` | Frequently asked questions |
| `Support.jsx` | `/Support` | Support/contact page |
| `TermsOfService.jsx` | `/TermsOfService` | Legal terms |
| `PrivacyPolicy.jsx` | `/PrivacyPolicy` | Privacy policy |

## Layout

All pages are wrapped in `Layout.jsx` (configured in `pages.config.js`). The layout provides the sidebar navigation, header, and responsive mobile drawer.
