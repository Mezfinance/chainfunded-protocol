# Supported Wallets

ChainFunded supports any Ethereum-compatible wallet that can connect via browser injection (MetaMask-style) or WalletConnect.

---

## Browser extension wallets

These wallets install as browser extensions and inject a provider directly into the ChainFunded web app.

| Wallet | Browser | Notes |
|--------|---------|-------|
| **MetaMask** | Chrome, Firefox, Brave, Edge | Most widely tested |
| **Coinbase Wallet** | Chrome, Brave | Supports both extension and mobile |
| **Rabby** | Chrome, Brave | Built-in transaction simulation |
| **Rainbow** | Chrome | Consumer-focused UX |
| **Brave Wallet** | Brave | Built into Brave browser |

---

## Mobile wallets (via WalletConnect)

Any mobile wallet that supports WalletConnect v2 can be used by scanning the QR code shown on the ChainFunded connect screen.

| Wallet | Platform |
|--------|----------|
| MetaMask Mobile | iOS, Android |
| Coinbase Wallet | iOS, Android |
| Rainbow | iOS, Android |
| Trust Wallet | iOS, Android |
| Zerion | iOS, Android |

---

## Hardware wallets

Hardware wallets are supported when used in combination with a browser extension that proxies the connection:

- **Ledger** — connect via MetaMask or Rabby (Ledger Live browser extension also works)
- **Trezor** — connect via MetaMask

Note: Hardware wallets require physical confirmation for each transaction. This adds a few seconds per step in flows that require multiple wallet interactions (e.g., USDC approval + deposit).

---

## Wallets that are not supported

- Wallets that only support Bitcoin or non-EVM chains
- Exchange-hosted wallets (Binance, Coinbase Pro custodial accounts) — you must use a self-custody wallet
- Wallets on networks other than Ethereum Sepolia

---

## Switching networks

Your wallet must be on the **Ethereum Sepolia** network to interact with ChainFunded. If you connect on the wrong network, the app will prompt you to switch. Select **Switch Network** in the prompt and approve the request in your wallet.

---

## Related guides

- [Getting Started with ChainFunded →](./02-getting-started.md)
- [How to Connect Your Wallet →](./03-connect-wallet.md)
