# CHAINFUNDED — PROTOCOL TERMS OF USE

**Last Updated:** [DATE]

**Protocol Governor:** ChainFunded DAO,  (the "DAO")

**Governing Law:** Republic of Panama

---

## 1. ACCEPTANCE

**1.1** By interacting with the ChainFunded protocol smart contracts deployed on the Ethereum blockchain (the "Protocol"), you ("User", "you") agree to these Protocol Terms of Use (the "Terms").

**1.2** Interaction includes, but is not limited to: creating challenges, paying evaluation fees, executing trades, claiming payouts, depositing or withdrawing USDC as a liquidity provider, or submitting governance proposals.

**1.3** If you do not agree to these Terms, do not interact with the Protocol smart contracts.

---

## 2. THE PROTOCOL

**2.1 Description.** The ChainFunded Protocol is a set of autonomous smart contracts deployed on the Ethereum blockchain (Mainnet, Chain ID: 1) that facilitate:
- (a) Prop trading evaluation challenges with on-chain rule enforcement;
- (b) Automated USDC payout execution based on ECDSA-signed proofs;
- (c) A liquidity provider pool accepting USDC deposits and distributing yield;
- (d) Affiliate commission calculation and distribution;
- (e) Decentralised governance via CFG token voting.

**2.2 Smart Contract Addresses.**

| Contract | Address |
|----------|---------|
| ChainFundedPool | [ADDRESS TBD] |
| CFG Token | [ADDRESS TBD] |
| Governor | [ADDRESS TBD] |
| Timelock | [ADDRESS TBD] |

**2.3 Autonomous Operation.** The Protocol operates autonomously based on smart contract logic. The DAO governs protocol parameters and upgrades through on-chain governance but does not control individual user transactions.

**2.4 Transparency.** All Protocol smart contracts are verified and open source. You may review the contract code, audit reports, and governance history on-chain.

---

## 3. ELIGIBILITY

**3.1** The eligibility requirements in the Platform Terms of Service (C1) apply equally to Protocol interactions. You must be 18+, not located in or a citizen of a sanctioned jurisdiction, and not on any sanctions list.

**3.2** The Protocol implements three layers of sanctions screening:
- (a) Hardcoded OFAC SDN list in the smart contract;
- (b) Chainalysis on-chain sanctions oracle;
- (c) Chainalysis REST API verification.

**3.3** Wallet addresses that fail sanctions screening will be blocked from interacting with the Protocol.

---

## 4. EVALUATION CHALLENGES

**4.1 Challenge Creation.** You may create an evaluation challenge by submitting a transaction to the Protocol smart contract and paying the applicable fee in USDC.

**4.2 Challenge Rules.** Challenge rules are enforced by smart contract code:

| Rule | Value |
|------|-------|
| Phase 1 profit target | 10% of account size |
| Phase 2 profit target | 5% of account size |
| Maximum daily loss | 5% of account size |
| Maximum total drawdown | 10% of account size |
| Minimum trading days per phase | 4 |
| Best single day cap | ≤50% of total profit |
| Profit split (trader) | 80% |
| Profit split (protocol) | 20% |

**4.3 Rule Enforcement.** Rules are enforced by the smart contract and position monitoring system. Positions may be automatically closed if drawdown limits are breached.

**4.4 Challenge Fees.** Fee allocation is defined in the smart contract:

| Recipient | Percentage |
|-----------|-----------|
| Protocol treasury | 14.4% |
| Software license (MZF-Protocol Inc.) | [X]% |
| LP profit pool | 6% |
| Affiliate (if referred) | 8–20% |
| Capital pool reserves | Remainder |

**4.5 Non-Refundable.** Challenge fees are non-refundable once paid to the smart contract, except for the automatic fee refund on first funded payout (which is enforced by smart contract logic).

---

## 5. PAYOUTS

**5.1 Payout Mechanism.** When you meet Phase 2 evaluation targets:
- (a) The backend generates an ECDSA-signed proof of your performance;
- (b) You submit this proof to the Protocol smart contract;
- (c) The smart contract verifies the signature and executes the USDC payout to your wallet;
- (d) The evaluation fee is refunded from the capital pool (first payout only).

**5.2 Automated Execution.** Payouts are executed by smart contract. No manual review, approval, or human intervention is required.

**5.3 On-Chain Finality.** Payout transactions are final and irreversible once confirmed on the Ethereum blockchain. The DAO cannot reverse, modify, or cancel an executed payout.

**5.4 Payout Availability.** Payouts are subject to available liquidity in the Protocol's capital pool. In extreme scenarios, payouts may be delayed until sufficient liquidity is available.

---

## 6. LIQUIDITY PROVIDER POOL

**6.1** Liquidity provision is governed by the LP Pool Participation Terms (C5). By depositing USDC into the Protocol's LP pool, you agree to those terms.

---

## 7. GOVERNANCE

**7.1** CFG Token holders may participate in Protocol governance by submitting and voting on proposals through the Governor smart contract.

**7.2** Governance rights and procedures are defined in the DAO's Operating Agreement (A1) and the CFG Token Governance Framework (D1).

**7.3** Governance decisions are binding on the Protocol to the extent they are executed through the governance smart contracts.

---

## 8. RISKS AND ACKNOWLEDGEMENTS

**8.1** By using the Protocol, you acknowledge and accept:

**(a) Smart Contract Risk.** Smart contracts may contain undiscovered bugs or vulnerabilities. While the Protocol has been audited, no audit guarantees the absence of defects. You may lose some or all of your deposited or earned funds due to a smart contract exploit.

**(b) Blockchain Risk.** Ethereum network congestion, gas price spikes, forks, reorganisations, or validator failures may affect Protocol operation and transaction execution.

**(c) Oracle Risk.** The Protocol relies on price oracles and external data feeds. Oracle manipulation, failure, or latency could result in incorrect challenge rule enforcement.

**(d) Liquidity Risk.** The LP pool may have insufficient liquidity for payouts during periods of high trader profitability or mass LP withdrawals.

**(e) Regulatory Risk.** The regulatory status of DeFi protocols, governance tokens, and on-chain trading may change. Regulatory actions could affect the Protocol's availability or legality in your jurisdiction.

**(f) Irreversibility.** Blockchain transactions are irreversible. Funds sent to the wrong address, incorrect transactions, or interactions with the wrong contract cannot be reversed by the DAO.

**(g) No Insurance.** Funds in the Protocol are not insured by any government agency, deposit insurance scheme, or private insurance.

**(h) Experimental Technology.** DeFi protocols are experimental. The Protocol may not perform as expected in all market conditions.

**8.2** The complete Risk Disclosure Statement (C4) is incorporated by reference.

---

## 9. USER RESPONSIBILITY

**9.1** You are solely responsible for:
- (a) Verifying smart contract addresses before interacting;
- (b) Understanding the terms and rules of any challenge you create;
- (c) Securing your wallet and private keys;
- (d) Evaluating the risks of interacting with the Protocol;
- (e) Complying with all laws applicable to you, including tax obligations;
- (f) Confirming transaction details before signing.

**9.2** The DAO does not provide customer support for user errors (e.g., sending funds to wrong address, signing unintended transactions).

---

## 10. DISCLAIMERS

**10.1** THE PROTOCOL IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. THE DAO MAKES NO REPRESENTATIONS OR WARRANTIES REGARDING THE PROTOCOL'S SECURITY, RELIABILITY, AVAILABILITY, OR FITNESS FOR ANY PURPOSE.

**10.2** THE DAO DOES NOT GUARANTEE THAT THE PROTOCOL WILL OPERATE WITHOUT INTERRUPTION, ERROR, OR VULNERABILITY.

**10.3** THE DAO IS NOT RESPONSIBLE FOR ACTIONS TAKEN BY THIRD PARTIES, INCLUDING BUT NOT LIMITED TO PRICE FEED PROVIDERS, BLOCKCHAIN VALIDATORS, OR WALLET PROVIDERS.

---

## 11. LIMITATION OF LIABILITY

**11.1** TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE DAO, ITS MEMBERS, GUARDIAN SIGNERS, AND CONTRIBUTORS SHALL NOT BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE PROTOCOL.

**11.2** THIS LIMITATION APPLIES TO ALL CLAIMS, WHETHER BASED ON CONTRACT, TORT, STRICT LIABILITY, OR ANY OTHER LEGAL THEORY.

---

## 12. INDEMNIFICATION

**12.1** You agree to indemnify and hold harmless the DAO, its Members, Guardian signers, and contributors from any claims, damages, losses, or expenses arising from your use of the Protocol or violation of these Terms.

---

## 13. PROTOCOL CHANGES

**13.1** The Protocol may be modified through governance votes. Changes may include parameter adjustments, smart contract upgrades, new features, or deprecation of existing features.

**13.2** Material Protocol changes are subject to governance proposal, voting, and timelock periods as defined in the governance framework.

**13.3** You are responsible for monitoring governance proposals that may affect your positions or deposits.

---

## 14. GOVERNING LAW AND DISPUTE RESOLUTION

**14.1 Governing Law.** These Terms shall be governed by the laws of the Republic of Panama, without regard to conflict of laws principles.

**14.2 Arbitration.** Disputes shall be resolved by binding arbitration administered by the Centro de Conciliación y Arbitraje de Panamá (CeCAP), seated in Panama City, conducted in English. One (1) arbitrator. The award is final and binding.

**14.3 Class Action Waiver.** Disputes shall be resolved individually. You waive any right to participate in class, consolidated, or representative proceedings.

**14.4 Limitation Period.** Claims must be brought within one (1) year.

---

## 15. MISCELLANEOUS

**15.1** These Terms may be updated by DAO governance vote. Updated Terms will be published on the Platform and on-chain.

**15.2** Severability, no waiver, and force majeure provisions apply as standard.

---

*ChainFunded DAO — ChainFunded DAO*
*Last Updated: [DATE]*
