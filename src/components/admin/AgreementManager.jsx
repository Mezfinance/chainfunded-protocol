import { useState, useEffect, useCallback } from "react";
import { getContract, readContract } from "thirdweb";
import { ethers } from "ethers";
import { thirdwebClient, chain } from "@/lib/thirdwebClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatUtcDateTime } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FileText, Copy, CheckCircle2, AlertCircle, RefreshCw,
  ExternalLink, Plus, ChevronDown, ChevronUp, Download,
} from "lucide-react";
import { renderBundle, buildSignedDocument } from "@/lib/agreementUtils";
import { createPageUrl } from "@/utils";

const ROUTER_ADDRESS  = import.meta.env.VITE_REVENUE_ROUTER_ADDRESS;
const APP_ORIGIN      = typeof window !== "undefined" ? window.location.origin : "";
const ROUTER_CHAIN_ID = import.meta.env.VITE_ROUTER_CHAIN_ID || "1";
const ETHERSCAN_BASE  = ROUTER_CHAIN_ID === "1"
  ? "https://etherscan.io"
  : `https://${ROUTER_CHAIN_ID === "11155111" ? "sepolia." : ""}etherscan.io`;

const ROUTER_ABI = [
  "function revenueShares(address) view returns (uint256 rateBps, string agreementRef, bool active)",
  "function getRecipients() view returns (address[])",
  "function pendingBalance() view returns (uint256)",
  "function setRevenueShare(address recipient, uint256 rateBps, string agreementRef)",
  "function deactivateRevenueShare(address recipient)",
  "function distribute(address recipient, uint256 amount)",
  "function sweepToTreasury()",
];

function bpsToPercent(bps) {
  return (Number(bps) / 100).toFixed(2);
}

function usdc(raw) {
  return "$" + (Number(raw) / 1e6).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function encodeSafeCalldata(method, params) {
  try {
    const iface = new ethers.Interface(ROUTER_ABI);
    return iface.encodeFunctionData(method, params);
  } catch {
    return "";
  }
}

function CopyButton({ text, label = "Copy" }) {
  const [done, setDone] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {done ? <CheckCircle2 className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      {done ? "Copied" : label}
    </button>
  );
}

function SafeTxPanel({ title, calldata }) {
  const [open, setOpen] = useState(false);
  if (!calldata) return null;
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted/30"
      >
        {title}
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && (
        <div className="p-3 space-y-2 bg-card">
          <p className="text-xs text-muted-foreground">Submit via <a href="https://app.safe.global" target="_blank" rel="noopener noreferrer" className="text-primary underline">app.safe.global</a> → New Transaction → Transaction Builder</p>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">To:</p>
              <CopyButton text={ROUTER_ADDRESS} label="Copy address" />
            </div>
            <pre className="font-mono text-xs text-foreground bg-muted/20 rounded p-2 break-all whitespace-pre-wrap">{ROUTER_ADDRESS}</pre>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Calldata:</p>
              <CopyButton text={calldata} label="Copy calldata" />
            </div>
            <pre className="font-mono text-xs text-foreground bg-muted/20 rounded p-2 break-all whitespace-pre-wrap">{calldata}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

function AgreementRow({ recipient, share, onRefresh }) {
  const safeTxKey = `agreement_safe_tx_${share.agreementRef}_${recipient.toLowerCase()}`;
  const sigKey    = `agreement_sig_${share.agreementRef}_${recipient.toLowerCase()}`;
  const partyKey  = `agreement_party_${recipient.toLowerCase()}`;

  const sigData   = (() => { try { return JSON.parse(localStorage.getItem(sigKey));    } catch { return null; } })();
  const [safeTxData, setSafeTxData] = useState(() => {
    try { return JSON.parse(localStorage.getItem(safeTxKey)); } catch { return null; }
  });

  const [partyData, setPartyData] = useState(() => {
    try { return JSON.parse(localStorage.getItem(partyKey)) || { name: "", physaddr: "" }; }
    catch { return { name: "", physaddr: "" }; }
  });
  const [editingParty,  setEditingParty]  = useState(!partyData.name);
  const [draftName,     setDraftName]     = useState(partyData.name     || "");
  const [draftAddr,     setDraftAddr]     = useState(partyData.physaddr  || "");
  const [draftTxHash,   setDraftTxHash]   = useState(safeTxData?.txHash || "");
  const [editingTx,     setEditingTx]     = useState(!safeTxData);

  const saveParty = () => {
    const updated = { name: draftName.trim(), physaddr: draftAddr.trim() };
    localStorage.setItem(partyKey, JSON.stringify(updated));
    setPartyData(updated);
    setEditingParty(false);
  };

  const saveTxHash = () => {
    const hash = draftTxHash.trim();
    if (!hash) return;
    const data = { txHash: hash, routerAddress: ROUTER_ADDRESS, chainId: ROUTER_CHAIN_ID };
    localStorage.setItem(safeTxKey, JSON.stringify(data));
    setSafeTxData(data);
    setEditingTx(false);
  };

  const renderedMarkdown = (() => {
    const docs = renderBundle({
      affiliate:     recipient,
      affiliateName: partyData.name,
      affiliateAddr: partyData.physaddr,
      rateBps:       share.rateBps.toString(),
      agreementRef:  share.agreementRef,
    });
    return docs.map(d => d.rendered).join("\n\n---\n\n");
  })();

  const downloadSigned = () => {
    const content  = buildSignedDocument(renderedMarkdown, { safeTx: safeTxData, affiliateSig: sigData });
    const filename = `${share.agreementRef}-fully-signed-${recipient.slice(0, 8)}.md`;
    const blob     = new Blob([content], { type: "text/markdown" });
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const signingLink = (() => {
    const base   = `${APP_ORIGIN}${createPageUrl("AgreementSign")}?doc=${share.agreementRef}&affiliate=${recipient}`;
    const params = new URLSearchParams();
    if (partyData.name)     params.set("name",     partyData.name);
    if (partyData.physaddr) params.set("physaddr",  partyData.physaddr);
    const qs = params.toString();
    return qs ? `${base}&${qs}` : base;
  })();

  const setCalldataActivate   = encodeSafeCalldata("setRevenueShare",       [recipient, share.rateBps, share.agreementRef]);
  const setCalldataDeactivate = encodeSafeCalldata("deactivateRevenueShare", [recipient]);

  return (
    <Card className="border-border">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{share.agreementRef}</p>
              {share.active
                ? <Badge className="bg-green-500/15 text-green-400 border-green-500/20 text-xs">Active</Badge>
                : <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>
              }
              {sigData && <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/20 text-xs">Affiliate signed</Badge>}
            </div>
            <p className="font-mono text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{recipient}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-lg font-bold text-foreground">{bpsToPercent(share.rateBps)}%</p>
            <p className="text-xs text-muted-foreground">{share.rateBps.toString()} BPS</p>
          </div>
        </div>

        {/* Party details */}
        {editingParty ? (
          <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/10">
            <p className="text-xs font-medium text-muted-foreground">Affiliate details (stored locally, not on-chain)</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-muted-foreground">Full legal name</Label>
                <Input value={draftName} onChange={e => setDraftName(e.target.value)} placeholder="e.g. Jane Smith" className="mt-1 h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Physical address</Label>
                <Input value={draftAddr} onChange={e => setDraftAddr(e.target.value)} placeholder="Street, City, Country" className="mt-1 h-8 text-xs" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="text-xs h-7" onClick={saveParty} disabled={!draftName.trim()}>Save</Button>
              {partyData.name && <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setEditingParty(false)}>Cancel</Button>}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs">
            <div>
              <span className="text-foreground font-medium">{partyData.name}</span>
              {partyData.physaddr && <span className="text-muted-foreground ml-2">{partyData.physaddr}</span>}
            </div>
            <button onClick={() => setEditingParty(true)} className="text-muted-foreground hover:text-foreground underline underline-offset-2">Edit</button>
          </div>
        )}

        {/* Signing link */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Affiliate signing link</p>
          <div className="flex items-center gap-2">
            <p className="font-mono text-xs text-foreground truncate flex-1 bg-muted/20 rounded px-2 py-1">{signingLink}</p>
            <CopyButton text={signingLink} label="Copy" />
          </div>
        </div>

        {/* Affiliate signature record */}
        {sigData && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-blue-400">Affiliate signature on record</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">Signer</p>
                <p className="font-mono text-foreground truncate">{sigData.signer}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Signed at</p>
                <p className="text-foreground">{sigData.ts ? formatUtcDateTime(sigData.ts, { year: true }) : "—"}</p>
              </div>
            </div>
            <CopyButton text={sigData.signature} label="Copy signature" />
          </div>
        )}

        {/* Safe tx proof */}
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-muted/30 flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">MZF-Protocol Inc. — Safe transaction</p>
            {safeTxData && !editingTx && <Badge className="bg-green-500/15 text-green-400 border-green-500/20 text-xs">Recorded</Badge>}
          </div>
          <div className="p-3 space-y-2">
            {editingTx ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Paste the transaction hash from the Safe execution of <span className="font-mono">setRevenueShare()</span></p>
                <Input
                  value={draftTxHash}
                  onChange={e => setDraftTxHash(e.target.value)}
                  placeholder="0x..."
                  className="h-8 text-xs font-mono"
                />
                <div className="flex gap-2">
                  <Button size="sm" className="text-xs h-7" onClick={saveTxHash} disabled={!draftTxHash.trim()}>Save</Button>
                  {safeTxData && <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setEditingTx(false)}>Cancel</Button>}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="font-mono text-xs text-foreground break-all">{safeTxData?.txHash}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={downloadSigned}>
                    <Download className="w-3 h-3" /> Download fully signed
                  </Button>
                  <button onClick={() => setEditingTx(true)} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">Edit</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Safe tx panels */}
        <div className="space-y-2">
          {!share.active && (
            <SafeTxPanel title="Safe tx — Activate revenue share (setRevenueShare)" calldata={setCalldataActivate} />
          )}
          {share.active && (
            <SafeTxPanel title="Safe tx — Deactivate revenue share" calldata={setCalldataDeactivate} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function NewAgreementForm({ onCreated }) {
  const [affiliate, setAffiliate] = useState("");
  const [rateBps,   setRateBps]   = useState("500");
  const [ref,       setRef]       = useState("");
  const [name,      setName]      = useState("");
  const [physaddr,  setPhysaddr]  = useState("");
  const [calldata,  setCalldata]  = useState("");

  const generate = () => {
    if (!affiliate || !rateBps || !ref) return;
    const cd = encodeSafeCalldata("setRevenueShare", [affiliate, Number(rateBps), ref]);
    setCalldata(cd);
    if (name || physaddr) {
      localStorage.setItem(
        `agreement_party_${affiliate.toLowerCase()}`,
        JSON.stringify({ name, physaddr })
      );
    }
  };

  return (
    <Card className="border-border border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Revenue Share Agreement
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <Label className="text-xs text-muted-foreground">Agreement Ref</Label>
            <Input
              value={ref}
              onChange={e => setRef(e.target.value)}
              placeholder="e.g. C8"
              className="mt-1 h-8 text-xs"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Affiliate Wallet Address</Label>
            <Input
              value={affiliate}
              onChange={e => setAffiliate(e.target.value)}
              placeholder="0x..."
              className="mt-1 h-8 text-xs font-mono"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Rate (BPS)</Label>
            <Input
              type="number"
              value={rateBps}
              onChange={e => setRateBps(e.target.value)}
              placeholder="500"
              className="mt-1 h-8 text-xs"
            />
            <p className="text-xs text-muted-foreground mt-0.5">{bpsToPercent(rateBps || 0)}%</p>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Affiliate Full Legal Name</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Jane Smith"
              className="mt-1 h-8 text-xs"
            />
          </div>
          <div className="sm:col-span-3">
            <Label className="text-xs text-muted-foreground">Affiliate Physical Address</Label>
            <Input
              value={physaddr}
              onChange={e => setPhysaddr(e.target.value)}
              placeholder="Street, City, Country"
              className="mt-1 h-8 text-xs"
            />
          </div>
        </div>

        <Button onClick={generate} size="sm" variant="outline" className="gap-2 text-xs" disabled={!affiliate || !rateBps || !ref}>
          Generate Safe tx calldata
        </Button>

        {calldata && (
          <SafeTxPanel title="Safe tx — setRevenueShare (submit this to activate)" calldata={calldata} />
        )}

        {calldata && (
          <div className="text-xs text-muted-foreground bg-muted/20 rounded p-3 space-y-2">
            <p className="font-medium text-foreground">After submitting the Safe tx:</p>
            <p>1. Share the signing link with the affiliate:</p>
            <div className="flex items-center gap-2 pl-2">
              <p className="font-mono break-all flex-1">
                {APP_ORIGIN}{createPageUrl("AgreementSign")}?doc={ref}&affiliate={affiliate}{name ? `&name=${encodeURIComponent(name)}` : ""}{physaddr ? `&physaddr=${encodeURIComponent(physaddr)}` : ""}
              </p>
              <CopyButton
                text={`${APP_ORIGIN}${createPageUrl("AgreementSign")}?doc=${ref}&affiliate=${affiliate}${name ? `&name=${encodeURIComponent(name)}` : ""}${physaddr ? `&physaddr=${encodeURIComponent(physaddr)}` : ""}`}
                label="Copy"
              />
            </div>
            <p>2. The affiliate downloads the signed document from the signing page.</p>
            <p>3. Commit it to <span className="font-mono">docs/legal-agreements/signed/{ref}-signed-[wallet].md</span>.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AgreementManager() {
  const [recipients,  setRecipients]  = useState([]);
  const [shares,      setShares]      = useState({});
  const [balance,     setBalance]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [showNew,     setShowNew]     = useState(false);

  const load = useCallback(async () => {
    if (!ROUTER_ADDRESS) {
      setError("VITE_REVENUE_ROUTER_ADDRESS not set.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const contract = getContract({ client: thirdwebClient, chain, address: ROUTER_ADDRESS });

      const [addrs, bal] = await Promise.all([
        readContract({ contract, method: "function getRecipients() view returns (address[])", params: [] }),
        readContract({ contract, method: "function pendingBalance() view returns (uint256)",   params: [] }),
      ]);

      setBalance(bal);

      const entries = await Promise.all(
        addrs.map(addr =>
          readContract({
            contract,
            method: "function revenueShares(address) view returns (uint256 rateBps, string agreementRef, bool active)",
            params: [addr],
          }).then(r => [addr, { rateBps: r[0], agreementRef: r[1], active: r[2] }])
        )
      );
      setShares(Object.fromEntries(entries));
      setRecipients(addrs);
    } catch (e) {
      setError("Failed to load from contract: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sweepCalldata     = encodeSafeCalldata("sweepToTreasury", []);
  const activeCount       = Object.values(shares).filter(s => s.active).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-grotesk font-semibold text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" /> Revenue Share Agreements
          </h2>
          {ROUTER_ADDRESS && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-xs text-muted-foreground font-mono">{ROUTER_ADDRESS}</p>
              <a href={`${ETHERSCAN_BASE}/address/${ROUTER_ADDRESS}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-foreground" />
              </a>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs border-border" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" className="gap-1.5 text-xs" onClick={() => setShowNew(v => !v)}>
            <Plus className="w-3 h-3" /> New
          </Button>
        </div>
      </div>

      {/* Router balance bar */}
      {balance !== null && (
        <div className="bg-card border border-border rounded-lg px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Pending router balance</p>
            <p className="text-lg font-bold text-foreground">{usdc(balance)} USDC</p>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground">{activeCount} active agreement{activeCount !== 1 ? "s" : ""}</p>
            {balance > 0n && (
              <SafeTxPanel title="Safe tx — sweepToTreasury" calldata={sweepCalldata} />
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-start gap-2 text-xs text-destructive">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {showNew && <NewAgreementForm onCreated={() => { setShowNew(false); load(); }} />}

      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm animate-pulse">Loading agreements…</div>
      ) : recipients.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No agreements registered yet. Use the New button to create one.
        </div>
      ) : (
        <div className="space-y-3">
          {recipients.map(addr => (
            shares[addr] && (
              <AgreementRow key={addr} recipient={addr} share={shares[addr]} onRefresh={load} />
            )
          ))}
        </div>
      )}
    </div>
  );
}
