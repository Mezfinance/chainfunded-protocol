# CHAINFUNDED — LP POOL PARTICIPATION TERMS

**Last Updated:** [DATE]

**Protocol Governor:** ChainFunded DAO

**Governing Law:** Republic of Panama

---

## 1. INTRODUCTION

**1.1** These LP Pool Participation Terms ("LP Terms") govern your participation as a Liquidity Provider ("LP") in the ChainFunded protocol's USDC liquidity pool (the "Pool").

**1.2** By depositing USDC into the Pool, you agree to these LP Terms, the Protocol Terms of Use (C2), the Privacy Policy (C3), and the Risk Disclosure Statement (C4).

**1.3** These LP Terms supplement the Protocol Terms of Use. In the event of conflict, these LP Terms prevail for matters specific to LP participation.

---

## 2. THE POOL

**2.1 Description.** The Pool is a non-custodial smart contract that accepts USDC deposits from LPs and uses those funds to:
- (a) Fund trader payouts for successful evaluation challenge completions;
- (b) Fund evaluation fee refunds on first funded payout;
- (c) Maintain capital reserves for ongoing funded trader activity.

**2.2 Smart Contract.** The Pool is managed by the ChainFundedPool smart contract deployed at address [ADDRESS TBD] on Ethereum Mainnet.

**2.3 Non-Custodial.** The Pool is a smart contract, not a bank account. Neither MZF-Protocol Inc. nor the DAO has discretionary control over your deposited funds. Deposits, withdrawals, and yield distributions are governed by smart contract code.

---

## 3. DEPOSITS

**3.1 Deposit Mechanism.** You deposit USDC into the Pool by calling the deposit function on the ChainFundedPool smart contract. You must approve the contract to spend USDC on your behalf before depositing.

**3.2 CFND Tokens.** Upon deposit, you receive CFND tokens at a 1:1 ratio to the USDC deposited. CFND tokens represent your pro-rata share of the Pool.

**3.3 Minimum Deposit.** [Minimum deposit amount, if any, TBD].

**3.4 No Maximum.** There is no maximum deposit limit per LP, subject to any protocol-wide TVL cap that may be set by governance.

---

## 4. CFND TOKEN

**4.1 Nature.** CFND is an ERC-20 token that represents a deposit receipt for your share of the Pool. It is:
- (a) A receipt token — it represents your proportional share of Pool assets;
- (b) Redeemable — you can return CFND to the Pool to withdraw your proportional share of USDC;
- (c) Non-governance — CFND does not confer voting or governance rights (governance is through CFG tokens).

**4.2 Not a Security.** CFND is designed as a deposit receipt, not an investment instrument. It does not represent equity, debt, revenue share, or any ownership interest in MZF-Protocol Inc. or the DAO.

**4.3 Transferability.** CFND tokens are transferable ERC-20 tokens. However, transferring CFND transfers your claim on the Pool — the recipient can redeem the CFND for the underlying USDC.

---

## 5. YIELD

**5.1 Yield Sources.** The Pool earns yield from two sources:
- (a) **Evaluation fee share:** 6% of every challenge evaluation fee is allocated to the LP profit pool;
- (b) **Profit split share:** When funded traders generate profits, 20% of the protocol's 20% cut flows to the LP profit pool.

**5.2 Variable Yield.** Yield is variable and depends on:
- (a) Platform volume (number and size of challenges created);
- (b) Funded trader performance (profit split revenue);
- (c) Pool size (yield is distributed proportionally; a larger pool means lower per-LP yield at the same revenue level).

**5.3 No Guaranteed Returns.** Yield is NOT fixed, guaranteed, or predictable. There may be periods of zero or negative net returns if payout obligations exceed fee inflows.

**5.4 Yield Distribution.** Yield accrues to the Pool and is reflected in the CFND redemption value. You realise yield when you withdraw.

---

## 6. WITHDRAWALS

**6.1 Withdrawal Mechanism.** You withdraw USDC by returning CFND tokens to the ChainFundedPool contract. You receive your proportional share of Pool USDC.

**6.2 Availability.** Withdrawals are available at any time, subject to Pool liquidity. If the Pool has insufficient idle USDC (because capital is committed to active funded traders), your withdrawal may be:
- (a) Partially filled (you receive available USDC, with the remainder queued);
- (b) Queued for fulfillment when liquidity becomes available.

**6.3 No Withdrawal Fee.** [Fee structure TBD — confirm whether withdrawal fees apply].

**6.4 Redemption Value.** The USDC value of your CFND tokens may be greater or less than your original deposit, depending on Pool performance. The redemption rate reflects the net Pool value (deposits + yield earned - payouts made).

---

## 7. RISKS SPECIFIC TO LP PARTICIPATION

In addition to the risks described in the Risk Disclosure Statement (C4), LP participation carries the following specific risks:

**7.1 Payout Risk.** The Pool funds trader payouts. If many funded traders are simultaneously profitable, payout obligations may temporarily exceed Pool inflows, reducing Pool value.

**7.2 Withdrawal Liquidity Risk.** If the Pool utilisation rate is high (large portion committed to funded traders), you may not be able to withdraw your full deposit immediately.

**7.3 Smart Contract Risk.** The Pool smart contract manages your USDC. A vulnerability in the contract could result in loss of all deposited funds.

**7.4 No Principal Protection.** Your deposit is not protected by any insurance, guarantee, or reserve mechanism. You may withdraw less USDC than you deposited.

**7.5 Concentration Risk.** If you deposit a significant portion of your assets into the Pool, adverse Pool performance could materially affect your financial position.

**7.6 USDC Risk.** The Pool holds USDC exclusively. Risks specific to USDC (de-pegging, Circle blacklisting, regulatory actions) directly affect Pool value.

**7.7 Governance Risk.** The DAO may vote to change Pool parameters (fee allocation percentages, withdrawal mechanisms, TVL caps) in ways that affect LP returns.

---

## 8. LP REPRESENTATIONS

By depositing into the Pool, you represent and warrant that:

**(a)** You understand the risks of DeFi liquidity provision and have read the Risk Disclosure Statement;

**(b)** You are depositing only funds you can afford to lose entirely;

**(c)** You understand that your deposit is not insured, guaranteed, or protected;

**(d)** You are not depositing on behalf of any person or entity on a sanctions list;

**(e)** You meet the eligibility requirements in the Protocol Terms of Use;

**(f)** You understand that yield is variable and not guaranteed;

**(g)** You accept the risk that you may withdraw less USDC than you deposited.

---

## 9. NO FIDUCIARY RELATIONSHIP

**9.1** Neither MZF-Protocol Inc. nor the DAO owes you a fiduciary duty in connection with your LP participation.

**9.2** The Pool operates according to predefined smart contract rules. There is no discretionary management of Pool assets.

**9.3** LP participation does not create a partnership, joint venture, trust, or agency relationship between you and either entity.

---

## 10. DISCLAIMERS

**10.1** THE POOL IS PROVIDED "AS IS." NEITHER MZF-PROTOCOL INC. NOR THE DAO MAKES ANY WARRANTY REGARDING POOL RETURNS, LIQUIDITY, AVAILABILITY, OR SECURITY.

**10.2** PAST POOL PERFORMANCE IS NOT INDICATIVE OF FUTURE RESULTS.

---

## 11. LIMITATION OF LIABILITY

**11.1** NEITHER MZF-PROTOCOL INC., THE DAO, NOR THEIR RESPECTIVE MEMBERS, DIRECTORS, OR CONTRIBUTORS SHALL BE LIABLE FOR ANY LOSSES ARISING FROM YOUR LP PARTICIPATION, INCLUDING LOSS OF DEPOSITED USDC, MISSED YIELD, OR INABILITY TO WITHDRAW.

---

## 12. GOVERNING LAW AND DISPUTES

**12.1 Governing Law.** These LP Terms are governed by the laws of the Republic of Panama.

**12.2 Arbitration.** Disputes shall be resolved by binding arbitration administered by the Centro de Conciliación y Arbitraje de Panamá (CeCAP), seated in Panama City, conducted in English. One (1) arbitrator. The award is final and binding.

**12.3 Class Action Waiver.** Disputes shall be resolved individually.

---

## 13. AMENDMENTS

**13.1** These LP Terms may be updated by DAO governance vote. Updated terms will be published on the Platform.

**13.2** Material changes will be communicated with at least thirty (30) days' notice.

---

*ChainFunded DAO — ChainFunded DAO*
*Last Updated: [DATE]*
