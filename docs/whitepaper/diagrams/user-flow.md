# User flow diagrams — ChainFunded whitepaper

Mermaid source for the user flow diagrams. GitHub renders Mermaid in
markdown automatically, so this file is the working draft — once we lock
the flows, the final whitepaper PDF will use Figma exports of the same
shapes, in brand colours.

> Edit / paste these into <https://mermaid.live> to preview standalone.

---

## 1. Trader — happy-path lifecycle

The main figure of the whitepaper. Shows the full path from "trader buys an
evaluation" to "trader receives USDC payout", with on-chain vs off-chain
participants clearly separated.

```mermaid
sequenceDiagram
  autonumber
  actor T as Trader
  participant USDC
  participant Pool as ChainFundedPool<br/>(on-chain)
  participant Sim as Trading Engine<br/>(off-chain)
  participant Sig as Payout Signers<br/>(N-of-M multisig)
  actor Aff as Affiliate<br/>(optional)

  Note over T,Pool: 1 — Buy an evaluation
  T->>USDC: approve(Pool, fee)
  T->>Pool: registerChallenge(fee, accountId, size, affiliate, …)
  Pool->>USDC: transferFrom(T → Pool, fee)
  Pool->>USDC: transfer(Pool → labsWallet, 24% protocol)
  Pool->>USDC: transfer(Pool → LP yield pool, 6%)
  opt referred by an affiliate
    Pool->>USDC: transfer(Pool → Aff, 8–20% tiered)
  end
  Note right of Pool: remainder stays in Pool<br/>as LP capital reserves<br/>(see §2 for the full split)
  Pool-->>T: ChallengeRegistered

  Note over T,Sim: 2 — Trade simulated capital
  T->>Sim: place / close trades
  Sim-->>T: P&L tracked · rules enforced off-chain

  Note over Sim,Pool: 3 — Phase transitions are signed
  Sim->>Sig: Phase 1 passed
  Sig-->>T: signed Phase 2 proof
  T->>Pool: registerPhase2(accountId, signatures)
  Pool->>Pool: verify N-of-M signatures
  Pool-->>T: Phase 2 active

  Note over T,Pool: 4 — Request a payout
  T->>Sig: request payout
  Sig->>Sig: verify performance · rule compliance
  Sig-->>T: N signed payout proofs
  T->>Pool: claimPayout(payoutId, signatures, …)
  Note right of Pool: on-chain re-verification —<br/>belt & braces. Pool reverts if:<br/>· dailyLoss > maxDailyLossBps<br/>· drawdown > maxTotalLossBps<br/>· tradingDays < minTradingDays<br/>· profit < profitTarget<br/>· bestDay > maxBestDayBps<br/>· signatures invalid or insufficient
  Pool->>USDC: transfer(Pool → T, trader share — 80%)
  Pool->>USDC: transfer(Pool → labsWallet, 80% of firm cut)
  Pool->>USDC: transfer(Pool → LP yield pool, 20% of firm cut)
  Pool-->>T: USDC received — settlement is final
```

> **Phase 2 vs Funded.** Step 3 generalises both phase transitions —
> `registerPhase2` (Phase 1 → Phase 2) and `registerFunded` (Phase 2 →
> Funded) use the same signed-by-multisig shape. The whitepaper body
> covers both explicitly; the diagram shows one to keep the visual tight.

### Notes for the Figma redraw

- Render **on-chain participants** (USDC, Pool) on a darker background lane
  to visually separate from off-chain (Sim, Sig). This is the single most
  important visual distinction in the whitepaper — it's what the protocol's
  "can't choose not to pay you" pitch rests on.
- Group step 1 in a "Purchase" rect, 2 in "Trading", 3–4 in "Settlement".
  Same structure as the conversation in the document body.
- Highlight the lines that *move USDC* in primary (Evergreen) green. All
  other lines neutral grey. Reader's eye traces money flow immediately.
- The "on-chain re-verification" note at step 4 should be a **callout
  block** in the final art, not just a side-note. It's the single
  strongest narrative point the diagram makes — every revert listed is a
  guarantee the protocol can't break.
- Affiliate is dotted-bordered / dimmed when not present — visually
  signals the path is optional without taking up much room.

---

## 2. Challenge fee — split breakdown

Companion mini-diagram to step 1 above. Shows where every USDC of an
evaluation fee goes, by BPS, sourced directly from the on-chain constants
in `ChainFundedPool.sol`:

```mermaid
flowchart TD
  Fee([Trader fee · 100%]) --> Pool{{ChainFundedPool<br/>registerChallenge}}
  Pool -->|24% · FEE_PROTOCOL_BPS| Labs[labsWallet<br/>protocol revenue]
  Pool -->|6% · FEE_PROFIT_POOL_BPS| Yield[LP yield pool<br/>distributed per-CFND]
  Pool -->|0–20% · tiered by monthly volume| Aff[Affiliate wallet<br/>only if referrer set]
  Pool -->|remainder · 50–70%| Cap[LP capital reserves<br/>backs trader payouts]
```

> Splits are fixed in contract storage: `FEE_PROTOCOL_BPS = 2400`,
> `FEE_PROFIT_POOL_BPS = 600`, `MAX_AFFILIATE_BPS = 2000`. The affiliate
> share is determined by the referring affiliate's rolling-month volume —
> non-referred fees route everything else to LP capital.

---

## 3. Failure paths

Implicit in the happy-path diagram, called out here for the whitepaper
body. Two distinct failure modes:

```mermaid
flowchart TD
  Start[Trader holds an active challenge] --> Trade[Trades simulated capital]
  Trade -->|Rule breached during trading| Fail[Trading engine flags account<br/>· no further phase transitions signed<br/>· no payout proof produced]
  Trade -->|Targets hit| Pass[Trading engine signs payout proof]
  Fail --> NoPayout[Trader's loss is bounded to<br/>the evaluation fee paid in step 1]
  Pass --> Onchain[Trader calls claimPayout]
  Onchain -->|on-chain rule re-check fails| Revert[Pool reverts<br/>· no USDC moves<br/>· proof is invalid]
  Onchain -->|all checks pass| Paid[USDC transferred to trader]
```

> **Belt and braces.** Off-chain rule enforcement is the *belt* — the
> signers refuse to sign a payout proof for a breached account. On-chain
> rule re-verification at `claimPayout` is the *braces* — even if the
> signers collude to sign a false proof, the pool reverts. Both must
> agree before USDC leaves the pool.

---

## 4. Liquidity Provider — capital lifecycle

Secondary figure. LP-side mechanics are simpler than the trader side, so
this stays compact.

```mermaid
sequenceDiagram
  autonumber
  actor LP
  participant USDC
  participant Pool as ChainFundedPool
  participant CFND as CFNDToken

  Note over LP,Pool: 1 — Deposit capital, mint CFND (1:1 NAV)
  LP->>USDC: approve(Pool, amount)
  LP->>Pool: deposit(amount)
  Pool->>USDC: transferFrom(LP → Pool, amount)
  Pool->>CFND: mint(LP, amount)
  Pool-->>LP: CFND balance ↑

  Note over LP,Pool: 2 — Accrue yield from challenge fees + firm cut
  Note right of Pool: 6% of every challenge fee +<br/>20% of every payout firm cut →<br/>LP profit pool, tracked per-CFND

  Note over LP,Pool: 3 — Claim profit (yield only, capital untouched)
  LP->>Pool: claimProfit(gasReimbursementUsdc)
  Pool->>USDC: transfer(Pool → LP, pendingProfit)

  Note over LP,Pool: 4 — Withdraw capital
  LP->>Pool: withdraw(cfndAmount, gasReimbursementUsdc)
  Pool->>CFND: burn(LP, cfndAmount)
  Pool->>USDC: transfer(Pool → LP, cfndAmount × NAV)
  Note right of Pool: NAV can fall below $1 if payouts<br/>have exceeded fees + firm cuts —<br/>LPs carry trader-PnL exposure
```

---

## 5. Decisions

Resolutions to the open questions raised on the first draft of this file.
Kept as a record so the Figma re-draw and the whitepaper body track the
same decisions:

- **Affiliates** — folded into the fee-split annotation in §1, with a
  dedicated mini-flowchart in §2 showing the full split tree. Affiliate
  appears in §1 as an optional actor (dimmed when not present).
- **Contract-enforced rules** — surfaced as an explicit callout at §1
  step 4, listing every revert the pool can throw during `claimPayout`.
  This is the protocol's strongest selling point and gets a dedicated
  callout block in the Figma redraw.
- **Phase 2 vs Funded** — single shape on the main diagram, with a
  footnote that `registerFunded` follows the identical pattern.
  Avoids bloating the figure for a transition that's mechanically the
  same.
- **Failure paths** — given their own flowchart in §3 rather than
  branching the sequence diagram. Sequence diagrams get noisy when they
  fork; a small flowchart reads cleaner and lets us tell the
  "belt + braces" story in one place.
