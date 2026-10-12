import { ExternalLink } from "lucide-react";

const ALLOCATION = [
  { label: "Community Treasury", pct: 46, color: "bg-primary",        note: "Timelock — released via governance" },
  { label: "Trading Rewards",    pct: 15, color: "bg-blue-500",        note: "5-year emission to active traders" },
  { label: "Team & Founders",    pct: 20, color: "bg-muted-foreground/40", note: "4yr vest, 6mo cliff" },
  { label: "LP Rewards",         pct: 10, color: "bg-purple-500",      note: "5-year emission to CFND stakers" },
  { label: "Airdrop Reserve",    pct:  5, color: "bg-yellow-500",      note: "Timelock — via governance proposal" },
  { label: "Advisors & Investors", pct: 4, color: "bg-slate-500",      note: "10% TGE + 12mo linear vest" },
];

const GOVERNS = [
  "Default challenge rules",
  "Signer key rotation",
  "Protocol wallet updates",
  "Treasury allocation",
  "Emergency actions",
];

const NOT_GOVERNS = [
  "Individual challenge rules — locked at registration",
  "Fee split constants — hardcoded in contract",
  "Payout execution — smart contract enforced",
];

export default function DaoSection() {
  return (
    <section className="px-6 sm:px-10 lg:px-16 py-24 border-t border-border">
      <div className="max-w-7xl mx-auto">

        <div className="grid lg:grid-cols-[1fr_1fr] gap-12 lg:gap-16 items-start">

          {/* ── Left ── */}
          <div>
            <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase mb-4">
              ChainFunded DAO
            </p>
            <h2 className="font-grotesk text-3xl sm:text-4xl font-bold text-foreground leading-tight mb-5">
              The protocol is<br />governed by its users.
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-8 max-w-lg">
              CFG is the governance token for ChainFunded. Fixed supply, no inflation —
              100 million tokens, minted once at deployment. CFG holders vote on protocol
              parameters through an on-chain governor built on the same pattern as
              Uniswap and Compound.
            </p>

            {/* token supply stat */}
            <div className="flex items-baseline gap-3 mb-8">
              <span className="font-grotesk text-4xl font-bold text-foreground tabular-nums">100M</span>
              <div>
                <p className="font-mono text-xs text-primary">CFG total supply</p>
                <p className="font-mono text-[10px] text-muted-foreground/50">Fixed. No minting after deployment.</p>
              </div>
            </div>

            {/* allocation bar */}
            <div className="mb-3">
              <div className="flex h-3 rounded-full overflow-hidden gap-px">
                {ALLOCATION.map((a) => (
                  <div
                    key={a.label}
                    className={`${a.color} transition-all`}
                    style={{ width: `${a.pct}%` }}
                    title={`${a.label}: ${a.pct}%`}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {ALLOCATION.map((a) => (
                <div key={a.label} className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${a.color}`} />
                  <span className="font-mono text-xs text-foreground tabular-nums w-8">{a.pct}%</span>
                  <span className="text-xs text-foreground">{a.label}</span>
                  <span className="text-xs text-muted-foreground/50 ml-auto text-right hidden sm:block">{a.note}</span>
                </div>
              ))}
            </div>

            <div className="mt-8">
              <a
                href="https://chainfundeddao.org"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline underline-offset-4 font-grotesk font-medium"
              >
                Visit ChainFunded DAO <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* ── Right — governance mechanics ── */}
          <div className="space-y-5">

            {/* governance params */}
            <div className="rounded-xl border border-border bg-card/50 p-6">
              <p className="font-mono text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-4">
                Governance parameters
              </p>
              <div className="space-y-3">
                {[
                  { label: "Proposal threshold", value: "250,000 CFG (0.25%)" },
                  { label: "Quorum",             value: "4% of total supply" },
                  { label: "Voting delay",        value: "1 day" },
                  { label: "Voting period",       value: "5 days" },
                  { label: "Timelock delay",      value: "2 days minimum" },
                  { label: "Framework",           value: "OZ Governor + Timelock" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className="font-mono text-xs text-foreground">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* what governance controls */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-card/50 p-5">
                <p className="font-mono text-[10px] text-primary uppercase tracking-wider mb-3">
                  Governed by CFG
                </p>
                <ul className="space-y-2">
                  {GOVERNS.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="text-primary mt-0.5 select-none">+</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-border bg-card/50 p-5">
                <p className="font-mono text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-3">
                  Not governed
                </p>
                <ul className="space-y-2">
                  {NOT_GOVERNS.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="text-muted-foreground/30 mt-0.5 select-none">—</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card/50 p-5">
              <p className="text-sm text-muted-foreground leading-relaxed">
                <span className="text-foreground font-medium">51% of CFG goes to the community.</span>{" "}
                46% sits in a governance-controlled treasury. Another 5% in airdrop reserve.
                Neither can move without a successful proposal, a 5-day vote, and a
                2-day timelock — same mechanics used by the largest DeFi protocols.
              </p>
            </div>

          </div>
        </div>

      </div>
    </section>
  );
}
