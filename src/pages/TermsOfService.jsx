import SEO from "@/components/SEO";
import { ScrollText } from "lucide-react";
import MarkdownLegalContent from "@/components/legal/MarkdownLegalContent";

export default function TermsOfService() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <SEO
        title="Terms and Conditions"
        description="ChainFunded Terms and Conditions — the rules, rights, and obligations governing use of the ChainFunded on-chain prop trading evaluation platform."
        canonical="/terms-of-service"
      />
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 text-primary text-xs font-medium">
          <ScrollText className="w-3 h-3" /> Legal
        </div>
        <h1 className="text-3xl md:text-4xl font-grotesk font-bold text-foreground">
          Terms and <span className="gradient-text">Conditions</span>
        </h1>
      </div>
      <div className="bg-card border border-border rounded-xl p-6 md:p-8">
        <MarkdownLegalContent file="/terms-and-conditions.md" />
      </div>
    </div>
  );
}
