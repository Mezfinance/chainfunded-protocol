import { useState, useEffect } from "react";
import BoltLoader from "@/components/brand/BoltLoader";
import { base44 } from "@/api/base44Client";
import { syncAccount } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Trash2, Mail, Wallet, Gift, Link2 } from "lucide-react";
import { useSendTransaction } from "thirdweb/react";
import { getContract, prepareContractCall, readContract, waitForReceipt } from "thirdweb";
import { thirdwebClient, chain } from "@/lib/thirdwebClient";
import { useCommunityToken } from "@/hooks/useCommunityToken";
import { workerPost } from "@/lib/workerApi";
import { CHALLENGE_TIERS } from "@/data/challengeTiers";
import { useProtocolStats } from "@/hooks/useProtocolStats";

const POOL_ADDRESS = import.meta.env.VITE_REWARDS_POOL_ADDRESS;
const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID) || 1;

// adminRegisterChallenge accepts on-chain phase 1–3. Map the picker to the
// on-chain uint8 and the off-chain phase string.
const PHASE_OPTIONS = [
  { value: 1, label: "Phase 1", offchain: "phase_1" },
  { value: 2, label: "Phase 2", offchain: "phase_2" },
  { value: 3, label: "Funded",  offchain: "funded"  },
];
const offchainPhase = (p) => (Number(p) === 3 ? "funded" : Number(p) === 2 ? "phase_2" : "phase_1");
const onchainPhase  = (s) => (s === "funded" ? 3 : s === "phase_2" ? 2 : 1);

export default function WhitelistManager() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [addStep, setAddStep] = useState(""); // "" | "creating" | "registering"
  const [walletInput, setWalletInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [error, setError] = useState("");
  const [registeringId, setRegisteringId] = useState(null);
  const [registerError, setRegisterError] = useState({});
  const [resolving, setResolving] = useState(false);
  const [resolveNote, setResolveNote] = useState("");
  const [selectedSize, setSelectedSize] = useState(1000);
  const [selectedPhase, setSelectedPhase] = useState(1);

  const { mutateAsync: sendTransaction } = useSendTransaction();
  const { token, signIn } = useCommunityToken();
  const protocolStats = useProtocolStats();

  // Resolve (or pre-generate) the trader's abstracted in-app wallet from their
  // email and drop the address into the wallet field for review before adding.
  const resolveFromEmail = async () => {
    const email = emailInput.trim().toLowerCase();
    setError("");
    setResolveNote("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email to resolve a wallet.");
      return;
    }
    setResolving(true);
    try {
      const tok = token || (await signIn());
      const res = await workerPost("/admin/resolve-wallet", { email, ...tok });
      // Parse defensively — a 404/405 from an un-redeployed worker has an empty
      // body, which would otherwise throw an opaque "Unexpected end of JSON".
      const text = await res.text();
      let body = {};
      try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
      if (!res.ok || !body.address) {
        throw new Error(
          body.error ||
            (res.status === 404
              ? "Endpoint not found — the worker needs to be redeployed with the wallet-resolve route."
              : `Worker error ${res.status}`)
        );
      }
      setWalletInput(body.address);
      setResolveNote(`Abstracted wallet for ${email}: ${body.address}`);
    } catch (e) {
      setError(e.message || "Could not resolve wallet from email");
    } finally {
      setResolving(false);
    }
  };

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.Whitelist.list("-created_date", 200);
      setEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("[whitelist] fetch error:", err.message);
    }
    setLoading(false);
  };

  useEffect(() => { fetchEntries(); }, []);

  // Check on-chain status for entries that have an account but aren't marked registered
  useEffect(() => {
    if (!POOL_ADDRESS || entries.length === 0) return;
    const unchecked = entries.filter((e) => e.redeemed_account_id && !e.onchain_registered);
    if (unchecked.length === 0) return;

    const pool = getContract({ client: thirdwebClient, chain, address: POOL_ADDRESS });
    (async () => {
      for (const entry of unchecked) {
        try {
          const existing = await readContract({
            contract: pool,
            method: "function getChallenge(string accountId) view returns ((address trader, uint256 accountSizeUsdc, uint8 phase, bool settled, uint256 createdAt, uint256 profitTargetBps, uint256 maxDailyLossBps, uint256 maxTotalLossBps, uint256 minTradingDays, uint256 traderShareBps, uint256 maxBestDayBps))",
            params: [entry.redeemed_account_id] });
          if (existing.createdAt > 0n) {
            setEntries((prev) =>
              prev.map((e) => e.id === entry.id ? { ...e, onchain_registered: true } : e)
            );
            try { await base44.entities.Whitelist.update(entry.id, { onchain_registered: true }); } catch {}
          }
        } catch { /* ignore */ }
      }
    })();
  }, [entries.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Add to whitelist (creates Base44 account + whitelist entry, no on-chain) ──

  const handleAdd = async () => {
    const wallet = walletInput.trim();
    const email = emailInput.trim().toLowerCase();
    setError("");

    if (!wallet) {
      setError("Wallet address is required.");
      return;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      setError("Invalid wallet address (must be 0x + 40 hex chars).");
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Invalid email address.");
      return;
    }

    // A wallet may hold more than one challenge account, so we deliberately
    // don't block re-granting to an already-whitelisted wallet. Each grant
    // mints its own random accountId, so the extra account is fully distinct.

    setAdding(true);
    const tierSize = selectedSize;
    const phaseNum = Number(selectedPhase);
    const phaseStr = offchainPhase(phaseNum);

    try {
      // 1. Generate account ID (used on-chain as the string accountId)
      const accountId = Array.from(crypto.getRandomValues(new Uint8Array(12)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // 2. Create ChallengeAccount in Base44
      // Capture the returned entity — base44 may ignore the `id` hint and
      // assign its own ID. We must use the ID base44 actually assigned for all
      // subsequent updates and for the Supabase account_id column, so the
      // worker's trade-to-account join works (trades reference account.id which
      // is base44's ID, and the worker keys its cache by account_id).
      setAddStep("creating");
      const created = await base44.entities.ChallengeAccount.create({
        id:                 accountId,
        account_id:         accountId,
        trader_address:     wallet,
        account_size:       tierSize,
        phase:              phaseStr,
        starting_balance:   tierSize,
        current_balance:    tierSize,
        peak_balance:       tierSize,
        challenge_fee_usdc: 0,
        status:             "active",
        onchain_registered: false,
        chain_id:           CHAIN_ID,
        start_date:         new Date().toISOString().split("T")[0] });
      const b44Id = created?.id || accountId;

      // 3. Register on-chain via adminRegisterChallenge (admin signs)
      // The on-chain accountId string remains our client-generated value — the
      // contract doesn't care about base44's internal ID.
      setAddStep("registering");
      if (POOL_ADDRESS) {
        const pool = getContract({ client: thirdwebClient, chain, address: POOL_ADDRESS });
        const accountSizeUnits = BigInt(tierSize * 1_000_000);
        const tx = await sendTransaction(
          prepareContractCall({
            contract: pool,
            method: "function adminRegisterChallenge(address trader, string accountId, uint256 accountSize, uint8 phase)",
            params: [wallet, accountId, accountSizeUnits, phaseNum] })
        );
        const receipt = await waitForReceipt({ client: thirdwebClient, chain, transactionHash: tx.transactionHash });
        if (receipt.status === "reverted") throw new Error("Transaction reverted — check that your wallet is the contract owner");

        // Use b44Id (not accountId) so the update targets the correct entity
        try {
          await base44.entities.ChallengeAccount.update(b44Id, { onchain_registered: true });
        } catch {
          // Non-fatal — useOnchainRegistrationSync will pick it up
          console.warn("[whitelist] Could not update onchain_registered flag, sync hook will handle it");
        }
      }

      // 4. Sync to Supabase for the worker.
      // Mirror Onboarding.jsx: use b44Id for both the row PK and account_id so
      // the worker cache key (acctKey = account_id || id) matches the account_id
      // stored on trades (which are created with account_id: account.id = b44Id).
      syncAccount(b44Id, {
        id: b44Id,
        account_id: b44Id,
        trader_address: wallet,
        account_size: tierSize,
        phase: phaseStr,
        starting_balance: tierSize,
        current_balance: tierSize,
        max_daily_loss_pct: 5,
        max_total_loss_pct: 10,
        chain_id: CHAIN_ID });

      // 5. Save whitelist log entry (best-effort). By this point the account is
      // already created, registered on-chain, and synced to Supabase — so a
      // permission error here must NOT surface as a failure. It only affects
      // this admin list, which fetchEntries() reconciles anyway.
      try {
        await base44.entities.Whitelist.create({
          wallet_address: wallet,
          email: email || null,
          note: noteInput.trim() || null,
          tier_size: tierSize,
          granted_phase: phaseStr,
          redeemed: true,
          redeemed_account_id: accountId,
          onchain_registered: true });
      } catch (err) {
        console.warn("[whitelist] log-entry create failed (account is live regardless):", err.message);
        setResolveNote(`Account created & registered for ${wallet}. (Whitelist log entry was not saved — check entity permissions.)`);
      }

      setWalletInput("");
      setEmailInput("");
      setNoteInput("");
      await fetchEntries();
    } catch (err) {
      setError(err.message || "Failed to create account.");
    } finally {
      setAdding(false);
      setAddStep("");
    }
  };

  // ── Register on-chain (same logic as ChallengeManager) ────────────────────

  const handleRegisterOnChain = async (entry) => {
    if (!POOL_ADDRESS) {
      setRegisterError((prev) => ({ ...prev, [entry.id]: "Pool address not configured" }));
      return;
    }
    const accountId = entry.redeemed_account_id;
    if (!accountId) {
      setRegisterError((prev) => ({ ...prev, [entry.id]: "No account ID linked" }));
      return;
    }
    if (!entry.wallet_address) {
      setRegisterError((prev) => ({ ...prev, [entry.id]: "No wallet address" }));
      return;
    }

    setRegisteringId(entry.id);
    setRegisterError((prev) => ({ ...prev, [entry.id]: "" }));

    try {
      const pool = getContract({ client: thirdwebClient, chain, address: POOL_ADDRESS });
      const accountSizeUnits = BigInt((entry.tier_size || 1000) * 1_000_000);
      const phaseNum = onchainPhase(entry.granted_phase); // defaults to phase 1 for legacy entries

      // Check if already registered on-chain
      let alreadyRegistered = false;
      try {
        const existing = await readContract({
          contract: pool,
          method: "function getChallenge(string accountId) view returns ((address trader, uint256 accountSizeUsdc, uint8 phase, bool settled, uint256 createdAt, uint256 profitTargetBps, uint256 maxDailyLossBps, uint256 maxTotalLossBps, uint256 minTradingDays, uint256 traderShareBps, uint256 maxBestDayBps))",
          params: [accountId] });
        alreadyRegistered = existing.createdAt > 0n;
      } catch { /* may revert for unknown IDs */ }

      if (!alreadyRegistered) {
        const tx = await sendTransaction(
          prepareContractCall({
            contract: pool,
            method: "function adminRegisterChallenge(address trader, string accountId, uint256 accountSize, uint8 phase)",
            params: [entry.wallet_address, accountId, accountSizeUnits, phaseNum] })
        );
        const receipt = await waitForReceipt({ client: thirdwebClient, chain, transactionHash: tx.transactionHash });
        if (receipt.status === "reverted") throw new Error("Transaction reverted — check that your wallet is the contract owner");
      }

      // Try to sync the flag — non-fatal, useOnchainRegistrationSync will handle it
      try {
        await base44.entities.ChallengeAccount.update(accountId, { onchain_registered: true });
      } catch {
        console.warn("[whitelist] Could not update onchain_registered flag, sync hook will handle it");
      }

      // Update local state and persist to Whitelist entity
      setEntries((prev) =>
        prev.map((e) => e.id === entry.id ? { ...e, onchain_registered: true } : e)
      );
      try {
        await base44.entities.Whitelist.update(entry.id, { onchain_registered: true });
      } catch { /* non-fatal — local state is already updated */ }
    } catch (err) {
      console.error("Register on-chain failed:", err);
      setRegisterError((prev) => ({ ...prev, [entry.id]: err?.message || "Registration failed" }));
    } finally {
      setRegisteringId(null);
    }
  };

  const handleRemove = async (id) => {
    try {
      await base44.entities.Whitelist.delete(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      console.error("[whitelist] delete error:", err.message);
    }
  };

  const redeemed = entries.filter((e) => e.redeemed).length;
  const pending = entries.filter((e) => !e.redeemed).length;

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex flex-wrap gap-6 items-center">
        <div className="flex items-center gap-2 text-sm">
          <Gift className="w-4 h-4 text-primary" />
          <span className="text-muted-foreground">Total Whitelisted:</span>
          <span className="text-foreground font-semibold">{entries.length}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <UserPlus className="w-4 h-4 text-green-400" />
          <span className="text-muted-foreground">Accounts Created:</span>
          <span className="text-green-400 font-semibold">{redeemed}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Wallet className="w-4 h-4 text-yellow-400" />
          <span className="text-muted-foreground">Pending:</span>
          <span className="text-yellow-400 font-semibold">{pending}</span>
        </div>
      </div>

      {/* Add form */}
      <div className="bg-card border border-border rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-grotesk font-semibold text-foreground flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-primary" /> Grant Free Account
        </h3>
        <p className="text-xs text-muted-foreground">
          Creates a free account at the selected size and phase, registers it on-chain, and the trader can start trading immediately on sign-in.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Wallet className="w-3 h-3" /> Wallet Address <span className="text-red-400">*</span>
            </label>
            <Input
              className="h-9 text-sm bg-secondary border-border font-mono"
              placeholder="0x..."
              value={walletInput}
              onChange={(e) => setWalletInput(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Mail className="w-3 h-3" /> Email (optional)
            </label>
            <Input
              className="h-9 text-sm bg-secondary border-border"
              placeholder="trader@example.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
            />
            <button
              type="button"
              onClick={resolveFromEmail}
              disabled={resolving || !emailInput.trim()}
              className="text-[11px] text-primary hover:underline disabled:opacity-50 inline-flex items-center gap-1"
            >
              {resolving ? <BoltLoader className="w-3 h-3" /> : <Wallet className="w-3 h-3" />}
              {resolving ? "Resolving…" : "Use abstracted wallet from email →"}
            </button>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Note (optional)</label>
            <Input
              className="h-9 text-sm bg-secondary border-border"
              placeholder="e.g. Twitter influencer"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Account size</label>
            <select
              className="h-9 w-full text-sm bg-secondary border border-border rounded-md px-2 text-foreground"
              value={selectedSize}
              onChange={(e) => setSelectedSize(Number(e.target.value))}
            >
              {CHALLENGE_TIERS.map((t) => {
                // Mirror the contract guard: only currently-open tiers (enabled +
                // TVL-unlocked) can be whitelisted; the rest are shown but disabled.
                const open = t.tvlUnlock === 0 || (protocolStats?.tvlUsdc || 0) >= t.tvlUnlock;
                return (
                  <option key={t.size} value={t.size} disabled={!open}>
                    {t.label}{open ? "" : ` — locked (needs $${(t.tvlUnlock / 1000).toFixed(0)}K TVL)`}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Phase</label>
            <select
              className="h-9 w-full text-sm bg-secondary border border-border rounded-md px-2 text-foreground"
              value={selectedPhase}
              onChange={(e) => setSelectedPhase(Number(e.target.value))}
            >
              {PHASE_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>
        {selectedPhase !== 1 && (
          <p className="text-xs text-yellow-400/90">
            Granting at {selectedPhase === 3 ? "Funded" : "Phase 2"} skips the earlier evaluation phase(s) — use for migrations / manual staging, not normal sign-ups.
          </p>
        )}
        {resolveNote && <p className="text-xs text-primary font-mono break-all">{resolveNote}</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
        <Button
          size="sm"
          className="gap-2 bg-primary text-primary-foreground"
          onClick={handleAdd}
          disabled={adding}
        >
          {adding ? <BoltLoader className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
          {addStep === "creating" ? "Creating account..." : addStep === "registering" ? "Sign to register on-chain..." : "Add & Register On-Chain"}
        </Button>
      </div>

      {/* Entries table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm animate-pulse">Loading whitelist...</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No whitelist entries yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="text-left text-xs text-muted-foreground px-4 py-2">Wallet</th>
                  <th className="text-left text-xs text-muted-foreground px-4 py-2">Email</th>
                  <th className="text-left text-xs text-muted-foreground px-4 py-2">Note</th>
                  <th className="text-center text-xs text-muted-foreground px-4 py-2">Tier</th>
                  <th className="text-center text-xs text-muted-foreground px-4 py-2">Account</th>
                  <th className="text-right text-xs text-muted-foreground px-4 py-2">On-Chain</th>
                  <th className="text-right text-xs text-muted-foreground px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-border/50 hover:bg-secondary/20">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {entry.wallet_address
                        ? `${entry.wallet_address.slice(0, 6)}...${entry.wallet_address.slice(-4)}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {entry.email || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">
                      {entry.note || "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                        ${entry.tier_size?.toLocaleString()}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {entry.redeemed_account_id ? (
                        <Badge variant="outline" className="text-xs bg-green-500/10 text-green-400 border-green-500/30">
                          Created
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
                          Pending
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        {entry.onchain_registered ? (
                          <Badge variant="outline" className="text-xs bg-green-500/10 text-green-400 border-green-500/30">
                            Registered
                          </Badge>
                        ) : entry.redeemed_account_id ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-xs border-primary/40 text-primary hover:bg-primary/10 px-2"
                              disabled={registeringId === entry.id}
                              onClick={() => handleRegisterOnChain(entry)}
                            >
                              {registeringId === entry.id ? (
                                <BoltLoader className="w-3 h-3" />
                              ) : (
                                <><Link2 className="w-3 h-3 mr-1" />Register</>
                              )}
                            </Button>
                            {registerError[entry.id] && (
                              <div className="bg-red-500/10 border border-red-500/30 rounded p-1.5 max-w-[200px]">
                                <p className="text-xs text-red-400 break-words">{registerError[entry.id]}</p>
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        onClick={() => handleRemove(entry.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
