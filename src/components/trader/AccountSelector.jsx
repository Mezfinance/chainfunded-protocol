import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";
import { formatUtcDate } from "@/lib/datetime";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PHASE_COLORS = {
  phase_1: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  phase_2: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  funded: "bg-green-500/10 text-green-400 border-green-500/30",
  passed: "bg-primary/10 text-primary border-primary/30",
  failed: "bg-red-500/10 text-red-400 border-red-500/30",
};

const PHASE_LABELS = {
  phase_1: "Phase 1",
  phase_2: "Phase 2",
  funded: "Funded",
  passed: "Passed",
  failed: "Failed",
};

export default function AccountSelector({ accounts, selectedId, onSelect }) {
  if (!accounts || accounts.length === 0) return null;

  const selected = accounts.find((a) => a.id === selectedId);

  return (
    <div className="flex items-start gap-3 flex-wrap">
      <div className="flex flex-col gap-1">
        <Select value={selectedId} onValueChange={onSelect}>
          <SelectTrigger className="w-56 bg-card border-border">
            <SelectValue placeholder="Select account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((acc) => (
              <SelectItem key={acc.id} value={acc.id}>
                ${acc.account_size?.toLocaleString()} — {PHASE_LABELS[acc.phase]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected && (
          <p className="text-xs text-muted-foreground font-mono px-1">
            ID: {selected.account_id || selected.id}
          </p>
        )}
      </div>
      {selected && (
        <>
          <Badge variant="outline" className={`mt-1 ${PHASE_COLORS[selected.phase]}`}>
            {PHASE_LABELS[selected.phase]}
          </Badge>
          {selected.start_date && (
            <span className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="w-3 h-3" />
              Started {formatUtcDate(selected.start_date)}
            </span>
          )}
        </>
      )}
    </div>
  );
}