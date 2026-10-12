/**
 * ProofPanel — the transparency / proof-of-reserves slide-over.
 *
 * Renders its own trigger pill so it can be dropped straight into the ticker.
 * The dashboard body is shared with the standalone /proof page via
 * ProofContent.
 *
 * Props:
 *   walletAddress — connected trader wallet (optional)
 */
import {
  Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { ShieldCheck } from "lucide-react";
import LightningMark from "@/components/brand/LightningMark";
import ProofContent from "@/components/brand/ProofContent";

export default function ProofPanel({ walletAddress }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/5 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary transition-colors hover:border-primary/50 hover:bg-primary/10">
          <ShieldCheck className="w-3.5 h-3.5" />
          Proof of Reserves
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-[420px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <LightningMark className="w-5 h-5" color="#15803d" />
            Proof of Reserves
          </SheetTitle>
          <SheetDescription>
            Every figure here is read live from the contract. Don't trust — verify.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          <ProofContent walletAddress={walletAddress} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
