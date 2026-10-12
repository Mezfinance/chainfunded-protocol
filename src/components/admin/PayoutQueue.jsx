import { Badge } from "@/components/ui/badge";
import { formatUtcDate } from "@/lib/datetime";

const STATUS_COLORS = {
  pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  approved: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  settled: "bg-green-500/10 text-green-400 border-green-500/30",
  rejected: "bg-red-500/10 text-red-400 border-red-500/30",
};

export default function PayoutQueue({ payouts }) {
  if (!payouts || payouts.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 text-center text-muted-foreground text-sm">
        No payout requests yet.
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              <th className="text-left text-xs text-muted-foreground px-4 py-2">Trader</th>
              <th className="text-right text-xs text-muted-foreground px-4 py-2">Gross Profit</th>
              <th className="text-right text-xs text-muted-foreground px-4 py-2">Trader Share</th>
              <th className="text-right text-xs text-muted-foreground px-4 py-2">Requested</th>
              <th className="text-right text-xs text-muted-foreground px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((payout) => (
              <tr key={payout.id} className="border-b border-border/50 hover:bg-secondary/20">
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {payout.trader_address?.slice(0, 6)}...{payout.trader_address?.slice(-4)}
                </td>
                <td className="px-4 py-3 text-right font-medium text-foreground">
                  ${payout.gross_profit_usdc?.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-green-400 font-semibold">
                  ${payout.trader_share_usdc?.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                  {payout.requested_date ? formatUtcDate(payout.requested_date, { year: false }) : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Badge variant="outline" className={`text-xs ${STATUS_COLORS[payout.status]}`}>
                    {payout.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
