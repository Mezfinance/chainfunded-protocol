import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, AtSign, Heart, Reply, ShieldAlert, TrendingUp, Coins, BadgeCheck, Wallet, Send } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useNotifications } from "@/hooks/useNotifications";

const ICONS = {
  mention:          AtSign,
  reaction:         Heart,
  reply:            Reply,
  mod_action:       ShieldAlert,
  payout:           Coins,
  phase_promotion:  BadgeCheck,
  sl_hit:           TrendingUp,
  tp_hit:           TrendingUp,
  limit_filled:     TrendingUp,
  affiliate:        Coins,
  lp_claim:         Coins,
  lp_withdraw:      Wallet,
  zone_win:         TrendingUp,
  zone_loss:        TrendingUp,
  zone_refund:      TrendingUp,
  zone_exited:      TrendingUp,
  turbo_win:        TrendingUp,   // legacy alias — old notification rows pre-rename
  turbo_loss:       TrendingUp,
  turbo_refund:     TrendingUp,
  turbo_exited:     TrendingUp,
  cfg:              BadgeCheck,
  wallet_send:      Send,
  wallet_receive:   Wallet,
};

function relativeTime(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { items, unread, markRead, markAllRead, reload, hasToken } = useNotifications();
  const navigate = useNavigate();

  // Refresh once when the user opens the panel — covers cases where
  // we couldn't poll yet (no token) and they sign in by interacting.
  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  const handleClick = (n) => {
    if (!n.read_at) markRead(n.id);
    if (n.link) navigate(n.link);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="Notifications"
          className="relative flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <Bell className="w-5 h-5" />
          {unread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-80 sm:w-96 p-0 border border-border bg-popover overflow-hidden"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-sm font-semibold text-foreground">Notifications</span>
          {unread > 0 && (
            <button
              onClick={markAllRead}
              className="text-[11px] text-primary hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              You're all caught up — no notifications yet.
            </div>
          ) : (
            <ul>
              {items.map((n) => {
                const Icon = ICONS[n.type] || Bell;
                const unreadRow = !n.read_at;
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => handleClick(n)}
                      className={`w-full text-left px-3 py-2.5 flex gap-2.5 border-b border-border/60 last:border-b-0 transition-colors ${
                        unreadRow
                          ? "bg-primary/5 hover:bg-primary/10"
                          : "hover:bg-secondary/40"
                      }`}
                    >
                      <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                        unreadRow ? "bg-primary/15 text-primary" : "bg-muted/40 text-muted-foreground"
                      }`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-medium text-foreground truncate">{n.title}</span>
                          <span className="text-[10px] text-muted-foreground/70 shrink-0">{relativeTime(n.created_at)}</span>
                        </div>
                        {n.body && (
                          <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {n.body}
                          </div>
                        )}
                      </div>
                      {unreadRow && (
                        <span className="shrink-0 self-center w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {!hasToken && (
          <div className="px-3 py-2 border-t border-border text-[10px] text-muted-foreground/70 text-center">
            Join the community to see mentions &amp; replies here too.
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
