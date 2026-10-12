import SEO from "@/components/SEO";
import BoltLoader from "@/components/brand/BoltLoader";
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useActiveAccount, useConnectModal } from "thirdweb/react";
import { getContract, readContract } from "thirdweb";
import { thirdwebClient, chain, wallets, appMetadata } from "@/lib/thirdwebClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, FileText, Lock, Copy, AlertCircle, ExternalLink, Download } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AGREEMENT_TEMPLATES,
  bpsToPercent,
  renderBundle,
  buildAffiliateSigningMessage,
  buildSignedDocument } from "@/lib/agreementUtils";

const ROUTER_ADDRESS   = import.meta.env.VITE_REVENUE_ROUTER_ADDRESS;
const CHAIN_ID         = import.meta.env.VITE_CHAIN_ID        || "11155111";
const ROUTER_CHAIN_ID  = import.meta.env.VITE_ROUTER_CHAIN_ID || "1";

const ETHERSCAN_BASE = ROUTER_CHAIN_ID === "1"
  ? "https://etherscan.io"
  : `https://${ROUTER_CHAIN_ID === "11155111" ? "sepolia." : ""}etherscan.io`;

const ROUTER_ABI = [
  "function revenueShares(address) view returns (uint256 rateBps, string agreementRef, bool active)",
];

function SigDisplay({ message, signature, signer, ts, renderedMarkdown, agreementRef }) {
  const [copied, setCopied] = useState(false);
  const copy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const download = () => {
    const combined = Array.isArray(renderedMarkdown)
      ? renderedMarkdown.map(d => d.rendered).join("\n\n---\n\n")
      : renderedMarkdown;
    const content  = buildSignedDocument(combined, { affiliateSig: { message, signature, signer, ts } });
    const filename = `${agreementRef}-signed-${signer.slice(0, 8)}.md`;
    const blob     = new Blob([content], { type: "text/markdown" });
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-green-300">Agreement signed successfully</p>
          <p className="text-xs text-muted-foreground mt-1">
            Download the signed document below and send it to MZF Protocol Inc. for the agreement record.
          </p>
        </div>
      </div>

      {renderedMarkdown && (
        <Button onClick={download} variant="outline" className="w-full gap-2">
          <Download className="w-4 h-4" /> Download signed agreement (.md)
        </Button>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Signing message</p>
        <div className="relative">
          <pre className="bg-card border border-border rounded-lg p-3 text-xs text-foreground whitespace-pre-wrap break-all font-mono">
            {message}
          </pre>
          <button
            onClick={() => copy(message)}
            className="absolute top-2 right-2 p-1.5 rounded bg-background/80 hover:bg-background border border-border"
          >
            <Copy className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Signature</p>
        <div className="relative">
          <pre className="bg-card border border-border rounded-lg p-3 text-xs text-foreground whitespace-pre-wrap break-all font-mono">
            {signature}
          </pre>
          <button
            onClick={() => copy(signature)}
            className="absolute top-2 right-2 p-1.5 rounded bg-background/80 hover:bg-background border border-border"
          >
            <Copy className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>
        {copied && <p className="text-xs text-green-400">Copied!</p>}
      </div>
    </div>
  );
}

function substituteTemplate(text, vars) {
  return Object.entries(vars).reduce(
    (str, [key, val]) => str.replaceAll(`{{${key}}}`, val ?? ""),
    text
  );
}

export default function AgreementSign() {
  const [searchParams]               = useSearchParams();
  const doc                          = searchParams.get("doc")       || "";
  const affiliate                    = searchParams.get("affiliate") || "";
  const affiliateName                = searchParams.get("name")      || "";
  const affiliateAddr                = searchParams.get("physaddr")  || "";

  const account                      = useActiveAccount();
  const { connect }                  = useConnectModal();

  const [share,     setShare]        = useState(null);   // { rateBps, agreementRef, active }
  const [loading,   setLoading]      = useState(true);
  const [error,     setError]        = useState("");
  const [signing,   setSigning]      = useState(false);
  const [sigResult, setSigResult]    = useState(null);   // { message, signature }
  const [docs,      setDocs]         = useState([]);  // [{ label, rendered }]
  const [mdLoading, setMdLoading]    = useState(true);

  // Load the live revenue share from the router contract
  useEffect(() => {
    if (!ROUTER_ADDRESS || !affiliate) {
      setError(!ROUTER_ADDRESS ? "Router contract not configured." : "No affiliate address in URL.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const contract = getContract({
          client:  thirdwebClient,
          chain,
          address: ROUTER_ADDRESS,
          abi:     ROUTER_ABI });
        const result = await readContract({
          contract,
          method: "function revenueShares(address) view returns (uint256 rateBps, string agreementRef, bool active)",
          params: [affiliate] });
        setShare({ rateBps: result[0], agreementRef: result[1], active: result[2] });
      } catch (e) {
        setError("Could not read agreement terms from contract: " + e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [affiliate]);

  // Render all documents in the bundle once we have the agreementRef and share data
  useEffect(() => {
    const ref    = share?.agreementRef || doc;
    const bundle = renderBundle({
      affiliate,
      affiliateName,
      affiliateAddr,
      rateBps:      share ? share.rateBps.toString() : "0",
      agreementRef: ref });
    setDocs(bundle);
    setMdLoading(false);
  }, [share, doc, affiliateName, affiliateAddr, affiliate]);

  const handleConnect = () => {
    connect({ client: thirdwebClient, wallets, appMetadata });
  };

  const handleSign = async () => {
    if (!account) return;
    setSigning(true);
    try {
      const message = buildAffiliateSigningMessage({
        affiliate,
        rateBps:       share.rateBps.toString(),
        agreementRef:  share.agreementRef || doc,
        routerAddress: ROUTER_ADDRESS,
        chainId:       CHAIN_ID });
      const signature = await account.signMessage({ message });

      const ts  = new Date().toISOString();
      const key = `agreement_sig_${doc}_${affiliate.toLowerCase()}`;
      localStorage.setItem(key, JSON.stringify({ message, signature, signer: account.address, ts }));

      setSigResult({ message, signature, signer: account.address, ts });
    } catch (e) {
      setError("Signing failed: " + (e.message || "unknown error"));
    } finally {
      setSigning(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!doc || !affiliate) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-3">
        <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
        <p className="text-foreground font-semibold">Invalid signing link</p>
        <p className="text-sm text-muted-foreground">This link is missing required parameters. Contact MZF Protocol Inc. for a valid link.</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto py-10 px-4 space-y-6">
      <SEO title={`Sign Agreement ${doc}`} noindex />

      <div className="text-center space-y-1">
        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-3">
          <FileText className="w-6 h-6 text-primary" />
        </div>
        <h1 className="text-xl font-grotesk font-bold text-foreground">Sign Agreement {doc}</h1>
        <p className="text-sm text-muted-foreground">ChainFunded Revenue Share Agreement — MZF Protocol Inc.</p>
      </div>

      {/* Agreement terms */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground">Agreement Terms</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <BoltLoader className="w-4 h-4" /> Loading from contract…
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 text-destructive text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Reference</p>
                  <p className="font-semibold text-foreground">{share.agreementRef || doc}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Status</p>
                  {share.active
                    ? <Badge className="bg-green-500/15 text-green-400 border-green-500/20 text-xs">Active</Badge>
                    : <Badge variant="destructive" className="text-xs">Not activated</Badge>
                  }
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Revenue Share Rate</p>
                  <p className="font-semibold text-foreground">{bpsToPercent(share.rateBps)}% <span className="text-muted-foreground font-normal">({share.rateBps.toString()} BPS)</span></p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Affiliate Wallet</p>
                  <p className="font-mono text-xs text-foreground truncate">{affiliate}</p>
                </div>
              </div>

              <div className="pt-1 border-t border-border">
                <p className="text-xs text-muted-foreground mb-1">Router contract (rate source of truth)</p>
                <div className="flex items-center gap-1.5">
                  <p className="font-mono text-xs text-foreground truncate">{ROUTER_ADDRESS}</p>
                  <a
                    href={`${ETHERSCAN_BASE}/address/${ROUTER_ADDRESS}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0"
                  >
                    <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                  </a>
                </div>
              </div>

              {!share.active && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 flex items-start gap-2 text-xs text-yellow-400">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  The revenue share has not been activated on-chain yet. MZF must call setRevenueShare() via their Safe before you sign.
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Document bodies — one card per document in the bundle */}
      {!loading && !error && (
        mdLoading ? (
          <Card className="border-border">
            <CardContent className="py-6">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <BoltLoader className="w-4 h-4" /> Loading documents…
              </div>
            </CardContent>
          </Card>
        ) : docs.length > 0 ? docs.map(({ label, rendered }) => (
          <Card key={label} className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm prose-invert max-w-none max-h-[480px] overflow-y-auto pr-2
                              [&>h1]:text-base [&>h1]:font-bold [&>h1]:text-foreground [&>h1]:mt-4 [&>h1]:mb-2
                              [&>h2]:text-sm [&>h2]:font-semibold [&>h2]:text-foreground [&>h2]:mt-4 [&>h2]:mb-2
                              [&>h3]:text-xs [&>h3]:font-semibold [&>h3]:text-foreground [&>h3]:mt-3 [&>h3]:mb-1
                              [&>p]:text-xs [&>p]:text-muted-foreground [&>p]:leading-relaxed [&>p]:mb-2
                              [&>ul]:text-xs [&>ul]:text-muted-foreground [&>ul]:pl-4 [&>ul]:mb-2
                              [&>ol]:text-xs [&>ol]:text-muted-foreground [&>ol]:pl-4 [&>ol]:mb-2
                              [&>table]:text-xs [&>table]:w-full [&>table]:mb-2
                              [&>table>thead>tr>th]:text-foreground [&>table>thead>tr>th]:text-left [&>table>thead>tr>th]:pb-1
                              [&>table>tbody>tr>td]:text-muted-foreground [&>table>tbody>tr>td]:py-1
                              [&>hr]:border-border [&>hr]:my-3">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{rendered}</ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        )) : null
      )}

      {/* Signing section */}
      {!loading && !error && share?.active && (
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground">Sign</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {sigResult ? (
              <SigDisplay
                message={sigResult.message}
                signature={sigResult.signature}
                signer={sigResult.signer}
                ts={sigResult.ts}
                renderedMarkdown={docs}
                agreementRef={share?.agreementRef || doc}
              />
            ) : !account ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Connect the wallet <span className="font-mono text-xs text-foreground">{affiliate}</span> to sign this agreement.
                </p>
                <Button onClick={handleConnect} className="w-full gap-2">
                  <Lock className="w-4 h-4" /> Connect Wallet
                </Button>
              </div>
            ) : account.address.toLowerCase() !== affiliate.toLowerCase() ? (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-start gap-2 text-xs text-destructive">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                Wrong wallet connected. This agreement must be signed by <span className="font-mono ml-1">{affiliate}</span>. Please switch wallets and reconnect.
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Connected as <span className="font-mono text-xs text-foreground">{account.address}</span>. By signing you confirm you have read and agree to the terms of Agreement {doc}.
                </p>
                <Button
                  onClick={handleSign}
                  disabled={signing}
                  className="w-full gap-2"
                >
                  {signing ? <><BoltLoader className="w-4 h-4" /> Signing…</> : <><CheckCircle2 className="w-4 h-4" /> Sign Agreement {doc}</>}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
