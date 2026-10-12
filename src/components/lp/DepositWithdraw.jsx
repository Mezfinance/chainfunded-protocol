/**
 * DepositWithdraw — LP pool deposit and withdrawal interface.
 *
 * Deposit: user approves USDC spend → calls deposit on ChainFundedPool →
 * receives CFND tokens 1:1. Withdraw: burns CFND → receives USDC (capped
 * at available pool liquidity). Auto-harvests pending LP profit on both
 * deposit and withdrawal. Displays current CFND balance and pool share %.
 */
import { useState } from "react";
import BoltLoader from "@/components/brand/BoltLoader";
import { base44 } from "@/api/base44Client";
import { recordProfitClaim } from "@/components/wallet/TransactionHistory";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Gift,
} from "lucide-react";
import { useSendTransaction, useConnectModal, useActiveWallet, useSwitchActiveWalletChain } from "thirdweb/react";
import { getContract, prepareContractCall, waitForReceipt } from "thirdweb";
import { approve } from "thirdweb/extensions/erc20";
import { thirdwebClient, chain, wallets, appMetadata } from "@/lib/thirdwebClient";
import { getGasReimbursement } from "@/lib/gasEstimate";
import { usePrices } from "@/lib/PriceContext";
import { trackConversion } from "@/lib/xpixel";

const POOL_ADDRESS = import.meta.env.VITE_REWARDS_POOL_ADDRESS;
const USDC_ADDRESS = import.meta.env.VITE_USDC_ADDRESS;
import { useUSDCBlacklist } from "@/hooks/useUSDCBlacklist";

/**
 * @param {object} onChain - Live data from useChainFundedPool
 * @param {function} onSuccess - Called after a successful transaction
 */
export default function DepositWithdraw({ onChain = {}, onSuccess }) {
  const { address, isAuthenticated } = useAuth();
  const { connect } = useConnectModal();
  const { mutateAsync: sendTransaction } = useSendTransaction();
  const activeWallet = useActiveWallet();
  const switchChain = useSwitchActiveWalletChain();
  const { getPrice } = usePrices();
  const { isBlacklisted: isUSDCBlacklisted } = useUSDCBlacklist(address);

  const [tab, setTab]             = useState("deposit");
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState(""); // in USDC
  const [status, setStatus]       = useState("idle");
  const [error, setError]         = useState("");
  const [txHash, setTxHash]       = useState("");

  const {
    userCfndBalance,
    userPositionUsdc,
    userPendingProfit,
    userYieldClaimed,
    cfndPriceUsdc,
  } = onChain;

  const hasPosition  = userCfndBalance != null && userCfndBalance > 0;
  const hasPending   = userPendingProfit != null && userPendingProfit > 0;

  // Convert a USDC withdraw amount to raw CFND units.
  // cfndRaw = usdcAmount * 1e6 / cfndPriceUsdc  (both in human-readable space before scaling)
  const usdcToWithdrawToRawCfnd = (usdcAmt) => {
    if (!cfndPriceUsdc || cfndPriceUsdc === 0) return 0n;
    const cfndHuman = usdcAmt / cfndPriceUsdc;
    return BigInt(Math.round(cfndHuman * 1_000_000));
  };

  const maxWithdrawUsdc = userPositionUsdc ?? 0;

  const reset = () => {
    setStatus("idle");
    setDepositAmount("");
    setWithdrawAmount("");
    setTxHash("");
    setError("");
  };

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleDeposit = async () => {
    if (!address || !depositAmount) return;
    setError(""); setTxHash("");
    if (!POOL_ADDRESS) { setError("Pool address not configured."); return; }
    if (!USDC_ADDRESS) { setError("USDC address not configured."); return; }

    const usdcAmount = BigInt(Math.round(parseFloat(depositAmount) * 1_000_000));
    const gasReimbursement = await getGasReimbursement("deposit", activeWallet, getPrice("ETHUSDT"));
    const gasReimbursementHuman = Number(gasReimbursement) / 1_000_000;
    try {
      // Ensure mobile wallets are on the correct chain before sending
      await switchChain(chain);
      setStatus("approving");
      const usdcContract = getContract({ client: thirdwebClient, chain, address: USDC_ADDRESS });
      const approveTx = await sendTransaction(
        approve({ contract: usdcContract, spender: POOL_ADDRESS, amount: parseFloat(depositAmount) + gasReimbursementHuman })
      );
      await waitForReceipt({ client: thirdwebClient, chain, transactionHash: approveTx.transactionHash });

      setStatus("depositing");
      const pool = getContract({ client: thirdwebClient, chain, address: POOL_ADDRESS });
      const receipt = await sendTransaction(
        prepareContractCall({ contract: pool, method: "function deposit(uint256 amount, uint256 gasReimbursementUsdc)", params: [usdcAmount, gasReimbursement] })
      );
      setTxHash(receipt.transactionHash);

      // Update or create LP position in Base44
      try {
        const rawPos = await base44.entities.LPPosition.filter({ lp_address: address, status: "active" });
        const posArr = Array.isArray(rawPos) ? rawPos : [];
        if (posArr.length > 0) {
          // Update existing position — add to deposited amount
          await base44.entities.LPPosition.update(posArr[0].id, {
            usdc_deposited:  (posArr[0].usdc_deposited ?? 0) + parseFloat(depositAmount),
            cfnd_tokens:     (posArr[0].cfnd_tokens ?? 0) + parseFloat(depositAmount),
            deposit_tx_hash: receipt.transactionHash,
            deposit_date:    new Date().toISOString().split("T")[0],
          });
        } else {
          // No active position — create new
          await base44.entities.LPPosition.create({
            lp_address:        address,
            usdc_deposited:    parseFloat(depositAmount),
            cfnd_tokens:       parseFloat(depositAmount),
            share_pct:         0,
            yield_earned_usdc: 0,
            deposit_tx_hash:   receipt.transactionHash,
            status:            "active",
            deposit_date:      new Date().toISOString().split("T")[0],
          });
        }
      } catch { /* non-blocking */ }

      setStatus("done");
      onSuccess && onSuccess();

      // X conversion: LP deposit. Fires pixel + Conversion API with
      // conversion_id = tx hash so the two sources de-duplicate.
      trackConversion("deposit", {
        value: parseFloat(depositAmount),
        currency: "USD",
        conversion_id: receipt.transactionHash,
      });
    } catch (err) {
      console.error("Deposit failed:", err);
      setError(err.message || "Deposit failed. Please try again.");
      setStatus("error");
    }
  };

  const handleWithdraw = async () => {
    if (!address || !withdrawAmount) return;
    setError(""); setTxHash("");
    if (!POOL_ADDRESS) { setError("Pool address not configured."); return; }
    if (!hasPosition)  { setError("No active position found on-chain."); return; }

    const usdcAmt  = parseFloat(withdrawAmount);
    const cfndRaw  = usdcToWithdrawToRawCfnd(usdcAmt);
    const maxCfnd  = BigInt(Math.round((userCfndBalance ?? 0) * 1_000_000));

    // Cap at actual CFND balance to avoid rounding past it.
    const cfndToSend = cfndRaw > maxCfnd ? maxCfnd : cfndRaw;

    try {
      await switchChain(chain);
      setStatus("withdrawing");
      const pool = getContract({ client: thirdwebClient, chain, address: POOL_ADDRESS });
      const gasReimbursement = await getGasReimbursement("withdraw", activeWallet, getPrice("ETHUSDT"));
      const receipt = await sendTransaction(
        prepareContractCall({
          contract: pool,
          method: "function withdraw(uint256 cfndAmount, uint256 gasReimbursementUsdc)",
          params: [cfndToSend, gasReimbursement],
        })
      );
      setTxHash(receipt.transactionHash);

      // Update position in Base44
      try {
        const rawPos = await base44.entities.LPPosition.filter({ lp_address: address, status: "active" });
        const posArr = Array.isArray(rawPos) ? rawPos : [];
        if (posArr.length > 0) {
          if (cfndToSend >= maxCfnd) {
            // Full exit
            await base44.entities.LPPosition.update(posArr[0].id, {
              status:           "withdrawn",
              usdc_deposited:   0,
              cfnd_tokens:      0,
              withdraw_tx_hash: receipt.transactionHash,
              withdraw_date:    new Date().toISOString().split("T")[0],
            });
          } else {
            // Partial withdrawal — update remaining balance
            const withdrawnUsdc = parseFloat(withdrawAmount);
            await base44.entities.LPPosition.update(posArr[0].id, {
              usdc_deposited: Math.max(0, (posArr[0].usdc_deposited ?? 0) - withdrawnUsdc),
              cfnd_tokens:    Math.max(0, (posArr[0].cfnd_tokens ?? 0) - Number(cfndToSend) / 1e6),
            });
          }
        }
      } catch { /* non-blocking */ }

      setStatus("done");
      onSuccess && onSuccess();
    } catch (err) {
      console.error("Withdrawal failed:", err);
      setError(err.message || "Withdrawal failed. Please try again.");
      setStatus("error");
    }
  };

  const handleClaim = async () => {
    if (!address) return;
    setError(""); setTxHash("");
    if (!POOL_ADDRESS) { setError("Pool address not configured."); return; }

    try {
      await switchChain(chain);
      setStatus("claiming");
      // Snapshot pending profit before the tx resets it to 0
      const claimedAmount = userPendingProfit ?? 0;

      const pool = getContract({ client: thirdwebClient, chain, address: POOL_ADDRESS });
      const gasReimbursement = await getGasReimbursement("claimProfit", activeWallet, getPrice("ETHUSDT"));
      const receipt = await sendTransaction(
        prepareContractCall({
          contract: pool,
          method: "function claimProfit(uint256 gasReimbursementUsdc)",
          params: [gasReimbursement],
        })
      );
      setTxHash(receipt.transactionHash);

      // Record in local storage for transaction history
      if (claimedAmount > 0) {
        recordProfitClaim({ amount: claimedAmount, txHash: receipt.transactionHash, address });
      }

      // Update Base44: add claimed amount to yield_earned_usdc on active position(s)
      if (claimedAmount > 0) {
        try {
          const rawPos = await base44.entities.LPPosition.filter({ lp_address: address, status: "active" });
          const posArr = Array.isArray(rawPos) ? rawPos : [];
          if (posArr.length > 0) {
            await base44.entities.LPPosition.update(posArr[0].id, {
              yield_earned_usdc: (posArr[0].yield_earned_usdc ?? 0) + claimedAmount,
            });
          }
        } catch { /* non-blocking */ }
      }

      setStatus("done");
      onSuccess && onSuccess();
    } catch (err) {
      console.error("Claim failed:", err);
      setError(err.message || "Claim failed. Please try again.");
      setStatus("error");
    }
  };

  const busy = ["approving", "depositing", "withdrawing", "claiming"].includes(status);

  // ── Success screen ────────────────────────────────────────────────────────

  if (status === "done") {
    const label =
      tab === "deposit"  ? "Deposit confirmed!"   :
      tab === "withdraw" ? "Withdrawal confirmed!" :
                           "Profits claimed!";
    return (
      <Card className="border-border">
        <CardContent className="py-8 text-center space-y-3">
          <CheckCircle2 className="w-8 h-8 text-primary mx-auto" />
          <p className="text-primary font-semibold">{label}</p>
          <p className="text-sm text-muted-foreground">Your position has been updated on-chain.</p>
          {txHash && (
            <a
              href={`${chain.blockExplorers?.[0]?.url || "https://etherscan.io"}/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline font-mono block"
            >
              {txHash.slice(0, 20)}… ↗
            </a>
          )}
          <Button variant="outline" size="sm" className="mt-2" onClick={reset}>
            New Transaction
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Main UI ───────────────────────────────────────────────────────────────

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-base">Manage Position</CardTitle>
      </CardHeader>
      <CardContent>
        {!isAuthenticated ? (
          <Button
            variant="outline"
            className="w-full border-primary/40 text-primary hover:bg-primary/10 gap-1.5"
            onClick={() => connect({ client: thirdwebClient, chain, wallets, appMetadata })}
          >
            Connect Wallet to Continue
          </Button>
        ) : (
          <>
            <div className="mb-4 p-2 bg-secondary/30 border border-border rounded-lg">
              <p className="text-xs text-muted-foreground">Connected wallet</p>
              <p className="text-xs font-mono text-foreground truncate">{address}</p>
            </div>

            {/* Position summary */}
            {hasPosition && (
              <div className="mb-4 p-3 bg-green-500/5 border border-green-500/20 rounded-lg space-y-1.5">
                <p className="text-xs text-muted-foreground font-medium">Your position</p>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">CFND balance</span>
                  <span className="text-yellow-400 font-semibold">
                    {userCfndBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })} CFND
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Capital value</span>
                  <span className="text-foreground font-semibold">
                    ${userPositionUsdc?.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Claimable now</span>
                  <span className="text-green-400 font-semibold">
                    {userPendingProfit != null
                      ? `$${userPendingProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Total yield earned</span>
                  <span className="text-green-400 font-semibold">
                    {userYieldClaimed != null
                      ? `$${(userYieldClaimed + (userPendingProfit ?? 0)).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`
                      : "—"}
                  </span>
                </div>
              </div>
            )}

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="w-full mb-4">
                <TabsTrigger value="deposit"  className="flex-1 gap-1.5">
                  <ArrowDownToLine className="w-3.5 h-3.5" /> Deposit
                </TabsTrigger>
                <TabsTrigger value="withdraw" className="flex-1 gap-1.5">
                  <ArrowUpFromLine className="w-3.5 h-3.5" /> Withdraw
                </TabsTrigger>
                <TabsTrigger value="claim"    className="flex-1 gap-1.5">
                  <Gift className="w-3.5 h-3.5" /> Claim
                </TabsTrigger>
              </TabsList>

              {/* ── Deposit ── */}
              <TabsContent value="deposit" className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">USDC Amount</label>
                  <input
                    type="number"
                    placeholder="e.g. 5000"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    disabled={busy}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                {busy && tab === "deposit" && (
                  <div className="space-y-1.5 text-sm">
                    <div className={`flex items-center gap-2 ${status === "approving" ? "text-primary" : "text-muted-foreground"}`}>
                      {status === "approving"
                        ? <BoltLoader className="w-3.5 h-3.5" />
                        : <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
                      Step 1: Approve USDC
                    </div>
                    <div className={`flex items-center gap-2 ${status === "depositing" ? "text-primary" : "text-muted-foreground/40"}`}>
                      {status === "depositing"
                        ? <BoltLoader className="w-3.5 h-3.5" />
                        : <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/30" />}
                      Step 2: Deposit into pool
                    </div>
                  </div>
                )}

                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex gap-2">
                  <AlertCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    You receive <span className="text-primary">CFND tokens</span> at current NAV.
                    Your capital backs trader payouts and is at risk. Fee income accrues to your
                    profit pool and is claimable at any time.
                  </p>
                </div>

                <Button
                  className="w-full bg-primary text-primary-foreground"
                  disabled={busy || !depositAmount}
                  onClick={handleDeposit}
                >
                  {busy && tab === "deposit"
                    ? <><BoltLoader className="w-4 h-4 mr-2" /> Processing...</>
                    : "Deposit USDC"}
                </Button>
              </TabsContent>

              {/* ── Withdraw ── */}
              <TabsContent value="withdraw" className="space-y-3">
                {!hasPosition && !onChain.loading && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    No CFND balance found for this wallet.
                  </p>
                )}

                {hasPosition && (
                  <div>
                    <div className="flex justify-between mb-1">
                      <label className="text-xs text-muted-foreground">USDC to withdraw</label>
                      <button
                        className="text-xs text-primary hover:underline"
                        onClick={() => setWithdrawAmount(maxWithdrawUsdc.toFixed(2))}
                      >
                        Max: ${maxWithdrawUsdc.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </button>
                    </div>
                    <input
                      type="number"
                      placeholder="e.g. 1000"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      disabled={busy}
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    {withdrawAmount && cfndPriceUsdc && (
                      <p className="text-xs text-muted-foreground mt-1">
                        ≈ {(parseFloat(withdrawAmount) / cfndPriceUsdc).toLocaleString(undefined, { maximumFractionDigits: 6 })} CFND burned
                      </p>
                    )}
                  </div>
                )}

                {busy && tab === "withdraw" && (
                  <div className="flex items-center gap-2 text-sm text-primary">
                    <BoltLoader className="w-3.5 h-3.5" /> Processing withdrawal…
                  </div>
                )}

                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3 flex gap-2">
                  <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    Burns the corresponding CFND and returns proportional USDC capital.
                    Any pending profits are paid out automatically alongside your withdrawal.
                  </p>
                </div>

                <Button
                  className="w-full bg-primary text-primary-foreground"
                  disabled={busy || !hasPosition || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
                  onClick={handleWithdraw}
                >
                  {busy && tab === "withdraw"
                    ? <><BoltLoader className="w-4 h-4 mr-2" /> Processing...</>
                    : "Withdraw"}
                </Button>
              </TabsContent>

              {/* ── Claim Profits ── */}
              <TabsContent value="claim" className="space-y-3">
                <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-lg space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Available to claim</p>
                  <p className="text-2xl font-grotesk font-bold text-green-400">
                    {userPendingProfit != null
                      ? `$${userPendingProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                      : "—"}
                    <span className="text-sm font-normal text-muted-foreground ml-1">USDC</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Your share of the LP profit pool — accrued from challenge fees and
                    payout firm cuts, proportional to your CFND balance.
                  </p>
                </div>

                {busy && tab === "claim" && (
                  <div className="flex items-center gap-2 text-sm text-primary">
                    <BoltLoader className="w-3.5 h-3.5" /> Claiming profits…
                  </div>
                )}

                <Button
                  className="w-full bg-primary text-primary-foreground"
                  disabled={busy || !hasPending}
                  onClick={handleClaim}
                >
                  {busy && tab === "claim"
                    ? <><BoltLoader className="w-4 h-4 mr-2" /> Processing...</>
                    : "Claim Profits"}
                </Button>
              </TabsContent>
            </Tabs>

            {isUSDCBlacklisted && (
              <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 space-y-1">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <p className="text-xs font-semibold text-red-400">USDC Blacklisted Wallet</p>
                </div>
                <p className="text-xs text-red-400/80">
                  Your wallet has been blacklisted by Circle (USDC issuer). Deposits and withdrawals are blocked at the token level.
                  Contact <a href="mailto:legal@chainfunded.io" className="text-primary hover:underline">legal@chainfunded.io</a>.
                </p>
              </div>
            )}

            {error && (
              <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}