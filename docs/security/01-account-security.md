# How to Keep Your ChainFunded Account Secure

Your ChainFunded account is your wallet. Whoever controls your wallet controls your challenge accounts, LP positions, and affiliate earnings. This guide covers the key steps to protect it.

---

## Protect your wallet seed phrase

Your seed phrase (12 or 24 words) is the master key to your wallet. Anyone with your seed phrase can take full control of your funds and accounts.

- **Never share your seed phrase** with anyone — not ChainFunded support, not a Discord admin, not a "MetaMask helper"
- **Write it down offline** and store it in a secure physical location (fireproof safe, safety deposit box)
- **Do not store it digitally** — not in cloud notes, email drafts, photos, or password managers
- There is no legitimate reason for any service to ask for your seed phrase

---

## Use a hardware wallet

For significant LP deposits or funded account values, consider using a **hardware wallet** (Ledger, Trezor). Hardware wallets keep your private keys offline and require physical confirmation for every transaction, making remote theft extremely difficult.

See [Supported Wallets →](../getting-started/04-supported-wallets.md) for hardware wallet compatibility.

---

## Verify the site URL before connecting

Phishing sites mimic the ChainFunded interface to steal wallet approvals. Before connecting your wallet:

- Confirm the URL is the official ChainFunded domain
- Check for HTTPS (padlock icon in your browser)
- Bookmark the official URL and navigate from the bookmark, not from links in messages

---

## Review every transaction before confirming

Before approving any wallet request:

| What to check | What's normal | Red flag |
|--------------|--------------|---------|
| Transaction type | "Token approval" or "Function call" with known contract | Unexpected ETH transfer |
| Approval amount | Specific USDC amount (e.g. $345) | "Unlimited" spending approval |
| Contract address | ChainFunded's published contract address | Unknown address |

Note: ChainFunded only requests transactions for: evaluation fee payment, USDC approval, LP deposit, LP withdrawal, and yield claim. All other requests are unexpected.

---

## Disconnect your wallet when not in use

After completing your session, disconnect your wallet from ChainFunded in your wallet's connected sites settings. This limits the risk of malicious scripts interacting with your wallet in the background.

In MetaMask: select your wallet icon → select the three dots next to the connected site → select **Disconnect**.

---

## Use a dedicated wallet for trading

Consider maintaining a separate wallet address exclusively for ChainFunded activities. This isolates any risk to trading-related assets and keeps your primary holdings separate.

---

## Related guides

- [Common Scams and How to Avoid Them →](./02-scams-and-safety.md)
- [Smart Contract Transparency →](./03-smart-contract-transparency.md)
- [Supported Wallets →](../getting-started/04-supported-wallets.md)
