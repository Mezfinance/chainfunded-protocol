import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatUtcDate } from "@/lib/datetime";
import { CheckCircle2, Clock, X } from "lucide-react";
import { explorerTxUrl } from "@/lib/thirdwebClient";

export default function PayoutHistory({ payouts }) {
  const statusConfig = {
    pending: {
      icon: Clock,
      color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
      label: "Pending",
    },
    approved: {
      icon: CheckCircle2,
      color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      label: "Approved",
    },
    settled: {
      icon: CheckCircle2,
      color: "bg-green-500/10 text-green-400 border-green-500/20",
      label: "Settled",
    },
    rejected: {
      icon: X,
      color: "bg-red-500/10 text-red-400 border-red-500/20",
      label: "Rejected",
    },
  };

  if (!payouts || payouts.length === 0) {
    return (
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Payout History</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <p className="text-muted-foreground text-sm">No payouts yet. Win a challenge to request a payout.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-base">Payout History</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left text-xs text-muted-foreground px-4 py-2">Date</th>
                <th className="text-left text-xs text-muted-foreground px-4 py-2">Status</th>
                <th className="text-right text-xs text-muted-foreground px-4 py-2">Profit (80%)</th>
                <th className="text-right text-xs text-muted-foreground px-4 py-2">Firm (20%)</th>
                <th className="text-right text-xs text-muted-foreground px-4 py-2">Transaction</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((payout) => {
                const config = statusConfig[payout.status] || statusConfig.pending;
                const Icon = config.icon;
                return (
                  <tr key={payout.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground">
                      {payout.requested_date ? formatUtcDate(payout.requested_date) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Icon className="w-3 h-3" style={{ color: "currentColor" }} />
                        <Badge variant="outline" className={`text-xs ${config.color}`}>
                          {config.label}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-green-400">
                      ${payout.trader_share_usdc?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                      ${payout.firm_share_usdc?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {payout.tx_hash ? (
                        <a
                          href={explorerTxUrl(payout.tx_hash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline font-mono"
                        >
                          {payout.tx_hash.slice(0, 10)}…
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}