import SEO from "@/components/SEO";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ScrollText,
  Shield,
  Eye,
  AlertTriangle,
  FileText,
  Landmark,
  Download,
} from "lucide-react";
import { Link } from "react-router-dom";

const DOCUMENTS = [
  {
    title: "Terms and Conditions",
    description:
      "The agreement governing your use of the ChainFunded platform, including the evaluation programme, funded accounts, and trading rules.",
    icon: ScrollText,
    link: "/terms-of-service",
    download: "/terms-and-conditions.md",
    presenter: "ChainFunded Labs (MZF-Protocol Inc.)",
  },
  {
    title: "Privacy Policy",
    description:
      "How we collect, use, share, and protect your information when you use the platform.",
    icon: Eye,
    link: "/privacy-policy",
    download: "/privacy-policy.md",
    presenter: "ChainFunded Labs (MZF-Protocol Inc.)",
  },
  {
    title: "Risk Disclosure Statement",
    description:
      "Material risks associated with using the platform and interacting with the protocol, including smart contract, market, liquidity, and regulatory risks.",
    icon: AlertTriangle,
    link: null,
    download: "/risk-disclosure.md",
    presenter: "ChainFunded Labs & ChainFunded DAO",
  },
  {
    title: "Protocol Terms of Use",
    description:
      "Terms governing your interaction with the ChainFunded protocol smart contracts on the Ethereum blockchain.",
    icon: Landmark,
    link: null,
    download: "/protocol-terms.md",
    presenter: "ChainFunded DAO",
  },
  {
    title: "LP Pool Participation Terms",
    description:
      "Terms for liquidity providers depositing USDC into the ChainFunded protocol pool, including yield mechanics, withdrawal, and risks.",
    icon: FileText,
    link: null,
    download: "/lp-terms.md",
    presenter: "ChainFunded DAO",
  },
];

export default function Legal() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <SEO
        title="Legal"
        description="ChainFunded legal documents — Terms and Conditions, Privacy Policy, Risk Disclosure, Protocol Terms, and LP Pool Terms."
        canonical="/legal"
      />

      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 text-primary text-xs font-medium">
          <Shield className="w-3 h-3" /> Legal
        </div>
        <h1 className="text-3xl md:text-4xl font-grotesk font-bold text-foreground">
          Legal <span className="gradient-text">Documents</span>
        </h1>
        <p className="text-muted-foreground text-sm max-w-lg mx-auto">
          All public legal agreements governing the ChainFunded platform and protocol. Documents are available for download below.
        </p>
      </div>

      {/* Entity disclosure */}
      <div className="bg-card/50 border border-border rounded-lg p-4 text-sm text-muted-foreground space-y-2">
        <p>
          <strong className="text-foreground">ChainFunded Labs</strong> (MZF-Protocol Inc.) is a software company incorporated in Panama that operates the ChainFunded platform. It does not operate the protocol, custody funds, or process payouts.
        </p>
        <p>
          <strong className="text-foreground">ChainFunded DAO</strong> governs the ChainFunded decentralised protocol. All challenge rules, fee allocations, and payouts are enforced by smart contracts.
        </p>
      </div>

      {/* Document cards */}
      <div className="space-y-4">
        {DOCUMENTS.map((doc) => (
          <Card key={doc.title} className="border-border">
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <doc.icon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-grotesk font-semibold text-foreground">
                    {doc.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {doc.description}
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-2">
                    Issued by: {doc.presenter}
                  </p>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  {doc.link && (
                    <Link to={doc.link}>
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs w-full">
                        <ScrollText className="w-3 h-3" /> View
                      </Button>
                    </Link>
                  )}
                  <a href={doc.download} download>
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs w-full">
                      <Download className="w-3 h-3" /> Download
                    </Button>
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Contact */}
      <div className="text-center text-sm text-muted-foreground pt-4 border-t border-border">
        <p>
          For legal inquiries, contact us at{" "}
          <a
            href="mailto:legal@chainfunded.io"
            className="text-primary hover:underline"
          >
            legal@chainfunded.io
          </a>
        </p>
      </div>
    </div>
  );
}
