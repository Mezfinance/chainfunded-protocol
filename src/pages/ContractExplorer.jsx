/**
 * ContractExplorer — read the deployed ChainFundedPool source and interrogate it
 * with an AI grounded in that exact source (api/contract-agent.js). Built for
 * traders and skeptics alike: ask "do payouts really settle instantly?" or "can
 * the team take LP funds?" and get answers cited from the code — including the
 * honest trust assumptions. The source shown here is the single source of truth
 * (src/data/contractSource.js, synced from contracts/) — verify it matches the
 * deployed bytecode on Etherscan via the link in the header.
 */
import SEO from "@/components/SEO";
import BoltLoader from "@/components/brand/BoltLoader";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck, ExternalLink, Send, Copy, Check, Sparkles, FileCode2 } from "lucide-react";
import { explorerAddressUrl } from "@/lib/thirdwebClient";
import ChatMarkdown from "@/components/ChatMarkdown";
import { CONTRACT_SOURCE, CONTRACT_META } from "@/data/contractSource";

const POOL_ADDRESS = import.meta.env.VITE_REWARDS_POOL_ADDRESS || "";
const CONTRACT_API = import.meta.env.VITE_CONTRACT_API_URL || "/api/contract-agent";
const DISCORD_LINK = "https://discord.gg/EdYwteDTHq";

const SOURCE_LINES = CONTRACT_SOURCE.split("\n");

const SUGGESTED = [
  "Do payouts really settle instantly?",
  "Can the team take or freeze LP funds?",
  "How do I withdraw my USDC as an LP?",
  "What rules are enforced on-chain?",
];

const GREETING = {
  role: "assistant",
  content:
    "Ask me anything about the ChainFundedPool contract — I answer only from the verified source on the left and cite the functions involved. Including the awkward questions about what the team can and can't do." };

export default function ContractExplorer() {
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef(null);

  // Keep the latest message in view by scrolling the chat pane only — never
  // scrollIntoView (that scrolls the whole window and jumps the page on load).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;

    const history = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
    setMessages((p) => [...p, { role: "user", content: q }]);
    setInput("");
    setLoading(true);
    try {
      const resp = await fetch(CONTRACT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, history }) });
      const data = await resp.json();
      setMessages((p) => [...p, { role: "assistant", content: data.reply || "Sorry, I couldn't process that." }]);
    } catch {
      setMessages((p) => [...p, { role: "assistant", content: `I'm having trouble connecting. You can read the source on the left, or reach us on Discord: ${DISCORD_LINK}` }]);
    }
    setLoading(false);
  };

  const copySource = async () => {
    try { await navigator.clipboard.writeText(CONTRACT_SOURCE); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };

  return (
    <>
      <SEO
        title="Smart Contract Explorer — ChainFunded"
        description="Read the deployed ChainFundedPool smart contract and ask an AI grounded in its verified source — payouts, LP withdrawals, and exactly what the team can and can't do. Don't trust — verify."
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <FileCode2 className="w-6 h-6 text-primary" />
            <h1 className="font-grotesk text-2xl font-bold text-foreground">Smart Contract Explorer</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            The exact source deployed at <span className="font-mono text-foreground/80">ChainFundedPool</span>, plus an
            assistant that answers <em>only</em> from this code and cites the functions involved — honest trust
            assumptions and all. Don't trust — verify.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1 text-primary font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" /> Verified source
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="font-mono text-muted-foreground">Solidity {CONTRACT_META.solidity} · {CONTRACT_META.lines.toLocaleString()} lines</span>
            {POOL_ADDRESS && (
              <>
                <span className="text-muted-foreground">·</span>
                <a
                  href={explorerAddressUrl(POOL_ADDRESS)}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-muted-foreground hover:text-primary transition-colors break-all"
                >
                  {POOL_ADDRESS.slice(0, 10)}…{POOL_ADDRESS.slice(-6)} <ExternalLink className="w-3 h-3" />
                </a>
              </>
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          {/* Source viewer */}
          <div className="rounded-lg border border-border bg-card/40 overflow-hidden flex flex-col min-h-[50vh] lg:h-[72vh]">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-secondary/30">
              <span className="font-mono text-xs text-muted-foreground">{CONTRACT_META.name}</span>
              <button onClick={copySource} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                {copied ? <><Check className="w-3 h-3 text-primary" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
              </button>
            </div>
            <div className="overflow-auto flex-1 text-[12px] leading-[1.5] font-mono">
              <table className="border-collapse w-full">
                <tbody>
                  {SOURCE_LINES.map((line, i) => (
                    <tr key={i} className="hover:bg-secondary/30">
                      <td className="select-none text-right pr-3 pl-3 text-muted-foreground/40 align-top w-px whitespace-nowrap">{i + 1}</td>
                      <td className="pr-4 whitespace-pre text-foreground/90">{line || " "}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Chat */}
          <div className="rounded-lg border border-border bg-card/40 overflow-hidden flex flex-col min-h-[50vh] lg:h-[72vh]">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-secondary/30">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-foreground">Ask the contract</span>
              <span className="ml-auto text-[10px] text-muted-foreground">Grounded in the source · cites functions</span>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-auto p-3 space-y-3">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm break-words ${
                    m.role === "user" ? "bg-primary text-primary-foreground whitespace-pre-wrap" : "bg-secondary/60 text-foreground"
                  }`}>
                    {m.role === "user" ? m.content : <ChatMarkdown>{m.content}</ChatMarkdown>}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-secondary/60 rounded-lg px-3 py-2 text-sm text-muted-foreground inline-flex items-center gap-2">
                    <BoltLoader className="w-3.5 h-3.5" /> Reading the source…
                  </div>
                </div>
              )}
              {messages.length === 1 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {SUGGESTED.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-xs border border-border rounded-full px-3 py-1.5 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-border p-3 space-y-2">
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Ask about payouts, LP withdrawals, owner powers…"
                  rows={1}
                  maxLength={1000}
                  className="flex-1 resize-none bg-background border border-border rounded-lg px-3 py-2 text-sm focus:border-primary outline-none transition-colors max-h-32"
                />
                <Button size="icon" onClick={() => send()} disabled={loading || !input.trim()} className="shrink-0">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground/70">
                Answers are generated from the source and may simplify. The contract on Etherscan is the source of truth.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}