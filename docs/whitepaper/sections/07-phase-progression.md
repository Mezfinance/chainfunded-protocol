# Phase progression

Each `Challenge` struct in `challenges[accountId]` encodes its
state through two fields: `phase` (`uint8`, range `1–3`) and
`settled` (`bool`). The combinations enumerate the protocol's
finite challenge state set:

| State | `phase` | `settled` | Entered by | Exited by |
|---|---|---|---|---|
| Phase 1 active | `1` | `false` | `registerChallenge` | `registerPhase2` (→ Phase 2 active) · off-chain breach (→ Failed) |
| Phase 2 active | `2` | `false` | `registerPhase2` | `registerFunded` (→ Funded active) · off-chain breach (→ Failed) |
| Funded active  | `3` | `false` | `registerFunded` | `claimPayout` (→ Settled) · off-chain breach (→ Failed) |
| Settled        | `*` | `true`  | `claimPayout` | `registerPostPayout` (→ new Phase 1 active for the same trader) |
| Failed         | `*` | `true`  | off-chain rule breach (no on-chain transition; the engine ceases signing) | terminal |

`registerPhase2`, `registerFunded`, `claimPayout`, and
`registerPostPayout` each accept an N-of-M signature aggregate
over an EIP-712 typed message containing
`(accountId, newPhase, trader, deadline, ...)`. The pool
verifies signature validity, threshold, sorted-uniqueness, and
deadline against the same signer set used by `claimPayout`
(§11). Failure modes match the `claimPayout` revert table for
signature validation; phase-transition calls additionally
revert `InvalidPhase` if the requested transition is not a
valid `(currentPhase, newPhase)` adjacency.

## Re-registration loop

`registerPostPayout(settledAccountId, freshAccountId, ...)`
allows a trader to roll a settled challenge into a fresh Phase 1
challenge for a new accountId without paying a new fee. The
function requires:

- `challenges[settledAccountId].settled == true`
- `challenges[settledAccountId].trader == msg.sender`
- `challenges[freshAccountId].createdAt == 0`
  (`FreshAccountAlreadyRegistered` otherwise)
- `signatures.length >= signatureThreshold`

This is the only edge in the state machine that returns from a
terminal state, and it produces a new `Challenge` record at a
new accountId rather than mutating the settled record. The
settled challenge's storage slot is preserved for downstream
event-replay correctness.

## Diagram

![Figure 3 · Challenge phase state machine](phase-state-machine.svg)
