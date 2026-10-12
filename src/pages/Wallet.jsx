import SEO from "@/components/SEO";
import BoltLoader from "@/components/brand/BoltLoader";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useChainFundedPool } from "@/hooks/useChainFundedPool";
import useSeasonData from "@/hooks/useSeasonData";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Wallet as WalletIcon,
  ArrowUpRight,
  ArrowDownLeft,
  Copy,
  Check,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { thirdwebClient, chain, explorerTxUrl, wallets, appMetadata } from "@/lib/thirdwebClient";
import TransactionHistory, { recordWalletSend } from "@/components/wallet/TransactionHistory";
import { getContract, readContract, prepareContractCall, waitForReceipt } from "thirdweb";
import { transfer } from "thirdweb/extensions/erc20";
import { useSendTransaction, useConnectModal, useSwitchActiveWalletChain } from "thirdweb/react";
import { createPageUrl } from "@/utils";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const USDC_ADDRESS = import.meta.env.VITE_USDC_ADDRESS;
const POOL_ADDRESS = import.meta.env.VITE_REWARDS_POOL_ADDRESS;
const CFG_TOKEN_ADDRESS = import.meta.env.VITE_CFG_TOKEN_ADDRESS;

// USDC has 6 decimals
const toUSDCUnits = (dollars) => BigInt(Math.round(dollars * 1_000_000));
const fromRaw6 = (raw) => Number(raw) / 1e6;

function TokenCard({ symbol, balance, icon, usdValue, color, subtitle }) {
  return (
    <Card className="border-border">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${color}`}>
              {icon}
            </div>
            <div>
              <p className="font-grotesk font-semibold text-foreground">{symbol}</p>
              <p className="text-xs text-muted-foreground">
                {balance !== null ? Number(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
              </p>
              {subtitle && (
                <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
          {usdValue !== null && usdValue !== undefined && (
            <p className="text-sm font-medium text-foreground">
              ${Number(usdValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Wallet() {
  const { address, isAuthenticated, isLoadingAuth } = useAuth();
  const { connect } = useConnectModal();
  const navigate = useNavigate();
  const { mutateAsync: sendTransaction } = useSendTransaction();
  const switchChain = useSwitchActiveWalletChain();
  const poolData = useChainFundedPool(address);
  const seasonData = useSeasonData(address);

  const [usdcBalance, setUsdcBalance] = useState(null);
  const [cfgBalance, setCfgBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Transfer state
  const [transferToken, setTransferToken] = useState(null); // "USDC" | "CFND" | "CFG" | null
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [transferTxHash, setTransferTxHash] = useState("");

  // Fetch USDC and CFG balances
  const fetchBalances = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const promises = [];

      // USDC balance
      if (USDC_ADDRESS) {
        const usdcContract = getContract({ client: thirdwebClient, chain, address: USDC_ADDRESS });
        promises.push(
          readContract({
            contract: usdcContract,
            method: "function balanceOf(address account) view returns (uint256)",
            params: [address],
          }).then((raw) => setUsdcBalance(fromRaw6(raw)))
            .catch(() => setUsdcBalance(null))
        );
      }

      // CFG token balance — use env var directly, fall back to pool contract
      const cfgAddr = CFG_TOKEN_ADDRESS || null;
      if (cfgAddr) {
        const cfgContract = getContract({ client: thirdwebClient, chain, address: cfgAddr });
        promises.push(
          readContract({
            contract: cfgContract,
            method: "function balanceOf(address account) view returns (uint256)",
            params: [address],
          }).then((raw) => setCfgBalance(Number(raw) / 1e18))
            .catch(() => setCfgBalance(null))
        );
      } else if (POOL_ADDRESS) {
        promises.push(
          (async () => {
            try {
              const pool = getContract({ client: thirdwebClient, chain, address: POOL_ADDRESS });
              const poolCfgAddr = await readContract({
                contract: pool,
                method: "function cfgTokenAddress() view returns (address)",
              }).catch(() => null);
              if (poolCfgAddr && poolCfgAddr !== "0x0000000000000000000000000000000000000000") {
                const cfgContract = getContract({ client: thirdwebClient, chain, address: poolCfgAddr });
                const raw = await readContract({
                  contract: cfgContract,
                  method: "function balanceOf(address account) view returns (uint256)",
                  params: [address],
                });
                setCfgBalance(Number(raw) / 1e18);
              } else {
                setCfgBalance(0);
              }
            } catch {
              setCfgBalance(null);
            }
          })()
        );
      }

      await Promise.all(promises);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchBalances();
    const interval = setInterval(fetchBalances, 15000);
    return () => clearInterval(interval);
  }, [fetchBalances]);

  // Copy address to clipboard
  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Handle ERC-20 transfer
  const handleTransfer = async () => {
    if (!transferTo || !transferAmount || !transferToken) return;
    setTransferError("");
    setTransferTxHash("");
    setTransferring(true);

    try {
      // Validate address
      if (!/^0x[a-fA-F0-9]{40}$/.test(transferTo)) {
        throw new Error("Invalid Ethereum address");
      }

      const amount = parseFloat(transferAmount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error("Invalid amount");
      }

      // Ensure mobile wallets are on the correct chain before sending
      await switchChain(chain);

      let contractAddress;
      let amountRaw;

      if (transferToken === "USDC") {
        contractAddress = USDC_ADDRESS;
        amountRaw = toUSDCUnits(amount);
      } else if (transferToken === "CFND") {
        // Get CFND address from pool
        const pool = getContract({ client: thirdwebClient, chain, address: POOL_ADDRESS });
        contractAddress = await readContract({
          contract: pool,
          method: "function cfndTokenAddress() view returns (address)",
        });
        amountRaw = toUSDCUnits(amount); // CFND also uses 6 decimals
      } else if (transferToken === "CFG") {
        contractAddress = CFG_TOKEN_ADDRESS;
        if (!contractAddress) {
          // Fallback: try reading from pool contract
          const pool = getContract({ client: thirdwebClient, chain, address: POOL_ADDRESS });
          contractAddress = await readContract({
            contract: pool,
            method: "function cfgTokenAddress() view returns (address)",
          }).catch(() => null);
        }
        if (!contractAddress) throw new Error("CFG token not available");
        amountRaw = BigInt(Math.round(amount * 1e18)); // 18 decimals
      }

      if (!contractAddress) throw new Error("Token contract not configured");

      const tokenContract = getContract({ client: thirdwebClient, chain, address: contractAddress });
      const tx = transfer({ contract: tokenContract, to: transferTo, amount });
      const result = await sendTransaction(tx);
      const receipt = await waitForReceipt({ client: thirdwebClient, chain, transactionHash: result.transactionHash });

      setTransferTxHash(receipt.transactionHash);
      recordWalletSend({ token: transferToken, amount, to: transferTo, txHash: receipt.transactionHash, address });
      toast.success(`${transferToken} sent successfully`, {
        description: `${amount} ${transferToken} to ${transferTo.slice(0, 6)}…${transferTo.slice(-4)}`,
      });
      setTransferToken(null);
      setTransferTo("");
      setTransferAmount("");
      fetchBalances();
    } catch (err) {
      toast.error("Transfer failed", { description: err?.message?.slice(0, 100) });
      setTransferError(err?.message || "Transfer failed");
    } finally {
      setTransferring(false);
    }
  };

  // Not authenticated
  if (!isAuthenticated && !isLoadingAuth) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <WalletIcon className="w-12 h-12 text-muted-foreground/40" />
        <h2 className="text-xl font-grotesk font-bold text-foreground">Connect Your Wallet</h2>
        <p className="text-muted-foreground text-sm">Sign in to view your wallet balances and transfer assets.</p>
        <Button
          onClick={() => connect({ client: thirdwebClient, chain, wallets, appMetadata })}
          className="bg-primary text-primary-foreground gap-2"
        >
          <WalletIcon className="w-4 h-4" /> Sign In
        </Button>
      </div>
    );
  }

  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <SEO title="Wallet" noindex />

      {/* Header */}
      <div>
        <h1 className="text-2xl font-grotesk font-bold text-foreground">Wallet</h1>
        <p className="text-muted-foreground text-sm mt-1">View balances and transfer assets</p>
      </div>

      {/* Connected wallet address */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <WalletIcon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Connected Wallet</p>
                <p className="font-mono text-sm text-foreground">{shortAddress}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" onClick={handleCopy} className="h-8 w-8">
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
              <a
                href={`${chain.blockExplorers?.[0]?.url || "https://etherscan.io"}/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Token balances */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Token Balances</h2>
        {loading && !usdcBalance && !poolData.userCfndBalance ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <BoltLoader className="w-5 h-5 mr-2" /> Loading balances...
          </div>
        ) : (
          <div className="space-y-3">
            <TokenCard
              symbol="USDC"
              balance={usdcBalance}
              icon="$"
              usdValue={usdcBalance}
              color="bg-blue-500/20 text-blue-400"
            />
            <TokenCard
              symbol="CFND"
              balance={
                poolData.userCfndBalance != null && seasonData.userStaked != null
                  ? poolData.userCfndBalance + Number(seasonData.userStaked) / 1e6
                  : poolData.userCfndBalance
              }
              icon="CF"
              usdValue={
                poolData.userPositionUsdc != null && seasonData.userStaked != null && poolData.cfndPriceUsdc != null
                  ? poolData.userPositionUsdc + (Number(seasonData.userStaked) / 1e6) * poolData.cfndPriceUsdc
                  : poolData.userPositionUsdc
              }
              color="bg-emerald-500/20 text-emerald-400"
              subtitle={
                seasonData.userStaked && seasonData.userStaked > 0n
                  ? `${poolData.userCfndBalance?.toFixed(2) ?? "0"} in wallet · ${(Number(seasonData.userStaked) / 1e6).toFixed(2)} staked`
                  : null
              }
            />
            <TokenCard
              symbol="CFG"
              balance={cfgBalance}
              icon="G"
              usdValue={null}
              color="bg-purple-500/20 text-purple-400"
            />
          </div>
        )}
      </div>

      {/* Transfer section */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Transfer</h2>
        {!transferToken ? (
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="flex flex-col gap-1 h-auto py-4"
              onClick={() => setTransferToken("USDC")}
            >
              <ArrowUpRight className="w-4 h-4 text-blue-400" />
              <span className="text-xs">Send USDC</span>
            </Button>
            <Button
              variant="outline"
              className="flex flex-col gap-1 h-auto py-4"
              onClick={() => setTransferToken("CFG")}
            >
              <ArrowUpRight className="w-4 h-4 text-purple-400" />
              <span className="text-xs">Send CFG</span>
            </Button>
          </div>
        ) : (
          <Card className="border-border">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-grotesk font-semibold text-foreground">
                  Send {transferToken}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTransferToken(null);
                    setTransferTo("");
                    setTransferAmount("");
                    setTransferError("");
                    setTransferTxHash("");
                  }}
                  className="text-xs text-muted-foreground"
                >
                  Cancel
                </Button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Recipient Address</label>
                  <Input
                    placeholder="0x..."
                    value={transferTo}
                    onChange={(e) => setTransferTo(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Amount</label>
                  <div className="relative">
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      className="pr-16"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      {transferToken}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Available: {
                      transferToken === "USDC" ? (usdcBalance?.toFixed(2) ?? "—") :
                      transferToken === "CFND" ? (poolData.userCfndBalance?.toFixed(2) ?? "—") :
                      transferToken === "CFG" ? (cfgBalance?.toFixed(4) ?? "—") : "—"
                    } {transferToken}
                  </p>
                </div>
              </div>

              {transferError && (
                <div className="flex items-center gap-2 text-sm text-red-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {transferError}
                </div>
              )}

              {transferTxHash && (
                <div className="text-sm text-green-400">
                  Transfer successful!{" "}
                  <a
                    href={explorerTxUrl(transferTxHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    View on Etherscan
                  </a>
                </div>
              )}

              <Button
                onClick={handleTransfer}
                disabled={transferring || !transferTo || !transferAmount}
                className="w-full bg-primary text-primary-foreground"
              >
                {transferring ? (
                  <><BoltLoader className="w-4 h-4 mr-2" /> Sending...</>
                ) : (
                  <><ArrowUpRight className="w-4 h-4 mr-2" /> Send {transferToken}</>
                )}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Receive section */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Receive</h2>
        <Card className="border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <ArrowDownLeft className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground font-medium">Your Wallet Address</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Send USDC or CFG to this address on the {chain.name || "Ethereum"} network.
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 bg-secondary/50 rounded px-3 py-2 text-xs font-mono text-foreground break-all">
                {address}
              </code>
              <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0 gap-1.5">
                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transaction history */}
      <TransactionHistory address={address} />

      {/* Disclaimer */}
      <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-4 flex gap-3 text-xs text-muted-foreground">
        <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
        <div>
          <p>
            <span className="text-foreground font-medium">Important:</span> Only send tokens on the{" "}
            <span className="text-foreground">{chain.name || "Ethereum"}</span> network. Tokens sent on other networks will be lost permanently.
          </p>
        </div>
      </div>
    </div>
  );
}
