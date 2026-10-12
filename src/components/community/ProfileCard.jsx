import { useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Settings, Lock, Trophy, BarChart2, Coins, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useCommunityProfile } from "@/hooks/useCommunityProfile";
import ProfileEdit from "./ProfileEdit";

function shortAddr(addr) {
  if (!addr || typeof addr !== "string" || addr.length < 10) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtUsd(n) {
  if (n == null) return "$0";
  const num = Number(n) || 0;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  return `$${num.toFixed(0)}`;
}

function fmtPts(n) {
  if (n == null) return "0";
  const num = Number(n) || 0;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

const PHASE_LABEL = ["—", "Phase 1", "Phase 2", "Funded"];
const PHASE_COLOR = ["text-muted-foreground", "text-yellow-400", "text-blue-400", "text-emerald-400"];

/**
 * Clickable username trigger that opens a popover (desktop) / sheet-like
 * popover (mobile) showing the wallet's verified community profile.
 *
 * Verified stats come from challenge_accounts + payouts + cfg_events.
 * Private profiles show only the handle + address.
 */
export default function ProfileCard({ address, children }) {
  const { address: viewerAddress } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const isMe = !!viewerAddress && viewerAddress.toLowerCase() === (address || "").toLowerCase();

  const { profile, loading, reload } = useCommunityProfile(open ? address : null);

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(false); }}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-80 p-0 border border-border bg-popover">
        <Card className="border-0 shadow-none bg-transparent">
          <CardContent className="p-4 space-y-3">
            {editing ? (
              <ProfileEdit
                initial={profile}
                onCancel={() => setEditing(false)}
                onSaved={() => { setEditing(false); reload(); }}
              />
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted/40 flex items-center justify-center text-xs font-mono text-muted-foreground shrink-0">
                    {(address || "??").slice(2, 4).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {profile?.handle ? `@${profile.handle}` : shortAddr(address)}
                      </span>
                      {profile?.is_private && <Lock className="w-3 h-3 text-muted-foreground" />}
                    </div>
                    <div className="text-[10px] text-muted-foreground/70 font-mono truncate">{address}</div>
                  </div>
                  {isMe && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(true)}
                      className="h-7 px-2 text-xs gap-1"
                    >
                      <Settings className="w-3 h-3" /> Edit
                    </Button>
                  )}
                </div>

                {loading && <div className="text-xs text-muted-foreground">Loading…</div>}

                {!loading && profile && profile.is_private && (
                  <div className="text-xs text-muted-foreground italic flex items-center gap-1.5">
                    <Lock className="w-3 h-3" /> Profile stats are private
                  </div>
                )}

                {!loading && profile && !profile.is_private && (
                  <div className="grid grid-cols-2 gap-2">
                    <Stat
                      icon={Trophy}
                      label="Highest Phase"
                      value={PHASE_LABEL[profile.max_phase] || "—"}
                      valueClass={PHASE_COLOR[profile.max_phase] || ""}
                    />
                    <Stat
                      icon={BarChart2}
                      label="Active Accounts"
                      value={`${profile.accounts_active}${profile.accounts_total !== profile.accounts_active ? ` / ${profile.accounts_total}` : ""}`}
                    />
                    <Stat
                      icon={Coins}
                      label="Total Payouts"
                      value={fmtUsd(profile.payout_total_usdc)}
                    />
                    <Stat
                      icon={Sparkles}
                      label="Season Points"
                      value={fmtPts(profile.season_points)}
                    />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  );
}

function Stat({ icon: Icon, label, value, valueClass = "" }) {
  return (
    <div className="bg-secondary/30 rounded-md p-2">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className={`text-sm font-semibold text-foreground ${valueClass}`}>{value}</div>
    </div>
  );
}
