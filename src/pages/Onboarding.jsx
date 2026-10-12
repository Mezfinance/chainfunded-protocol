import SEO from "@/components/SEO";
import BoltLoader from "@/components/brand/BoltLoader";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useDefaultRules } from "@/hooks/useDefaultRules";
import { useWhitelistTermsGate } from "@/hooks/useWhitelistTermsGate";
import { base44 } from "@/api/base44Client";
import { findWalletByCode } from "@/lib/affiliateCode";
import TermsAcceptanceGate from "@/components/TermsAcceptanceGate";
import { syncAccount } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  CheckCircle2,
  Zap,
  TrendingUp,
  Shield,
  Clock,
  Target,
  Scale,
  ChevronRight,
  ChevronDown,
  AlertCircle,
  Wallet,
  CreditCard,
  Tag,
  Gift,
  Plus,
  Coins,
  ArrowDownToLine,
} from "lucide-react";
import { createPageUrl } from "@/utils";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSendTransaction, useConnectModal, useActiveWallet, useSwitchActiveWalletChain } from "thirdweb/react";
import { thirdwebClient, chain, explorerTxUrl, wallets, appMetadata } from "@/lib/thirdwebClient";
import { getGasReimbursement, isInAppWallet } from "@/lib/gasEstimate";
import { usePrices } from "@/lib/PriceContext";
import { trackConversion } from "@/lib/xpixel";
import { getContract, prepareContractCall, waitForReceipt } from "thirdweb";
import { approve } from "thirdweb/extensions/erc20";
import { useProtocolStats } from "@/hooks/useProtocolStats";
import ThirdwebPayButton from "@/components/ThirdwebPayButton";
import TransferFundsPanel from "@/components/TransferFundsPanel";
import FomoNotifier from "@/components/marketing/FomoNotifier";
import FundedPitch from "@/components/marketing/FundedPitch";

import { CHALLENGE_TIERS as TIERS } from "@/data/challengeTiers";

function formatTvl(n) {
  if (n >= 1000000) return "$" + (n / 1000000).toFixed(0) + "M";
  if (n >= 1000) return "$" + (n / 1000).toFixed(0) + "K";
  return "$" + n;
}

// Rules are read from the smart contract via useDefaultRules hook (see below).
// This function builds the display array from live contract data.
function buildRules(r) {
  if (!r) return [];
  return [
    { icon: Target,    label: "Phase 1 Profit Target", value: `${r.phase1Target}%` },
    { icon: Target,    label: "Phase 2 Profit Target", value: `${r.phase2Target}%` },
    { icon: Shield,    label: "Max Daily Loss",         value: `${r.maxDailyLoss}%` },
    { icon: Shield,    label: "Max Total Loss",         value: `${r.maxTotalLoss}%` },
    { icon: Clock,     label: "Min Trading Days",       value: `${r.minTradingDays} days (minimum)` },
    { icon: Scale,     label: "Consistency (Best Day)", value: `≤ ${r.maxBestDay}% of total profit` },
    { icon: TrendingUp,label: "Profit Split",           value: `${r.traderShare}% / ${100 - r.traderShare}%` },
  ];
}

const USDC_ADDRESS          = import.meta.env.VITE_USDC_ADDRESS;
const REWARDS_POOL_ADDRESS  = import.meta.env.VITE_REWARDS_POOL_ADDRESS;
const STORAGE_KEY           = "cf_onboarding_payment";
const IS_SCREENSHOTS        = import.meta.env.VITE_SCREENSHOTS === 'true';

// USDC has 6 decimals — convert whole-dollar fee to on-chain units
const toUSDCUnits = (dollars) => BigInt(Math.round(dollars * 1_000_000));

export default function Onboarding() {
  const { address, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { mutateAsync: sendTransaction } = useSendTransaction();
  const activeWallet = useActiveWallet();
  const switchChain = useSwitchActiveWalletChain();
  const { getPrice } = usePrices();
  const { connect } = useConnectModal();
  const protocolStats = useProtocolStats();
  const { rules: defaultRules } = useDefaultRules();
  const RULES = buildRules(defaultRules);

  // Cold paid-ad traffic (utm/twclid) gets the full Funded landing experience as
  // an in-page intro before the challenge flow; everyone else goes straight in.
  const fromPaidAd =
    searchParams.get("utm_medium") === "paid" ||
    searchParams.has("twclid") ||
    ["x", "twitter"].includes(searchParams.get("utm_source"));
  // The full-landing intro for paid traffic is driven by a `begin` URL flag, so
  // the browser back button restores it (and forward re-enters the flow) instead
  // of leaving the page. Suppressed over a restored/in-progress payment (e.g. a
  // mobile wallet redirect rehydrating from STORAGE_KEY).
  const enteredFlow = searchParams.get("begin") === "1";
  const paymentInProgress = (() => {
    try { return !!sessionStorage.getItem(STORAGE_KEY); } catch { return false; }
  })();
  const showPitch = fromPaidAd && !enteredFlow && !paymentInProgress;
  // "Start your challenge" pushes the `begin` flag (a new history entry) and
  // reveals the flow — back returns to the intro, no navigation away.
  const beginFlow = () => {
    const params = new URLSearchParams(searchParams);
    params.set("begin", "1");
    setSearchParams(params);
  };

  const [selectedTier, setSelectedTier]         = useState(null);
  const [step, setStep]                         = useState(1);
  const [payStep, setPayStep]                   = useState("idle"); // idle | approving | paying | interrupted | done | error
  const [txHash, setTxHash]                     = useState("");
  const [approveTxHash, setApproveTxHash]       = useState("");
  const [error, setError]                       = useState("");
  const [createdAccountId, setCreatedAccountId] = useState(null);
  const [pendingAccountId, setPendingAccountId] = useState(null); // persisted across mobile redirects
  const [refCode, setRefCode]                   = useState("");       // referral code from ?ref=
  const [affiliateAddress, setAffiliateAddress] = useState("");      // resolved wallet for ref code
  const [referralInput, setReferralInput]       = useState("");      // manual referral code input
  const [referralError, setReferralError]       = useState("");      // validation error for manual input
  const [referralFromUrl, setReferralFromUrl]   = useState(false);   // true if ?ref= was in URL
  const [rulesScrolled, setRulesScrolled]       = useState(false);  // hides scroll indicator once user scrolls

  // Scroll to top on step change
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  // Reset scroll indicator when entering rules step; dismiss on first scroll
  useEffect(() => {
    if (step !== 2) return;
    setRulesScrolled(false);
    const onScroll = () => setRulesScrolled(true);
    window.addEventListener("scroll", onScroll, { once: true, passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [step]);
  const [referralLookingUp, setReferralLookingUp] = useState(false); // true while resolving CF- code
  const [onrampDone, setOnrampDone]                = useState(false); // true after fiat on-ramp completes
  const [whitelistChecked, setWhitelistChecked]    = useState(false);
  const [confirmPay, setConfirmPay]                = useState(null); // { fee, gasCost, total } or null
  const [whitelistPendingAccount, setWhitelistPendingAccount] = useState(null);
  const whitelistAccounts = whitelistPendingAccount ? [whitelistPendingAccount] : [];
  const { needsTermsAcceptance: whitelistNeedsTerms, acceptTerms: acceptWhitelistTerms } = useWhitelistTermsGate(address, whitelistAccounts);

  const tier = TIERS.find((t) => t.size === selectedTier);

  // ── Screenshots: seed initial state from URL params ────────────────────────
  useEffect(() => {
    if (!IS_SCREENSHOTS) return;
    const mockStep    = searchParams.get("mockStep");
    const mockPayStep = searchParams.get("mockPayStep");
    const mockTier    = searchParams.get("mockTier");
    const tierSize    = mockTier ? Number(mockTier) : 50000;
    setSelectedTier(tierSize);
    if (mockPayStep === "done") {
      setTxHash("0xmock_tx_hash_chain_funded_1234567890abcdef");
      setPayStep("done");
    } else if (mockPayStep) {
      setStep(3);
      if (mockPayStep === "paying") {
        setApproveTxHash("0xmock_approve_tx_1234567890abcdef9876543210");
      }
      setPayStep(mockPayStep);
    } else if (mockStep) {
      setStep(Number(mockStep));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── sessionStorage persistence (survives mobile wallet redirects) ──────────

  // Capture ?ref= param on mount and persist it
  useEffect(() => {
    const code = searchParams.get("ref");
    if (code) {
      setRefCode(code);
      setReferralFromUrl(true);
      sessionStorage.setItem("cf_ref_code", code);
    } else {
      const saved = sessionStorage.getItem("cf_ref_code");
      if (saved) {
        setRefCode(saved);
        setReferralFromUrl(true);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve affiliate wallet from ref code.
  // - 0x... full wallet address: legacy direct format
  // - 10 hex chars (e.g. "A3F2B91D7C"): SHA-256 hash prefix of the wallet,
  //   looked up by hashing each ChallengeAccount.trader_address
  useEffect(() => {
    if (!refCode) return;
    if (/^0x[0-9a-fA-F]{40}$/.test(refCode)) {
      setAffiliateAddress(refCode);
      return;
    }
    if (/^[0-9a-fA-F]{10}$/.test(refCode)) {
      let cancelled = false;
      (async () => {
        try {
          const records = await base44.entities.ChallengeAccount.list("-created_date", 1000);
          if (cancelled) return;
          const list = Array.isArray(records) ? records : [];
          const candidates = list.map((r) => r.trader_address).filter(Boolean);
          const wallet = await findWalletByCode(refCode, candidates);
          if (!cancelled && wallet) setAffiliateAddress(wallet);
        } catch { /* affiliate lookup failed — proceed without commission */ }
      })();
      return () => { cancelled = true; };
    }
  }, [refCode]);

  // Restore on mount — catches the "user was sent to MetaMask and came back" case
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const s = JSON.parse(saved);
      if (s.selectedTier)    setSelectedTier(s.selectedTier);
      if (s.step)            setStep(s.step);
      if (s.txHash)          setTxHash(s.txHash);
      if (s.approveTxHash)   setApproveTxHash(s.approveTxHash);
      if (s.pendingAccountId) setPendingAccountId(s.pendingAccountId);
      if (s.createdAccountId) setCreatedAccountId(s.createdAccountId);
      if (s.affiliateAddress) setAffiliateAddress(s.affiliateAddress);
      if (s.payStep === "done") {
        setPayStep("done");
      } else if (s.payStep === "approving" || s.payStep === "paying") {
        // Mid-payment when the page unloaded — outcome unknown
        setPayStep("interrupted");
      }
    } catch { /* ignore corrupt storage */ }
  }, []);

  // Persist whenever relevant state changes
  useEffect(() => {
    if (payStep === "idle") {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        selectedTier, step, payStep, txHash, approveTxHash,
        pendingAccountId, createdAccountId, affiliateAddress,
      }));
    } catch { /* storage full or unavailable */ }
  }, [selectedTier, step, payStep, txHash, approveTxHash, pendingAccountId, createdAccountId, affiliateAddress]);

  // Clear storage once payment is confirmed
  useEffect(() => {
    if (payStep === "done") sessionStorage.removeItem(STORAGE_KEY);
  }, [payStep]);

  const handleStartOver = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setPayStep("idle");
    setError("");
    setTxHash("");
    setApproveTxHash("");
    setPendingAccountId(null);
    // intentionally keep affiliateAddress — the user still arrived via the
    // referral link and the affiliate should receive their commission on retry
  };

  // ── Manual referral code entry ────────────────────────────────────────────

  const handleApplyReferral = async () => {
    const raw = referralInput.trim();
    if (!raw) {
      setReferralError("Please enter a referral code.");
      return;
    }

    // Accept formats:
    //  - 10 hex chars (current code format, e.g. "1A2B3C4D5E")
    //  - 0x... raw wallet address (legacy / power users)
    const hexMatch    = /^[0-9a-fA-F]{10}$/.test(raw);
    const walletMatch = /^0x[0-9a-fA-F]{40}$/.test(raw);

    if (!hexMatch && !walletMatch) {
      setReferralError("Invalid code. Use the 10-character code shown on the affiliate page.");
      return;
    }

    if (walletMatch) {
      if (raw.toLowerCase() === address?.toLowerCase()) {
        setReferralError("You cannot use your own wallet as a referral code.");
        return;
      }
      setReferralError("");
      setRefCode(raw);
      setAffiliateAddress(raw);
      sessionStorage.setItem("cf_ref_code", raw);
      return;
    }

    // Resolve 10 hex chars → wallet by hashing each ChallengeAccount record
    setReferralLookingUp(true);
    setReferralError("");
    try {
      const records = await base44.entities.ChallengeAccount.list("-created_date", 1000);
      const list = Array.isArray(records) ? records : [];
      const candidates = list.map((r) => r.trader_address).filter(Boolean);
      const resolvedAddr = await findWalletByCode(raw, candidates);
      if (!resolvedAddr) {
        setReferralError("Referral code not found. Ask your referrer to check the code on their affiliate page.");
        return;
      }
      if (resolvedAddr.toLowerCase() === address?.toLowerCase()) {
        setReferralError("You cannot use your own wallet as a referral code.");
        return;
      }
      setRefCode(raw);
      setAffiliateAddress(resolvedAddr);
      sessionStorage.setItem("cf_ref_code", raw);
    } catch {
      setReferralError("Could not verify referral code. Please try again.");
    } finally {
      setReferralLookingUp(false);
    }
  };

  const handleClearReferral = () => {
    setRefCode("");
    setAffiliateAddress("");
    setReferralInput("");
    setReferralError("");
    sessionStorage.removeItem("cf_ref_code");
  };

  // ── Whitelist check — detect pre-created free account ──────────────────

  useEffect(() => {
    if (!isAuthenticated || !address || whitelistChecked) return;
    if (payStep === "done") return;

    let cancelled = false;
    (async () => {
      try {
        // The admin already created and on-chain registered the account
        // via WhitelistManager. Just check if one exists for this wallet.
        const accounts = await base44.entities.ChallengeAccount.filter({ trader_address: address });
        const list = Array.isArray(accounts) ? accounts : [];
        const freeAccount = list.find(
          (a) => a.challenge_fee_usdc === 0 && a.status === "active" && a.phase === "phase_1"
        );

        if (freeAccount && !cancelled) {
          setWhitelistPendingAccount(freeAccount);
        }
      } catch (err) {
        console.error("[whitelist] Check failed:", err);
      } finally {
        if (!cancelled) setWhitelistChecked(true);
      }
    })();

    return () => { cancelled = true; };
  }, [isAuthenticated, address]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Payment flow ──────────────────────────────────────────────────────────

  // Step 1: Estimate gas and show confirmation
  const handlePayClick = async () => {
    if (!address || !tier) return;
    setError("");

    if (!REWARDS_POOL_ADDRESS) {
      setError("RewardsPool contract address is not configured. Please contact support.");
      return;
    }
    if (!USDC_ADDRESS) {
      setError("USDC contract address is not configured. Please contact support.");
      return;
    }

    const gasReimbursement = await getGasReimbursement("registerChallenge", activeWallet, getPrice("ETHUSDT"));
    const gasCostHuman = Number(gasReimbursement) / 1_000_000;

    if (isInAppWallet(activeWallet) && gasCostHuman > 0) {
      setConfirmPay({ fee: tier.fee, gasCost: gasCostHuman, total: tier.fee + gasCostHuman, gasReimbursement });
    } else {
      // External wallet — no gas reimbursement, skip confirmation
      executePayment(0n);
    }
  };

  // Step 2: Execute after confirmation
  const executePayment = async (gasReimbursement) => {
    setConfirmPay(null);
    setError("");
    setApproveTxHash("");
    setTxHash("");

    try {
      const accountId = pendingAccountId ?? Array.from(crypto.getRandomValues(new Uint8Array(12)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      setPendingAccountId(accountId);

      const feeUnits = toUSDCUnits(tier.fee);
      const gasReimbursementHuman = Number(gasReimbursement) / 1_000_000;

      // Ensure mobile wallets are on the correct chain before sending
      await switchChain(chain);

      // 1. Approve the RewardsPool to spend USDC (fee + gas reimbursement)
      setPayStep("approving");
      const usdcContract = getContract({ client: thirdwebClient, chain, address: USDC_ADDRESS });
      const approveTx = await sendTransaction(
        approve({ contract: usdcContract, spender: REWARDS_POOL_ADDRESS, amount: tier.fee + gasReimbursementHuman })
      );
      setApproveTxHash(approveTx?.transactionHash || "");
      await waitForReceipt({ client: thirdwebClient, chain, transactionHash: approveTx.transactionHash });

      // 2. Register the challenge on-chain — snapshots rules and collects the fee + gas
      setPayStep("paying");
      const rewardsPool = getContract({ client: thirdwebClient, chain, address: REWARDS_POOL_ADDRESS });
      const affiliateParam = affiliateAddress || "0x0000000000000000000000000000000000000000";
      const payTx = prepareContractCall({
        contract: rewardsPool,
        method:   "function registerChallenge(uint256 feeAmount, string accountId, uint256 accountSize, uint8 phase, address affiliate, uint256 gasReimbursementUsdc)",
        params:   [feeUnits, accountId, toUSDCUnits(tier.size), 1, affiliateParam, gasReimbursement],
      });
      const receipt = await sendTransaction(payTx);
      setTxHash(receipt.transactionHash);
      await waitForReceipt({ client: thirdwebClient, chain, transactionHash: receipt.transactionHash });

      // 3. Payment confirmed — now create the DB record. No record exists until here,
      //    so a cancelled or failed payment leaves nothing behind.
      const created = await base44.entities.ChallengeAccount.create({
        id:                 accountId,
        account_id:         accountId,
        trader_address:     address,
        account_size:       tier.size,
        phase:              "phase_1",
        starting_balance:   tier.size,
        current_balance:    tier.size,
        peak_balance:       tier.size,
        day_start_balance:  tier.size,
        challenge_fee_usdc: tier.fee,
        status:             "active",
        onchain_registered: true,
        fee_tx_hash:        receipt.transactionHash,
        chain_id:           Number(import.meta.env.VITE_CHAIN_ID) || 1,
        start_date:         new Date().toISOString().split("T")[0],
        ...(refCode && { referral_code: refCode }),
      });

      // base44 may ignore the `id` hint and assign its own. Downstream
      // trades reference `account.id` (base44's actual id), so Supabase must
      // store the same value in both `id` and `account_id` for the worker
      // to join cleanly. Prefer the id base44 returned; fall back to our
      // client-generated accountId if the response didn't include one.
      const b44Id = created?.id || accountId;

      syncAccount(b44Id, { id: b44Id, account_id: b44Id, trader_address: address, account_size: tier.size, phase: "phase_1", starting_balance: tier.size, current_balance: tier.size, day_start_balance: tier.size, max_daily_loss_pct: 5, max_total_loss_pct: 10, chain_id: Number(import.meta.env.VITE_CHAIN_ID) || 1 });

      // 4. Clean up referral session storage (commission was already paid on-chain)
      if (affiliateAddress) {
        sessionStorage.removeItem("cf_ref_code");
      }
      setCreatedAccountId(accountId);
      setPendingAccountId(null);
      setPayStep("done");

      // X conversion: challenge purchase. Fires pixel + Conversion API with
      // conversion_id = tx hash so the two sources de-duplicate.
      trackConversion("purchase", {
        value: tier.fee,
        currency: "USD",
        conversion_id: receipt.transactionHash,
        contents: [{ content_type: "challenge", content_id: String(tier.size) }],
      });
    } catch (err) {
      console.error("Payment failed:", err);
      // If the on-chain registration already went through (ChallengeAlreadyRegistered),
      // clear the pending ID so a retry generates a fresh one rather than hitting
      // the same collision again.
      if (err.message?.includes("ChallengeAlreadyRegistered") || err.message?.includes("0x82b8f1ee")) {
        setPendingAccountId(null);
      }
      setError(err.message || "Payment failed. Please try again.");
      setPayStep("error");
    }
  };

  // ── Cold-ad intro: full Funded landing, then reveal the challenge flow ────
  // Covers the site nav (z-60) so paid traffic gets the focused landing; the CTA
  // dismisses it in place — no navigation, no ad re-review.
  if (showPitch) {
    return (
      <div className="fixed inset-0 z-[60] overflow-y-auto bg-background text-foreground">
        <FundedPitch onStart={beginFlow} />
      </div>
    );
  }

  // ── Payment confirmation dialog (in-app wallets) ─────────────────────────

  if (confirmPay) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-6 max-w-md mx-auto">
        <div className="w-16 h-16 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center glow-green">
          <Shield className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-grotesk font-bold text-foreground mb-2">Confirm Payment</h2>
          <p className="text-muted-foreground text-sm">
            Review the details below before confirming your challenge purchase.
          </p>
        </div>

        <Card className="w-full border-border/60 bg-card/50">
          <CardContent className="p-5 space-y-3 text-left">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Challenge Fee</span>
              <span className="text-foreground font-medium">{confirmPay.fee.toFixed(2)} USDC</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Network Fee (gas)</span>
              <span className="text-foreground font-medium">{confirmPay.gasCost.toFixed(2)} USDC</span>
            </div>
            <div className="border-t border-border/40 pt-3 flex justify-between text-sm font-semibold">
              <span className="text-foreground">Total</span>
              <span className="text-primary">{confirmPay.total.toFixed(2)} USDC</span>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 w-full">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setConfirmPay(null)}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-primary text-primary-foreground glow-green"
            onClick={() => executePayment(confirmPay.gasReimbursement)}
          >
            Confirm & Pay
          </Button>
        </div>
      </div>
    );
  }

  // ── Whitelist terms acceptance gate ───────────────────────────────────────

  if (whitelistPendingAccount && whitelistNeedsTerms) {
    return (
      <TermsAcceptanceGate
        variant="whitelist"
        walletAddress={address}
        onAccept={() => {
          acceptWhitelistTerms();
          setCreatedAccountId(whitelistPendingAccount.id);
          setPayStep("done");
        }}
      />
    );
  }

  // ── Success screen ────────────────────────────────────────────────────────

  if (payStep === "done") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-6">
        <div className="w-16 h-16 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center glow-green">
          <CheckCircle2 className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-grotesk font-bold text-foreground mb-2">Challenge Activated!</h2>
          <p className="text-muted-foreground max-w-md">
            {txHash
              ? "Your evaluation fee has been paid on-chain and your Phase 1 challenge is now active."
              : "Your free Phase 1 challenge account has been created and is now active."}
          </p>
        </div>
        {txHash && (
          <a
            href={explorerTxUrl(txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary font-mono hover:underline"
          >
            {txHash.slice(0, 20)}… (view on Etherscan)
          </a>
        )}

        <Card className="w-full max-w-md border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4 flex items-start gap-3 text-left">
            <div className="shrink-0 w-9 h-9 rounded-md bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <Gift className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground mb-0.5">
                One more step — register for CFG Rewards
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                Every trade you make earns CFG points toward this season's reward pool. Accounts that aren't registered don't accrue points.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(createPageUrl("CfgRewards"))}
                className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 gap-2"
              >
                Register for CFG Rewards <ChevronRight className="w-3 h-3" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Button
          onClick={() => navigate(createPageUrl("TraderDashboard"))}
          className="bg-primary text-primary-foreground gap-2"
        >
          Go to Trader Hub <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  // ── Main flow ─────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <SEO
        title="Start Your Trading Challenge"
        description="Get funded up to $200,000. Pay a one-time USDC evaluation fee, pass two challenge phases, and receive automatic on-chain payouts. No middlemen — smart contract enforced."
        canonical="/"
      />
      {/* Header */}
      <div className="text-center space-y-3">
        <Badge variant="outline" className="border-primary/30 text-primary">
          <Zap className="w-3 h-3 mr-1" /> Industry-Standard Rules · On-Chain Settlement
        </Badge>
        <h1 className="text-3xl md:text-4xl font-grotesk font-bold text-foreground">
          Start Your <span className="gradient-text">Funded Challenge</span>
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Trade simulated capital, prove your edge across two phases, and get funded. Payouts settled in seconds on-chain via smart contract.
        </p>
      </div>


      {/* Step indicators */}
      <div className="flex items-center justify-center gap-2 text-sm">
        {["Choose Account", "Review Rules", "Pay & Launch"].map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${step > i + 1 ? "bg-primary text-primary-foreground" : step === i + 1 ? "bg-primary/20 border border-primary text-primary" : "bg-secondary text-muted-foreground"}`}>
              {step > i + 1 ? <CheckCircle2 className="w-3 h-3" /> : i + 1}
            </div>
            <span className={step === i + 1 ? "text-foreground" : "text-muted-foreground"}>{s}</span>
            {i < 2 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* Step 1: Select Tier */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground text-center">Select your simulated account size</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TIERS.map((t) => {
              const currentTvl = protocolStats?.tvlUsdc || 0;
              const isLocked = t.tvlUnlock > 0 && currentTvl < t.tvlUnlock;
              return (
                <Card
                  key={t.size}
                  onClick={() => !isLocked && setSelectedTier(t.size)}
                  className={`relative transition-all border-2 ${isLocked ? "opacity-50 cursor-not-allowed border-border" : "cursor-pointer"} ${!isLocked && selectedTier === t.size ? "border-primary bg-primary/5 glow-green-sm" : !isLocked ? "border-border hover:border-primary/40" : ""}`}
                >
                  {t.popular && !isLocked && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
                      <Badge className="bg-primary text-primary-foreground text-xs">Most Popular</Badge>
                    </div>
                  )}
                  <CardContent className="pt-6 pb-4 text-center space-y-2 relative z-0">
                    <p className={`text-2xl font-grotesk font-bold ${isLocked ? "text-muted-foreground" : "text-foreground"}`}>{t.label}</p>
                    <p className="text-sm text-muted-foreground">Simulated Account</p>
                    <div className="border-t border-border my-2" />
                    {isLocked ? (
                      <>
                        <p className="text-sm font-medium text-muted-foreground">Unlocks at {formatTvl(t.tvlUnlock)} TVL</p>
                        <p className="text-xs text-muted-foreground/60">Pool growth milestone</p>
                      </>
                    ) : t.launchSale && t.originalFee ? (
                      <>
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-muted-foreground line-through text-sm">{t.originalFee} USDC</span>
                          <span className="text-primary font-semibold">{t.fee} USDC</span>
                        </div>
                        <p className="text-xs text-muted-foreground">One-time fee</p>
                      </>
                    ) : (
                      <>
                        <p className="text-primary font-semibold">{t.fee} USDC</p>
                        <p className="text-xs text-muted-foreground">One-time fee</p>
                      </>
                    )}
                    {!isLocked && selectedTier === t.size && (
                      <Button
                        size="sm"
                        className="w-full mt-3 sm:hidden bg-primary text-primary-foreground gap-1"
                        onClick={(e) => { e.stopPropagation(); setStep(2); }}
                      >
                        Continue <ChevronRight className="w-3 h-3" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <div className="bg-secondary/40 border border-border rounded-lg p-4 flex gap-3 text-sm text-muted-foreground">
            <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <span>
              Account balances are <strong className="text-foreground">simulated capital only</strong> — no real funds are traded. The challenge fee is the only real money you pay. Payouts are funded from the LP pool and paid in USDC upon passing both phases.
            </span>
          </div>
          <div className="flex justify-center pt-2">
            <Button disabled={!selectedTier} onClick={() => setStep(2)} className="bg-primary text-primary-foreground gap-2 px-8">
              Continue <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Rules */}
      {step === 2 && (
        <div className="space-y-6 relative">
          <h2 className="text-lg font-semibold text-foreground text-center">Trading Rules (Industry-Standard 2-Phase)</h2>

          {/* Scroll indicator — mobile only, fades out once user scrolls */}
          {!rulesScrolled && (
            <div className="sm:hidden flex flex-col items-center gap-1 text-muted-foreground animate-bounce">
              <span className="text-xs">Scroll to read all rules</span>
              <ChevronDown className="w-4 h-4" />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {RULES.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3 p-4 bg-card border border-border rounded-lg">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-sm font-semibold text-foreground">{value}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-4 flex gap-3">
            <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p>All trading is done with <span className="text-foreground font-medium">simulated funds</span>. Real payouts are only issued after passing both phases and are settled on-chain via smart contract.</p>
              <p>Breaching the <span className="text-foreground font-medium">{defaultRules?.maxDailyLoss ?? 5}% daily loss</span> or <span className="text-foreground font-medium">{defaultRules?.maxTotalLoss ?? 10}% total loss</span> limits will immediately fail your challenge. Monitor your drawdown at all times.</p>
              <p>The <span className="text-foreground font-medium">consistency rule</span> is checked at payout: no single trading day's profit may exceed <span className="text-foreground font-medium">{defaultRules?.maxBestDay ?? 50}%</span> of your total profit. Spread your gains across multiple days.</p>
              <p className="text-yellow-400/80">Challenge fees are non-refundable once paid on-chain.</p>
            </div>
          </div>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={() => setStep(2.5)} className="bg-primary text-primary-foreground gap-2 px-8">
              I Agree, Continue <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2.5: Terms and Conditions — full scroll-through acceptance */}
      {step === 2.5 && (
        <div className="space-y-4">
          <div className="flex justify-center gap-3 mb-2">
            <Button variant="outline" size="sm" onClick={() => setStep(2)}>Back to Rules</Button>
          </div>
          <TermsAcceptanceGate
            walletAddress={address}
            onAccept={() => setStep(3)}
          />
        </div>
      )}

      {/* Step 3: Pay */}
      {step === 3 && (
        <div className="max-w-md mx-auto space-y-5">
          <h2 className="text-lg font-semibold text-foreground text-center">Pay & Launch</h2>

          <Card className="border-border">
            <CardContent className="pt-5 space-y-4">
              {/* Wallet status */}
              {isAuthenticated ? (
                <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/30 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Connected</p>
                    <p className="text-sm font-mono text-foreground truncate">{address}</p>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full border-primary/40 text-primary hover:bg-primary/10 gap-1.5"
                  onClick={() => connect({ client: thirdwebClient, chain, wallets, appMetadata })}
                >
                  <Wallet className="w-3.5 h-3.5" /> Sign In
                </Button>
              )}

              {/* Payment selector — "Pay with USDC" (spend your balance) vs
                  "Add Funds" (get USDC into the wallet first). The active panel
                  renders directly below the selector; the Pay button stays at
                  the bottom (after the order summary + referral). Both panels
                  live in one <Tabs> root — only the active one mounts. */}
              <Tabs defaultValue="pay" className="w-full space-y-4">
                <TabsList className="w-full grid grid-cols-2">
                  <TabsTrigger value="pay" className="gap-1.5 text-xs">
                    <Wallet className="w-3.5 h-3.5" /> Pay with USDC
                  </TabsTrigger>
                  <TabsTrigger value="fund" className="gap-1.5 text-xs">
                    <Plus className="w-3.5 h-3.5" /> Add Funds
                  </TabsTrigger>
                </TabsList>

                {/* ── Add Funds — sub-selector + active method, directly below ── */}
                <TabsContent value="fund" className="space-y-3 mt-0">
                  {isAuthenticated ? (
                    <>
                      <Tabs defaultValue="card" className="w-full space-y-3">
                        <TabsList className="w-full grid grid-cols-3">
                          <TabsTrigger value="card" className="gap-1 text-xs">
                            <CreditCard className="w-3.5 h-3.5" /> Card
                          </TabsTrigger>
                          <TabsTrigger value="crypto" className="gap-1 text-xs">
                            <Coins className="w-3.5 h-3.5" /> Crypto
                          </TabsTrigger>
                          <TabsTrigger value="transfer" className="gap-1 text-xs">
                            <ArrowDownToLine className="w-3.5 h-3.5" /> Transfer
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent value="card" className="mt-0">
                          <ThirdwebPayButton
                            method="card"
                            tier={tier}
                            address={address}
                            onSuccess={() => setOnrampDone(true)}
                            key={onrampDone ? "card-done" : "card-idle"}
                          />
                        </TabsContent>

                        <TabsContent value="crypto" className="mt-0">
                          <ThirdwebPayButton
                            method="crypto"
                            tier={tier}
                            address={address}
                            onSuccess={() => setOnrampDone(true)}
                            key={onrampDone ? "crypto-done" : "crypto-idle"}
                          />
                        </TabsContent>

                        <TabsContent value="transfer" className="mt-0">
                          <TransferFundsPanel
                            tier={tier}
                            address={address}
                            onFunded={() => setOnrampDone(true)}
                          />
                        </TabsContent>
                      </Tabs>

                      <p className="text-xs text-muted-foreground text-center">
                        Once your USDC arrives, switch to <span className="text-foreground font-medium">Pay with USDC</span> to finish.
                      </p>
                    </>
                  ) : (
                    <div className="text-center space-y-2 py-4">
                      <p className="text-sm text-muted-foreground">
                        Connect your wallet first to add funds.
                      </p>
                    </div>
                  )}
                </TabsContent>

                {/* Order summary */}
                <div className="bg-secondary/40 border border-border rounded-lg p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Account Size</span>
                    <span className="text-foreground font-medium">${tier?.size.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Challenge Fee</span>
                    <span className="text-primary font-semibold">{tier?.fee} USDC</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Profit Split</span>
                    <span className="text-foreground">80% Trader / 20% Firm</span>
                  </div>
                </div>

                {/* Referral code */}
                {affiliateAddress ? (
                  <div className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <Tag className="w-3.5 h-3.5 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Referral applied</p>
                        <p className="text-xs font-mono text-foreground truncate">
                          {"CF-" + affiliateAddress.slice(2, 8).toUpperCase()}
                        </p>
                      </div>
                    </div>
                    {!referralFromUrl && payStep === "idle" && (
                      <button
                        onClick={handleClearReferral}
                        className="text-xs text-muted-foreground/60 hover:text-muted-foreground underline underline-offset-2 shrink-0 ml-2"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      <Tag className="w-3 h-3 inline mr-1" />
                      Have a referral code? <span className="text-muted-foreground/60">(optional)</span>
                    </p>
                    <div className="flex gap-2">
                      <Input
                        value={referralInput}
                        onChange={(e) => { setReferralInput(e.target.value); setReferralError(""); }}
                        placeholder="1A2B3C4D5E"
                        className="h-8 text-xs font-mono bg-secondary/40 border-border uppercase placeholder:normal-case"
                        disabled={payStep !== "idle" || referralLookingUp}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs shrink-0"
                        onClick={handleApplyReferral}
                        disabled={payStep !== "idle" || !referralInput.trim() || referralLookingUp}
                      >
                        {referralLookingUp ? <BoltLoader className="w-3 h-3" /> : "Apply"}
                      </Button>
                    </div>
                    {referralError && (
                      <p className="text-xs text-red-400">{referralError}</p>
                    )}
                  </div>
                )}

                {/* ── Pay with USDC — Pay button stays at the bottom ── */}
                <TabsContent value="pay" className="space-y-4 mt-0">
                  {/* Interrupted banner */}
                  {payStep === "interrupted" && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                      <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                      <div className="text-xs text-yellow-300 space-y-1">
                        <p className="font-medium">Payment was interrupted</p>
                        <p className="text-yellow-300/80">
                          Your app was closed while a transaction was pending. Check your wallet history — if a transaction went through your account will appear in the Trader Hub. Otherwise retry below.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Payment step indicator */}
                  {payStep !== "idle" && payStep !== "error" && (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <div className={`flex items-center gap-2 text-sm ${payStep === "approving" ? "text-primary" : "text-muted-foreground"}`}>
                          {payStep === "approving"
                            ? <BoltLoader className="w-4 h-4" />
                            : <CheckCircle2 className="w-4 h-4 text-green-400" />}
                          Step 1: Approve USDC spending
                        </div>
                        {payStep === "approving" && (
                          <p className="text-xs text-muted-foreground pl-6">
                            Waiting for confirmation on Ethereum — this can take 30–90 seconds…
                          </p>
                        )}
                        {approveTxHash && payStep !== "approving" && (
                          <a
                            href={explorerTxUrl(approveTxHash)}
                            target="_blank" rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline font-mono pl-6 block"
                          >
                            {approveTxHash.slice(0, 18)}… ↗
                          </a>
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className={`flex items-center gap-2 text-sm ${payStep === "paying" ? "text-primary" : payStep === "done" ? "text-muted-foreground" : "text-muted-foreground/40"}`}>
                          {payStep === "paying"
                            ? <BoltLoader className="w-4 h-4" />
                            : payStep === "done"
                            ? <CheckCircle2 className="w-4 h-4 text-green-400" />
                            : <div className="w-4 h-4 rounded-full border border-muted-foreground/30" />}
                          Step 2: Pay evaluation fee
                        </div>
                        {payStep === "paying" && (
                          <p className="text-xs text-muted-foreground pl-6">
                            Approval confirmed! Now confirm the fee payment in MetaMask…
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Error */}
                  {error && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                      <p className="text-xs text-red-400">{error}</p>
                    </div>
                  )}

                  <Button
                    className="w-full bg-primary text-primary-foreground glow-green"
                    disabled={!isAuthenticated || (payStep !== "idle" && payStep !== "error" && payStep !== "interrupted")}
                    onClick={handlePayClick}
                  >
                    {payStep === "approving" || payStep === "paying"
                      ? <><BoltLoader className="w-4 h-4 mr-2" /> Processing...</>
                      : payStep === "error" || payStep === "interrupted"
                      ? "Retry Payment"
                      : `Pay ${tier?.fee} USDC`}
                  </Button>

                  {(payStep === "error" || payStep === "interrupted") && (
                    <button
                      onClick={handleStartOver}
                      className="w-full text-xs text-muted-foreground/60 hover:text-muted-foreground text-center underline underline-offset-2"
                    >
                      Start over with a fresh attempt
                    </button>
                  )}

                  <p className="text-xs text-muted-foreground text-center">
                    Two wallet confirmations required: approve + pay
                  </p>
                </TabsContent>
              </Tabs>

              <p className="text-xs text-muted-foreground/70 text-center">
                Challenge fees are non-refundable. You are paying for access to a simulated trading environment only.
              </p>
            </CardContent>
          </Card>

          <div className="flex justify-center">
            <Button variant="ghost" onClick={() => { handleStartOver(); setStep(2); }} className="text-muted-foreground text-sm" disabled={payStep === "approving" || payStep === "paying"}>
              Back
            </Button>
          </div>
        </div>
      )}
      <FomoNotifier />
    </div>
  );
}
