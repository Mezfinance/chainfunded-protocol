import SEO from "@/components/SEO";
import BoltLoader from "@/components/brand/BoltLoader";
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle, CheckCircle2, Clock, X, Wallet, ShieldCheck, ShieldX } from "lucide-react";
import { formatUtcDate } from "@/lib/datetime";
import AccountSelector from "@/components/trader/AccountSelector";
import { useConnectModal, useSendTransaction, useActiveWallet, useActiveAccount, useSwitchActiveWalletChain } from "thirdweb/react";
import { signedClaimPost } from "@/lib/claimApi";
import { thirdwebClient, chain, explorerTxUrl, wallets, appMetadata } from "@/lib/thirdwebClient";
import { getGasReimbursement } from "@/lib/gasEstimate";
import { usePrices } from "@/lib/PriceContext";

const IS_SCREENSHOTS = import.meta.env.VITE_SCREENSHOTS === 'true';
import { getContract, prepareContractCall, readContract } from "thirdweb";

const POOL_ADDRESS = import.meta.env.VITE_REWARDS_POOL_ADDRESS;
import { checkUSDCBlacklist, useUSDCBlacklist } from "@/hooks/useUSDCBlacklist";
import { evaluateMilestones } from "@/lib/compliance";

// ── Main component ────────────────────────────────────────────────────────────

export default function PayoutsPage() {
  const { address, isAuthenticated, isLoadingAuth } = useAuth();
  const { connect } = useConnectModal();
  const { mutateAsync: sendTransaction } = useSendTransaction();
  const activeWallet = useActiveWallet();
  const activeAccount = useActiveAccount();
  const switchChain = useSwitchActiveWalletChain();

  // Cut-over flag: the worker signing oracle is the default path. Flip
  // VITE_USE_WORKER_CLAIM=false to fall back to the legacy Base44 functions.
  const USE_WORKER_CLAIM = import.meta.env.VITE_USE_WORKER_CLAIM !== "false";
  const { getPrice } = usePrices();
  const { isBlacklisted: isUSDCBlacklisted } = useUSDCBlacklist(address);
  const [searchParams] = useSearchParams();

  const [accounts, setAccounts]           = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [trades, setTrades]       = useState([]);
  const [payouts, setPayouts]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");

  // Claim flow state
  const [claimStep, setClaimStep]     = useState("idle"); // idle | generating | submitting | archiving | registering | done | error
  const [claimError, setClaimError]   = useState("");
  const [claimTxHash, setClaimTxHash] = useState("");
  const [newAccountId, setNewAccountId] = useState("");

  // Screenshots: seed claim step from URL param
  useEffect(() => {
    if (!IS_SCREENSHOTS) return;
    const mockClaimStep = searchParams.get("mockClaimStep");
    if (!mockClaimStep) return;
    setClaimStep(mockClaimStep);
    if (mockClaimStep === "done") {
      setClaimTxHash("0xmock_claim_tx_chain_funded_abcdef1234567890");
      setNewAccountId("mock_new_account_id_001");
    } else if (mockClaimStep === "error") {
      setClaimError("Rule breached: Best day profit exceeds 50% of total profit.");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch accounts + payouts on address change
  useEffect(() => {
    if (!address) { setLoading(false); return; }
    const fetchData = async () => {
      setLoading(true);
      setError("");
      try {
        const accsRaw = await base44.entities.ChallengeAccount.filter({ trader_address: address });
        const accs = (Array.isArray(accsRaw) ? accsRaw : []).filter(a =>
          ["phase_1", "phase_2", "funded"].includes(a.phase)
        );
        setAccounts(accs);

        // Auto-select first eligible account
        setSelectedAccountId(accs[0]?.id || null);

        const payoutsRaw = await base44.entities.Payout.filter({ trader_address: address });
        setPayouts(Array.isArray(payoutsRaw) ? payoutsRaw : []);
      } catch {
        setError("Failed to load payout data");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [address]);

  // Fetch trades when selected account changes
  const account = accounts.find(a => a.id === selectedAccountId) || null;

  useEffect(() => {
    if (!selectedAccountId) { setTrades([]); return; }
    const fetchTrades = async () => {
      try {
        const tradesRaw = await base44.entities.Trade.filter({ account_id: selectedAccountId });
        setTrades(Array.isArray(tradesRaw) ? tradesRaw : []);
      } catch { setTrades([]); }
    };
    fetchTrades();
  }, [selectedAccountId]);

  // ── Automated on-chain claim ─────────────────────────────────────────────

  const handleClaim = async () =>
    USE_WORKER_CLAIM ? handleClaimViaWorker() : handleClaimViaBase44();

  // New path: the worker recomputes compliance from the immutable ledger, signs
  // the proof, and (after the trader's tx confirms) reconciles the off-chain
  // state itself via /claim/finalize. No browser-side phase pre-write or
  // archive/create saga — that eliminates the stuck-"passed" failure mode.
  const handleClaimViaWorker = async () => {
    setClaimError("");
    setClaimTxHash("");

    const openPositions = trades.filter((t) => t.status === "open");
    if (openPositions.length > 0) {
      setClaimError(`Close your ${openPositions.length} open position${openPositions.length > 1 ? "s" : ""} first — claiming requires a flat account.`);
      setClaimStep("error");
      return;
    }
    if (!activeAccount) { setClaimError("Wallet not connected — reconnect and try again."); setClaimStep("error"); return; }
    if (!POOL_ADDRESS) { setClaimError("Pool contract address not configured."); setClaimStep("error"); return; }

    setClaimStep("generating");

    const onchainId = account.account_id || account.id;
    const isPhase1  = account.phase === "phase_1";
    const isPhase2  = account.phase === "phase_2";
    const freshAccountId = Array.from(crypto.getRandomValues(new Uint8Array(12)))
      .map((b) => b.toString(16).padStart(2, "0")).join("");

    let payoutRecord = null;
    let onchainDone = false;

    try {
      const pool = getContract({ client: thirdwebClient, chain, address: POOL_ADDRESS });

      // ── Phase 1 → Phase 2 ───────────────────────────────────────────────
      if (isPhase1) {
        setClaimStep("registering");
        await switchChain(chain);
        const proof = await signedClaimPost("/claim/phase2-proof", {
          account: activeAccount, authAction: "phase2", authAccountId: onchainId,
          body: { accountId: onchainId, phase2AccountId: freshAccountId },
        });
        const registerReceipt = await sendTransaction(prepareContractCall({
          contract: pool,
          method: "function registerPhase2(string phase1AccountId, string phase2AccountId, uint256 accountSize, uint256 deadline, bytes[] signatures)",
          params: [onchainId, freshAccountId, BigInt(Math.round(proof.accountSize * 1_000_000)), BigInt(proof.deadline), proof.signatures],
        }));
        onchainDone = true;

        setClaimStep("archiving");
        await signedClaimPost("/claim/finalize", {
          account: activeAccount, authAction: "finalize-phase2", authAccountId: onchainId,
          body: { action: "phase2", oldAccountId: onchainId, newAccountId: freshAccountId, txHash: registerReceipt.transactionHash },
        });

        setNewAccountId(freshAccountId);
        setClaimTxHash(registerReceipt.transactionHash);
        setClaimStep("done");
        window.dispatchEvent(new CustomEvent("cf:review-prompt", { detail: { trigger: "phase_passed" } }));
        return;
      }

      // ── Phase 2 → Funded ────────────────────────────────────────────────
      if (isPhase2) {
        setClaimStep("registering");
        await switchChain(chain);
        const proof = await signedClaimPost("/claim/funded-proof", {
          account: activeAccount, authAction: "funded", authAccountId: onchainId,
          body: { accountId: onchainId, fundedAccountId: freshAccountId },
        });
        const registerReceipt = await sendTransaction(prepareContractCall({
          contract: pool,
          method: "function registerFunded(string phase2AccountId, string fundedAccountId, uint256 fundedAccountSize, uint256 deadline, bytes[] signatures)",
          params: [onchainId, freshAccountId, BigInt(Math.round(proof.accountSize * 1_000_000)), BigInt(proof.deadline), proof.signatures],
        }));
        onchainDone = true;

        setClaimStep("archiving");
        await signedClaimPost("/claim/finalize", {
          account: activeAccount, authAction: "finalize-funded", authAccountId: onchainId,
          body: { action: "funded", oldAccountId: onchainId, newAccountId: freshAccountId, txHash: registerReceipt.transactionHash },
        });

        setNewAccountId(freshAccountId);
        setClaimTxHash(registerReceipt.transactionHash);
        setClaimStep("done");
        window.dispatchEvent(new CustomEvent("cf:review-prompt", { detail: { trigger: "funded" } }));
        return;
      }

      // ── Funded → payout + fresh funded account ──────────────────────────
      const blacklisted = await checkUSDCBlacklist(address);
      if (blacklisted === true) {
        throw new Error(
          "Your wallet address has been blacklisted by Circle (USDC issuer). " +
          "USDC transfers to this address are blocked at the token contract level. " +
          "Please contact legal@chainfunded.io for assistance."
        );
      }

      payoutRecord = await base44.entities.Payout.create({
        account_id: onchainId, trader_address: address, status: "pending",
        requested_date: new Date().toISOString().split("T")[0],
        gross_profit_usdc: compliance.grossProfitUsdc, trader_share_usdc: compliance.grossProfitUsdc * 0.8,
      });

      const proof = await signedClaimPost("/claim/payout-proof", {
        account: activeAccount, authAction: "payout", authAccountId: onchainId,
        body: { accountId: onchainId, payoutId: payoutRecord.id },
      });

      const [[passes, failReason], onchainChallenge] = await Promise.all([
        readContract({
          contract: pool,
          method: "function previewPayout(string accountId, uint256 grossProfitUsdc, uint256 worstDailyLossBps, uint256 maxDrawdownBps, uint256 tradingDaysCount, uint256 bestDayBps) view returns (bool, string)",
          params: [onchainId, BigInt(Math.round((proof.grossProfitUsdc || 0) * 1_000_000)), BigInt(proof.worstDailyLossBps || 0), BigInt(proof.maxDrawdownBps || 0), BigInt(proof.tradingDaysCount || 0), BigInt(proof.bestDayBps || 0)],
        }),
        readContract({
          contract: pool,
          method: "function getChallenge(string accountId) view returns (address trader, uint256 accountSizeUsdc, uint8 phase, bool settled, uint256 createdAt, uint256 profitTargetBps, uint256 maxDailyLossBps, uint256 maxTotalLossBps, uint256 minTradingDays, uint256 traderShareBps, uint256 maxBestDayBps)",
          params: [onchainId],
        }).catch(() => null),
      ]);
      if (!passes) throw new Error(failReason || "Payout eligibility check failed");
      const traderShareBps = onchainChallenge ? Number(onchainChallenge.traderShareBps) : 8_000;

      setClaimStep("submitting");
      await switchChain(chain);
      const gasReimbursement = await getGasReimbursement("claimPayout", activeWallet, getPrice("ETHUSDT"));
      const receipt = await sendTransaction(prepareContractCall({
        contract: pool,
        method: "function claimPayout(string accountId, uint256 grossProfitUsdc, uint256 worstDailyLossBps, uint256 maxDrawdownBps, uint256 tradingDaysCount, uint256 bestDayBps, string payoutId, uint256 deadline, bytes[] signatures, uint256 gasReimbursementUsdc)",
        params: [onchainId, BigInt(Math.round((proof.grossProfitUsdc || 0) * 1_000_000)), BigInt(proof.worstDailyLossBps || 0), BigInt(proof.maxDrawdownBps || 0), BigInt(proof.tradingDaysCount || 0), BigInt(proof.bestDayBps || 0), payoutRecord.id, BigInt(proof.deadline), proof.signatures, gasReimbursement],
      }));
      onchainDone = true;

      await base44.entities.Payout.update(payoutRecord.id, {
        status: "settled", tx_hash: receipt.transactionHash,
        gross_profit_usdc: proof.grossProfitUsdc, trader_share_usdc: proof.grossProfitUsdc * (traderShareBps / 10_000),
      });

      // Register the fresh funded account on-chain (trader submits).
      setClaimStep("registering");
      const regProof = await signedClaimPost("/claim/post-payout-proof", {
        account: activeAccount, authAction: "post-payout", authAccountId: onchainId,
        body: { accountId: onchainId, freshAccountId },
      });
      const registerReceipt = await sendTransaction(prepareContractCall({
        contract: pool,
        method: "function registerPostPayout(string settledAccountId, string freshAccountId, uint256 freshAccountSize, uint256 deadline, bytes[] signatures)",
        params: [onchainId, freshAccountId, BigInt(Math.round(regProof.accountSize * 1_000_000)), BigInt(regProof.deadline), regProof.signatures],
      }));

      // Reconcile off-chain (worker archives old → paid_out, creates fresh funded).
      setClaimStep("archiving");
      await signedClaimPost("/claim/finalize", {
        account: activeAccount, authAction: "finalize-payout", authAccountId: onchainId,
        body: { action: "payout", oldAccountId: onchainId, newAccountId: freshAccountId, txHash: receipt.transactionHash, payoutId: payoutRecord.id },
      });

      setNewAccountId(freshAccountId);
      setClaimTxHash(receipt.transactionHash);
      setClaimStep("done");
      window.dispatchEvent(new CustomEvent("cf:review-prompt", { detail: { trigger: "payout" } }));

      const payoutsRaw = await base44.entities.Payout.filter({ trader_address: address });
      setPayouts(Array.isArray(payoutsRaw) ? payoutsRaw : []);
    } catch (err) {
      // No off-chain phase was pre-mutated, so there is nothing to revert except
      // a pending payout record that never settled on-chain.
      if (payoutRecord?.id && !onchainDone) {
        try { await base44.entities.Payout.update(payoutRecord.id, { status: "failed" }); } catch { /* best-effort */ }
      }
      let msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || "Claim failed. Please try again.";
      if (msg.includes("Insufficient LP capital")) {
        msg = "The LP pool does not have enough liquidity to cover this payout right now. Your account and profit are safe — please try again later when liquidity is available.";
      }
      setClaimError(msg);
      setClaimStep("error");
    }
  };

  const handleClaimViaBase44 = async () => {
    setClaimError("");
    setClaimTxHash("");

    // Advancing requires a flat account — docs: "you must reach the target with
    // all positions closed to be able to advance." Block if anything is open.
    const openPositions = trades.filter((t) => t.status === "open");
    if (openPositions.length > 0) {
      setClaimError(
        `Close your ${openPositions.length} open position${openPositions.length > 1 ? "s" : ""} first — claiming requires a flat account.`
      );
      setClaimStep("error");
      return;
    }

    setClaimStep("generating");

    if (!POOL_ADDRESS) {
      setClaimError("Pool contract address not configured.");
      setClaimStep("error");
      return;
    }

    const onchainId = account.account_id || account.id;
    const isPhase1  = account.phase === "phase_1";
    const isPhase2  = account.phase === "phase_2";
    const isFunded  = account.phase === "funded";
    const nextPhase = isPhase1 ? "phase_2" : "funded";

    const freshAccountId = Array.from(crypto.getRandomValues(new Uint8Array(12)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    let payoutRecord = null;
    const originalPhase = account.phase;   // for revert if the on-chain step never lands
    let onchainDone = false;               // true once the registration/payout tx confirms

    try {
      const pool = getContract({ client: thirdwebClient, chain, address: POOL_ADDRESS });

      // ── Phase 1 → Phase 2  (no USDC payout — evaluation phase only) ─────────
      if (isPhase1) {
        // Register on-chain BEFORE mutating app state, so a rejected/failed tx
        // can't orphan a half-created Phase 2 account or strand the old one in
        // a transient state (which would also duplicate accounts on retry).
        setClaimStep("registering");
        // generatePhase2Proof validates the Phase 1 account is in the "passed" state.
        await base44.entities.ChallengeAccount.update(account.id, { phase: "passed" });
        await switchChain(chain);

        const regProofResp = await base44.functions.invoke("generatePhase2Proof", {
          phase1AccountId: onchainId,
          phase2AccountId: freshAccountId,
          accountSize,
          traderAddress:   address });
        const regProof = regProofResp?.data ?? regProofResp;
        if (regProof?.error) throw new Error(`generatePhase2Proof: ${regProof.error}`);
        if (!regProof?.deadline || !regProof?.signatures) throw new Error("generatePhase2Proof returned incomplete proof");

        const registerReceipt = await sendTransaction(
          prepareContractCall({
            contract: pool,
            method:   "function registerPhase2(string phase1AccountId, string phase2AccountId, uint256 accountSize, uint256 deadline, bytes[] signatures)",
            params:   [
              onchainId, freshAccountId,
              BigInt(Math.round(accountSize * 1_000_000)),
              BigInt(regProof.deadline), regProof.signatures,
            ] })
        );
        onchainDone = true;

        // On-chain registration succeeded — now archive Phase 1 and create the
        // (already-registered) Phase 2 account.
        setClaimStep("archiving");
        await base44.entities.ChallengeAccount.update(account.id, { phase: "phase_1_passed" });
        await base44.entities.ChallengeAccount.create({
          id: freshAccountId, account_id: freshAccountId,
          trader_address: address, account_size: accountSize,
          phase: "phase_2", starting_balance: accountSize,
          current_balance: accountSize, peak_balance: accountSize,
          max_daily_loss_pct: account.max_daily_loss_pct ?? 5,
          max_total_loss_pct: account.max_total_loss_pct ?? 10,
          min_trading_days:   account.min_trading_days   ?? 4,
          status: "active", onchain_registered: true,
          fee_tx_hash: registerReceipt.transactionHash,
          start_date: new Date().toISOString().split("T")[0] });

        setNewAccountId(freshAccountId);
        setClaimTxHash(registerReceipt.transactionHash);
        setClaimStep("done");
        window.dispatchEvent(new CustomEvent("cf:review-prompt", { detail: { trigger: "phase_passed" } }));
        return;
      }

      // ── Phase 2 → Funded  (no USDC payout — evaluation phase only) ──────────
      if (isPhase2) {
        // Register on-chain BEFORE mutating app state (see Phase 1 note).
        setClaimStep("registering");
        // Pre-proof state matches what generatePostPayoutProof validates.
        await base44.entities.ChallengeAccount.update(account.id, { phase: "paid_out" });
        await switchChain(chain);

        // generatePostPayoutProof uses the same hash layout as registerFunded
        const regProofResp = await base44.functions.invoke("generatePostPayoutProof", {
          settledAccountId: onchainId,
          freshAccountId,
          freshAccountSize: accountSize,
          traderAddress:    address });
        const regProof = regProofResp?.data ?? regProofResp;
        if (regProof?.error) throw new Error(`generatePostPayoutProof: ${regProof.error}`);
        if (!regProof?.deadline || !regProof?.signatures) throw new Error("generatePostPayoutProof returned incomplete proof");

        const registerReceipt = await sendTransaction(
          prepareContractCall({
            contract: pool,
            method:   "function registerFunded(string phase2AccountId, string fundedAccountId, uint256 fundedAccountSize, uint256 deadline, bytes[] signatures)",
            params:   [
              onchainId, freshAccountId,
              BigInt(Math.round(accountSize * 1_000_000)),
              BigInt(regProof.deadline), regProof.signatures,
            ] })
        );
        onchainDone = true;

        // On-chain registration succeeded — archive Phase 2 and create the
        // (already-registered) funded account.
        setClaimStep("archiving");
        await base44.entities.ChallengeAccount.update(account.id, { phase: "phase_2_passed" });
        await base44.entities.ChallengeAccount.create({
          id: freshAccountId, account_id: freshAccountId,
          trader_address: address, account_size: accountSize,
          phase: "funded", starting_balance: accountSize,
          current_balance: accountSize, peak_balance: accountSize,
          max_daily_loss_pct: account.max_daily_loss_pct ?? 5,
          max_total_loss_pct: account.max_total_loss_pct ?? 10,
          min_trading_days:   account.min_trading_days   ?? 4,
          status: "active", onchain_registered: true,
          fee_tx_hash: registerReceipt.transactionHash,
          start_date: new Date().toISOString().split("T")[0] });

        setNewAccountId(freshAccountId);
        setClaimTxHash(registerReceipt.transactionHash);
        setClaimStep("done");
        window.dispatchEvent(new CustomEvent("cf:review-prompt", { detail: { trigger: "funded" } }));
        return;
      }

      // ── Funded → payout + fresh funded account  (USDC payout) ───────────────

      // Pre-check: USDC blacklist
      const blacklisted = await checkUSDCBlacklist(address);
      if (blacklisted === true) {
        throw new Error(
          "Your wallet address has been blacklisted by Circle (USDC issuer). " +
          "USDC transfers to this address are blocked at the token contract level. " +
          "Please contact legal@chainfunded.io for assistance."
        );
      }

      // Create payout record
      payoutRecord = await base44.entities.Payout.create({
        account_id:        onchainId,
        trader_address:    address,
        status:            "pending",
        requested_date:    new Date().toISOString().split("T")[0],
        gross_profit_usdc: compliance.grossProfitUsdc,
        trader_share_usdc: compliance.grossProfitUsdc * 0.8 });

      // Generate compliance proof
      const proofResp = await base44.functions.invoke("generatePayoutProof", {
        accountId:     onchainId,
        payoutId:      payoutRecord.id,
        traderAddress: address });
      const proof = proofResp?.data ?? proofResp;

      // Preflight read
      const [[passes, failReason], onchainChallenge] = await Promise.all([
        readContract({
          contract: pool,
          method: "function previewPayout(string accountId, uint256 grossProfitUsdc, uint256 worstDailyLossBps, uint256 maxDrawdownBps, uint256 tradingDaysCount, uint256 bestDayBps) view returns (bool, string)",
          params: [
            onchainId,
            BigInt(Math.round((proof.grossProfitUsdc || 0) * 1_000_000)),
            BigInt(proof.worstDailyLossBps || 0),
            BigInt(proof.maxDrawdownBps    || 0),
            BigInt(proof.tradingDaysCount  || 0),
            BigInt(proof.bestDayBps        || 0),
          ] }),
        readContract({
          contract: pool,
          method: "function getChallenge(string accountId) view returns (address trader, uint256 accountSizeUsdc, uint8 phase, bool settled, uint256 createdAt, uint256 profitTargetBps, uint256 maxDailyLossBps, uint256 maxTotalLossBps, uint256 minTradingDays, uint256 traderShareBps, uint256 maxBestDayBps)",
          params: [onchainId] }).catch(() => null),
      ]);
      if (!passes) throw new Error(failReason || "Payout eligibility check failed");
      const traderShareBps = onchainChallenge ? Number(onchainChallenge.traderShareBps) : 8_000;

      setClaimStep("submitting");
      await switchChain(chain);

      const gasReimbursement = await getGasReimbursement("claimPayout", activeWallet, getPrice("ETHUSDT"));
      const receipt = await sendTransaction(
        prepareContractCall({
          contract: pool,
          method: "function claimPayout(string accountId, uint256 grossProfitUsdc, uint256 worstDailyLossBps, uint256 maxDrawdownBps, uint256 tradingDaysCount, uint256 bestDayBps, string payoutId, uint256 deadline, bytes[] signatures, uint256 gasReimbursementUsdc)",
          params: [
            onchainId,
            BigInt(Math.round((proof.grossProfitUsdc || 0) * 1_000_000)),
            BigInt(proof.worstDailyLossBps  || 0),
            BigInt(proof.maxDrawdownBps     || 0),
            BigInt(proof.tradingDaysCount   || 0),
            BigInt(proof.bestDayBps         || 0),
            payoutRecord.id,
            BigInt(proof.deadline),
            proof.signatures,
            gasReimbursement,
          ] })
      );
      onchainDone = true;

      await base44.entities.Payout.update(payoutRecord.id, {
        status:            "settled",
        tx_hash:           receipt.transactionHash,
        gross_profit_usdc: proof.grossProfitUsdc,
        trader_share_usdc: proof.grossProfitUsdc * (traderShareBps / 10_000) });

      setClaimStep("archiving");
      await base44.entities.ChallengeAccount.update(account.id, {
        phase:           "paid_out",
        current_balance: Math.max(0, (account.current_balance ?? accountSize) - proof.grossProfitUsdc),
        payout_tx_hash:  receipt.transactionHash });

      await base44.entities.ChallengeAccount.create({
        id: freshAccountId, account_id: freshAccountId,
        trader_address: address, account_size: accountSize,
        phase: "funded", starting_balance: accountSize,
        current_balance: accountSize, peak_balance: accountSize,
        max_daily_loss_pct: account.max_daily_loss_pct ?? 5,
        max_total_loss_pct: account.max_total_loss_pct ?? 10,
        min_trading_days:   account.min_trading_days   ?? 4,
        status: "active", onchain_registered: false,
        start_date: new Date().toISOString().split("T")[0] });

      setClaimStep("registering");

      const regProofResp = await base44.functions.invoke("generatePostPayoutProof", {
        settledAccountId: onchainId,
        freshAccountId,
        freshAccountSize: accountSize,
        traderAddress:    address });
      const regProof = regProofResp?.data ?? regProofResp;

      const registerReceipt = await sendTransaction(
        prepareContractCall({
          contract: pool,
          method:   "function registerPostPayout(string settledAccountId, string freshAccountId, uint256 freshAccountSize, uint256 deadline, bytes[] signatures)",
          params:   [
            onchainId, freshAccountId,
            BigInt(Math.round(accountSize * 1_000_000)),
            BigInt(regProof.deadline), regProof.signatures,
          ] })
      );

      try {
        const freshAccs = await base44.entities.ChallengeAccount.filter({ account_id: freshAccountId });
        if (freshAccs?.[0]) {
          await base44.entities.ChallengeAccount.update(freshAccs[0].id, {
            onchain_registered: true, fee_tx_hash: registerReceipt.transactionHash });
        }
      } catch { /* non-blocking */ }

      setNewAccountId(freshAccountId);
      setClaimTxHash(receipt.transactionHash);
      setClaimStep("done");
      window.dispatchEvent(new CustomEvent("cf:review-prompt", { detail: { trigger: "payout" } }));

      const payoutsRaw = await base44.entities.Payout.filter({ trader_address: address });
      setPayouts(Array.isArray(payoutsRaw) ? payoutsRaw : []);

    } catch (err) {
      // If the on-chain step never landed, undo the transient phase change so
      // the account returns to its original state — no orphaned "passed"/
      // "paid_out" rows, and a clean retry (no duplicate accounts, since the
      // new account is only created AFTER the tx confirms).
      if (!onchainDone) {
        try { await base44.entities.ChallengeAccount.update(account.id, { phase: originalPhase }); } catch { /* best-effort */ }
      }
      if (payoutRecord?.id) {
        try { await base44.entities.Payout.update(payoutRecord.id, { status: "failed" }); } catch { /* best-effort */ }
      }
      let msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || "Claim failed. Please try again.";
      if (msg.includes("Insufficient LP capital")) {
        msg = "The LP pool does not have enough liquidity to cover this payout right now. Your account and profit are safe — please try again later when liquidity is available.";
      }
      setClaimError(msg);
      setClaimStep("error");
    }
  };

  // ── Guards ───────────────────────────────────────────────────────────────

  if (isLoadingAuth) {
    return <div className="text-center py-16 text-muted-foreground">Connecting wallet…</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background px-4 py-12">
        <div className="max-w-2xl mx-auto text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto" />
          <h2 className="text-xl font-semibold text-foreground">Connect Wallet</h2>
          <p className="text-muted-foreground">Please connect your wallet to view payouts.</p>
          <Button variant="outline" className="border-primary/40 text-primary hover:bg-primary/10 gap-1.5" onClick={() => connect({ client: thirdwebClient, chain, wallets, appMetadata })}>
            <Wallet className="w-3.5 h-3.5" /> Connect Wallet
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background px-4 py-12">
        <div className="max-w-4xl mx-auto text-center">
          <BoltLoader className="w-6 h-6 text-primary mx-auto mb-2" />
          <p className="text-muted-foreground">Loading payouts…</p>
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="min-h-screen bg-background px-4 py-12">
        <div className="max-w-2xl mx-auto text-center space-y-3">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto" />
          <h2 className="text-xl font-semibold text-foreground">No Active Accounts</h2>
          <p className="text-muted-foreground">
            You don't have any active Phase 1, Phase 2, or funded accounts eligible for payout.
            Purchase an evaluation to get started.
          </p>
        </div>
      </div>
    );
  }

  // ── Compliance metrics (computed from local trade data, for display) ──────

  const { checks, allPassed: allChecksPassed, compliance, accountSize } =
    evaluateMilestones(account, trades);

  // Advancing requires a flat account (docs: "must reach the target with all
  // positions closed to be able to advance").
  const openPositionCount = trades.filter((t) => t.status === "open").length;
  // Admin hold: the claim oracle refuses to sign for an account under review, so
  // mirror that in the UI (disable + explain) rather than surfacing a raw 403.
  const underReview = account.under_review === true || account.status === "under_review";
  const readyToClaim = allChecksPassed && openPositionCount === 0 && !underReview;

  const totalSettled = payouts
    .filter((p) => p.status === "settled")
    .reduce((sum, p) => sum + (p.trader_share_usdc || 0), 0);

  const statusConfig = {
    pending: { icon: Clock,        color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20", label: "Pending" },
    settled: { icon: CheckCircle2, color: "bg-green-500/10 text-green-400 border-green-500/20",   label: "Settled" },
    rejected:{ icon: X,            color: "bg-red-500/10 text-red-400 border-red-500/20",          label: "Rejected" } };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      <SEO
        title="Claim"
        description="Claim your profit share and advance to the next phase. Phase 1 and Phase 2 completions are verified on-chain and automatically advance your account. Funded account payouts are paid in USDC directly to your wallet."
        canonical="/Payouts"
      />
      {/* Payout disclaimer */}
      <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-4 py-3 flex gap-3 text-sm">
        <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
        <div className="text-muted-foreground space-y-1">
          <p>
            <span className="text-foreground font-medium">Simulated profits, real settlement. </span>
            Your P&L is generated in a simulated trading environment. Upon meeting all rule checks, your 80% share is paid in <span className="text-foreground">real USDC</span> directly to your wallet from the LP pool via smart contract.
          </p>
          <p>
            Payouts are subject to <span className="text-foreground">LP pool liquidity</span> at the time of settlement. In rare cases where the pool has insufficient capital — for example, during periods of high simultaneous trader profitability — your payout transaction may revert and you will need to retry when liquidity is available.
          </p>
          <p>
            On-chain transactions are <span className="text-foreground">irreversible</span>. Ensure your wallet address is correct before submitting a claim. All compliance checks are verified autonomously on-chain — no manual admin approval is required.
          </p>
        </div>
      </div>

      {/* Account selector */}
      {accounts.length > 1 && (
        <AccountSelector
          accounts={accounts}
          selectedId={selectedAccountId}
          onSelect={(id) => { setSelectedAccountId(id); setClaimStep("idle"); setClaimError(""); setClaimTxHash(""); }}
        />
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground mb-1">Realised P&L</p>
            <p className={`text-2xl font-bold ${compliance.grossProfitUsdc >= 0 ? "text-green-400" : "text-red-400"}`}>
              {compliance.grossProfitUsdc >= 0 ? "+" : ""}${compliance.grossProfitUsdc.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground mb-1">Account Phase</p>
            <p className="text-2xl font-bold text-foreground capitalize">
              {account.phase?.replace("_", " ") || "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground mb-1">Account ID</p>
            <p className="text-sm font-mono text-foreground break-all">{account.account_id || account.id}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {account.onchain_registered ? "Registered on-chain" : "Not yet registered on-chain"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Claim payout */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">
            {account.phase === "phase_1" ? "Claim Phase 2 Account" : account.phase === "phase_2" ? "Claim Funded Account" : "Claim Payout"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isUSDCBlacklisted && (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 space-y-2">
              <div className="flex items-center gap-2">
                <ShieldX className="w-5 h-5 text-red-400 shrink-0" />
                <p className="text-sm font-semibold text-red-400">USDC Blacklisted Wallet</p>
              </div>
              <p className="text-xs text-red-400/80 leading-relaxed">
                Your wallet address has been blacklisted by Circle, the issuer of USDC.
                All USDC transfers to and from this address are blocked at the token
                contract level. Payouts cannot be processed to this wallet.
              </p>
              <p className="text-xs text-muted-foreground">
                Contact <a href="mailto:legal@chainfunded.io" className="text-primary hover:underline">legal@chainfunded.io</a> for assistance.
              </p>
            </div>
          )}

          {underReview && (
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                <p className="text-sm font-semibold text-amber-400">Account Under Review</p>
              </div>
              <p className="text-xs text-amber-400/80 leading-relaxed">
                This account is temporarily on hold while our team reviews recent activity.
                Claims and phase advances are paused during the review.
              </p>
              <p className="text-xs text-muted-foreground">
                Questions? Contact <a href="mailto:support@chainfunded.io" className="text-primary hover:underline">support@chainfunded.io</a>.
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Compliance checklist */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Rule Compliance Check</p>
            {checks.map((c) => (
              <div
                key={c.label}
                className={`flex items-start gap-3 p-3 rounded-lg border ${
                  c.passes
                    ? "bg-green-500/5 border-green-500/20"
                    : "bg-red-500/5 border-red-500/20"
                }`}
              >
                {c.passes
                  ? <ShieldCheck className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                  : <ShieldX className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${c.passes ? "text-green-400" : "text-red-400"}`}>{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.detail}</p>
                </div>
                {c.value && (
                  <span className={`text-sm font-bold tabular-nums shrink-0 ${c.passes ? "text-green-400" : "text-red-400"}`}>
                    {c.value}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Claim button / status */}
          {claimStep === "done" ? (
            <div className="space-y-3 text-center">
              <CheckCircle2 className="w-8 h-8 text-primary mx-auto" />
              <p className="text-primary font-semibold">
                {account.phase === "phase_1" ? "Phase 2 Account Registered!"
                  : account.phase === "phase_2" ? "Funded Account Registered!"
                  : "Payout settled on-chain!"}
              </p>
              <p className="text-sm text-muted-foreground">
                {account.phase === "phase_1"
                  ? "Phase 1 complete. Your account is archived and your Phase 2 account is registered on-chain and ready to trade. No USDC is paid at this stage."
                  : account.phase === "phase_2"
                  ? "Phase 2 complete. Your account is archived and your funded account is registered on-chain and ready to trade. No USDC is paid at this stage."
                  : "Your 80% share has been transferred to your wallet. Your previous account has been archived and a fresh funded account is ready to trade."}
              </p>
              {claimTxHash && (
                <a
                  href={explorerTxUrl(claimTxHash)}
                  target="_blank" rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline font-mono block"
                >
                  {account.phase === "funded" ? "Payout tx" : "Registration tx"}: {claimTxHash.slice(0, 20)}… ↗
                </a>
              )}
              {newAccountId && (
                <p className="text-xs text-muted-foreground font-mono">
                  New account: {newAccountId.slice(0, 16)}…
                </p>
              )}
            </div>
          ) : (
            <>
              {claimError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-400">{claimError}</p>
                </div>
              )}

              {(claimStep === "generating" || claimStep === "submitting" || claimStep === "archiving" || claimStep === "registering") && (
                <div className="space-y-2 text-sm">
                  {(account.phase === "funded"
                    ? [
                        { key: "generating",  label: "Generating compliance proof…" },
                        { key: "submitting",  label: "Submitting payout to contract…" },
                        { key: "archiving",   label: "Archiving account and creating fresh funded account…" },
                        { key: "registering", label: "Registering new funded account on-chain…" },
                      ]
                    : [
                        { key: "registering", label: "Registering new account on-chain — approve in wallet…" },
                        { key: "archiving",   label: account.phase === "phase_1" ? "Archiving Phase 1 and creating your Phase 2 account…" : "Archiving Phase 2 and creating your Funded account…" },
                      ]
                  ).map(({ key, label }, idx, arr) => {
                    const steps = arr.map(s => s.key);
                    const currentIdx = steps.indexOf(claimStep);
                    const stepIdx = idx;
                    const isDone = stepIdx < currentIdx;
                    const isActive = stepIdx === currentIdx;
                    return (
                      <div key={key} className={`flex items-center gap-2 ${isActive ? "text-primary" : isDone ? "text-muted-foreground" : "text-muted-foreground/40"}`}>
                        {isActive
                          ? <BoltLoader className="w-3.5 h-3.5" />
                          : isDone
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                          : <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/30" />}
                        {label}
                      </div>
                    );
                  })}
                </div>
              )}

              <Button
                className="w-full bg-primary text-primary-foreground"
                disabled={
                  !readyToClaim ||
                  claimStep === "generating" ||
                  claimStep === "submitting" ||
                  claimStep === "archiving" ||
                  claimStep === "registering"
                }
                onClick={handleClaim}
              >
                {claimStep === "generating" || claimStep === "submitting" || claimStep === "archiving" || claimStep === "registering"
                  ? <><BoltLoader className="w-4 h-4 mr-2" /> Processing…</>
                  : claimStep === "error"
                  ? "Retry"
                  : account.phase === "phase_1" ? "Claim Phase 2 Account"
                  : account.phase === "phase_2" ? "Claim Funded Account"
                  : "Claim Payout (80% to wallet)"}
              </Button>

              {underReview ? (
                <p className="text-xs text-amber-400 text-center">
                  Claiming is paused while your account is under review.
                </p>
              ) : !allChecksPassed ? (
                <p className="text-xs text-muted-foreground text-center">
                  All rule checks must pass before you can claim. The contract will automatically verify and pay out once all rules are met.
                </p>
              ) : openPositionCount > 0 ? (
                <p className="text-xs text-yellow-400 text-center">
                  You've passed all checks. Close your {openPositionCount} open position{openPositionCount > 1 ? "s" : ""} first — claiming requires a flat account.
                </p>
              ) : (
                <p className="text-xs text-primary text-center">
                  All checks passed and your account is flat — you're ready to claim.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Payout history */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Payout History</CardTitle>
        </CardHeader>
        <CardContent>
          {payouts.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">No payouts yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="text-left text-xs text-muted-foreground px-4 py-2">Date</th>
                    <th className="text-left text-xs text-muted-foreground px-4 py-2">Status</th>
                    <th className="text-right text-xs text-muted-foreground px-4 py-2">Your Share (80%)</th>
                    <th className="text-right text-xs text-muted-foreground px-4 py-2">Transaction</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((payout) => {
                    const config = statusConfig[payout.status] || statusConfig.pending;
                    const Icon = config.icon;
                    return (
                      <tr key={payout.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground">
                          {payout.requested_date
                            ? formatUtcDate(payout.requested_date)
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Icon className="w-3 h-3" />
                            <Badge variant="outline" className={`text-xs ${config.color}`}>
                              {config.label}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-green-400">
                          {payout.trader_share_usdc != null
                            ? `$${payout.trader_share_usdc.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {payout.tx_hash ? (
                            <a
                              href={explorerTxUrl(payout.tx_hash)}
                              target="_blank" rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline font-mono"
                            >
                              {payout.tx_hash.slice(0, 10)}…
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
