import SEO from "@/components/SEO";
import { ShieldCheck } from "lucide-react";
import MarkdownLegalContent from "@/components/legal/MarkdownLegalContent";

export default function PrivacyPolicy() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <SEO
        title="Privacy Policy"
        description="ChainFunded Privacy Policy — how we collect, use, and protect your personal information when you use our on-chain prop trading platform."
        canonical="/privacy-policy"
      />
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 text-primary text-xs font-medium">
          <ShieldCheck className="w-3 h-3" /> Legal
        </div>
        <h1 className="text-3xl md:text-4xl font-grotesk font-bold text-foreground">
          Privacy <span className="gradient-text">Policy</span>
        </h1>
      </div>
      <div className="bg-card border border-border rounded-xl p-6 md:p-8">
        <MarkdownLegalContent file="/privacy-policy.md" />
      </div>
    </div>
  );
}
