# Multi-signature payouts

`ChainFundedPool` maintains an `authorisedSigners` set
(`mapping(address => bool)`) and a `signatureThreshold` (default
`3` of `M=5` at launch). Every state-changing payout-related
function — `registerPhase2`, `registerFunded`, `claimPayout`,
`registerPostPayout` — requires N ECDSA signatures from
authorised signers over an EIP-712 typed message hash whose
fields include `(accountId, payoutId, claimedRules, deadline,
chainId, contractAddress)`.

## Set management

Three owner-only functions mutate the signer set:

| Function | Pre-condition | Post-condition |
|---|---|---|
| `addSigner(address)` | `!authorisedSigners[addr]` (else `DuplicateSigner`) · `addr != address(0)` (else `InvalidAddress`) | `authorisedSigners[addr] = true`; `signerCount += 1` |
| `removeSigner(address)` | `authorisedSigners[addr]` (else `NotASigner`) · `signerCount − 1 ≥ signatureThreshold` (else `WouldBreachThreshold`) | `authorisedSigners[addr] = false`; `signerCount −= 1` |
| `setSignatureThreshold(uint256)` | `newThreshold > 0` · `newThreshold ≤ signerCount` (else `InvalidThreshold`) | `signatureThreshold = newThreshold` |

The `WouldBreachThreshold` guard is the central safety property:
it is impossible to remove a signer in a way that leaves the
remaining set unable to produce a valid signature aggregate.

## Signature validation

Each signature is recovered via `ECDSA.recover(messageHash,
signature)` (OpenZeppelin v5). The pool requires:

```
sigs.length >= signatureThreshold                       (else InsufficientSignatures)
recovered_addr ∈ authorisedSigners[]   for each sig     (else UnauthorizedSigner)
sigs sorted ascending by recovered_addr, no duplicates  (else DuplicateOrUnsortedSignature)
block.timestamp <= deadline                             (else SignatureExpired)
```

The sorted-by-recovered-address requirement makes duplicate
detection `O(N)` and removes ambiguity in signer-aggregate
canonicalisation: the same (rule-state, signer-set) pair
produces exactly one valid `signatures[]` ordering.

## Independence of attestation paths

Each signer operates an independent verification environment.
The protocol does not specify a shared signing ceremony; each
signer's stack is isolated by design. Compromise of one signer
key gives the attacker zero ability to forge a payout proof
unless they can also compromise `signatureThreshold − 1`
additional keys.

The on-chain re-verification at `claimPayout` (§4, §11) is
independent of signer compromise. A complete signer-set
compromise that produces a valid signature aggregate over a
fraudulent P&L either does not breach the on-chain rules (in
which case the payout is correct under the rules at
registration) or does breach them (in which case the contract
reverts on the matching `RuleBreached*` error).

## Diagram

![Figure 8 · N-of-M payout signing](multisig-signing.svg)

## Threshold parameter selection

For an N-of-M signer set, the protocol tolerates up to
`k = M − N` simultaneous signer outages before payout liveness
is impaired, and requires the attacker to compromise at least
`N` keys to forge a valid signature aggregate.

| Configuration | N-of-M | Outage tolerance (`M − N`) | Min keys to compromise |
|---|---|---|---|
| Launch                  | 3-of-5 | 2 | 3 |
| Hardened (post-audit)   | 4-of-5 | 1 | 4 |
| Conservative            | 5-of-7 | 2 | 5 |
| Maximum redundancy      | 4-of-7 | 3 | 4 |

`signatureThreshold = 3` of `M = 5` at launch tolerates two
simultaneous signer outages or compromises before payout
liveness is impaired. Raising the threshold (say to `4` of `5`)
hardens the protocol against signer compromise but tightens the
liveness window. Threshold changes are a single
`setSignatureThreshold` call, gated by the
`WouldBreachThreshold` invariant.
