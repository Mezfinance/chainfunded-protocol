# Smart Contract Transparency and Audits

ChainFunded's core mechanics are enforced by smart contracts on Ethereum Sepolia. All contract interactions are publicly recorded on Etherscan and verifiable by anyone.

---

## What the smart contracts do

| Function | Contract enforcement |
|----------|---------------------|
| Evaluation fee collection | Fee is paid directly to the liquidity pool contract; no intermediary |
| Phase progression | Challenge status is stored on-chain; pass/fail is determined by rule logic |
| LP deposits and withdrawals | CFND tokens are minted/burned by the contract; all balances on-chain |
| Trader payouts | Contract validates the trader's Phase 2 pass status and signature before releasing USDC |
| Affiliate commissions | 3% of each fee is transferred to the affiliate address in the same transaction |

---

## Verifying transactions on Etherscan

Every on-chain action produces a transaction hash that can be inspected on Sepolia Etherscan (`sepolia.etherscan.io`).

You can verify:
- That your evaluation fee was paid to the correct contract address
- That your payout amount matches what the platform showed you
- That affiliate commissions were transferred to the correct wallet
- That LP deposits were recorded correctly and CFND tokens were minted

To find a transaction: go to Etherscan, paste the transaction hash or your wallet address, and inspect the token transfers and contract interactions.

---

## No custody of user funds

ChainFunded does not hold user funds in a company-controlled wallet. All USDC in the system sits in the LP pool smart contract. Payouts are executed by the contract directly — no company employee approves or processes them.

---

## Contract addresses

The official ChainFunded smart contract addresses are published on the platform's website and in the app footer. Always verify you are interacting with these addresses and not a counterfeit.

Note: Do not interact with any contract address that is not listed on the official ChainFunded website, even if someone in a community channel claims it is official.

---

## Audit status

ChainFunded's smart contracts are subject to third-party security audits. Audit reports are published on the official website when available. Check the website for the current audit status and report links.

---

## Related guides

- [How to Keep Your Account Secure →](./01-account-security.md)
- [Common Scams and How to Avoid Them →](./02-scams-and-safety.md)
