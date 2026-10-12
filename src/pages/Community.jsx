import SEO from "@/components/SEO";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { toast } from "sonner";
import ChannelList from "@/components/community/ChannelList";
import MessageList from "@/components/community/MessageList";
import MessageInput from "@/components/community/MessageInput";
import CommunityTermsGate from "@/components/community/CommunityTermsGate";
import ModQueue from "@/components/community/ModQueue";
import ProfileEdit from "@/components/community/ProfileEdit";
import { useCommunityChannels } from "@/hooks/useCommunityChannels";
import { useCommunityMessages } from "@/hooks/useCommunityMessages";
import { useCommunityReactions } from "@/hooks/useCommunityReactions";
import { useCommunityUnread } from "@/hooks/useCommunityUnread";
import { useCommunityToken } from "@/hooks/useCommunityToken";
import { useCommunityProfile } from "@/hooks/useCommunityProfile";
import { useCommunityProfilesBatch } from "@/hooks/useCommunityProfilesBatch";
import { useCommunityStats } from "@/hooks/useCommunityStats";
import { useAuth } from "@/lib/AuthContext";
import { formatUtcDateTime } from "@/lib/datetime";
import { communityApi } from "@/lib/communityApi";
import { supabase } from "@/lib/supabaseClient";

const DEFAULT_CHANNEL = "general";
const STORAGE_LAST_CHANNEL = "cf_community_last_channel";

/**
 * Community shell — channel rail + message stream + composer.
 *
 * URL: /community?channel=<slug>&view=<browse|profile|mentions|pinned|mod-queue>
 *
 * Mobile: channel rail slides over from the left, triggered by a hamburger
 * button in the header. Desktop: rail is a fixed left column.
 *
 * Profile / Mentions / Pinned / Mod Queue views land in subsequent commits;
 * for now any non-"browse" view falls back to the channel browser.
 */
export default function Community() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { channels, loading: channelsLoading } = useCommunityChannels();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const view = searchParams.get("view") || "browse";
  const channelFromUrl = searchParams.get("channel");
  const lastSeen = useMemo(() => {
    try { return localStorage.getItem(STORAGE_LAST_CHANNEL); } catch { return null; }
  }, []);

  const activeChannelId =
    channelFromUrl ||
    lastSeen ||
    DEFAULT_CHANNEL;

  const activeChannel = useMemo(
    () => channels.find((c) => c.id === activeChannelId) || null,
    [channels, activeChannelId]
  );

  // Persist last-seen channel for next visit.
  useEffect(() => {
    if (!activeChannel) return;
    try { localStorage.setItem(STORAGE_LAST_CHANNEL, activeChannel.id); } catch {}
  }, [activeChannel]);

  const { address } = useAuth();
  const { token, signIn, signOut } = useCommunityToken();
  const { unread, markRead } = useCommunityUnread({ address, channels });

  const handleSelectChannel = (id) => {
    setSearchParams((p) => {
      const next = new URLSearchParams(p);
      next.set("channel", id);
      next.delete("view");
      return next;
    }, { replace: true });
    setDrawerOpen(false);
  };

  const { messages, loading: msgsLoading, reload: reloadMessages } = useCommunityMessages(activeChannelId);

  // Track loaded message IDs for the reactions subscription. Memoised so
  // we don't re-subscribe on every render of the message list.
  const messageIds = useMemo(() => messages.map((m) => m.id), [messages]);
  const { reactions, reload: reloadReactions } = useCommunityReactions(messageIds, address);
  const authorAddresses = useMemo(
    () => messages.map((m) => m.author_address).filter(Boolean),
    [messages]
  );
  const { profiles, loading: profilesLoading } = useCommunityProfilesBatch(authorAddresses);

  // Hold message rendering until profiles for all current authors are
  // resolved, so handles / badges appear on the same frame as the messages.
  // Hard timeout so a worker hiccup never leaves the user staring at a
  // spinner — after the timeout we render with whatever's cached.
  const [profilesTimedOut, setProfilesTimedOut] = useState(false);
  useEffect(() => {
    if (!profilesLoading) { setProfilesTimedOut(false); return; }
    const id = setTimeout(() => setProfilesTimedOut(true), 1500);
    return () => clearTimeout(id);
  }, [profilesLoading]);
  const showMessages = !profilesLoading || profilesTimedOut;

  const { stats } = useCommunityStats();

  // Local unread clear runs as soon as the channel has loaded — independent
  // of whether the user has minted a community token (signing only happens
  // when they post / react), so passive readers still clear their badge.
  useEffect(() => {
    if (!activeChannelId || !address || msgsLoading) return;
    markRead(activeChannelId);
  }, [activeChannelId, address, msgsLoading, markRead]);

  // Server-side cursor update needs the EIP-191 token. Best-effort.
  useEffect(() => {
    if (!activeChannelId || !token) return;
    communityApi.markRead(token, activeChannelId).catch(() => {});
  }, [activeChannelId, token]);

  const handleReactToggle = async (messageId, emoji) => {
    if (!address) {
      toast.error("Connect a wallet to react");
      return;
    }
    let active = token;
    if (!active) {
      try { active = await signIn(); } catch { return; }
    }
    if (!active) return;
    try {
      await communityApi.react(active, { messageId, emoji });
      // Realtime should pick this up, but reload as a fallback so the
      // emoji shows up even when the realtime channel is offline.
      reloadReactions();
    } catch (err) {
      if (err?.status === 401) {
        signOut();
        toast.error("Session expired — tap again to re-sign");
      } else {
        toast.error("Couldn't react", { description: err?.message });
      }
    }
  };

  return (
    <div className="-mx-4 sm:-mx-6 -my-8 h-[calc(100vh-3.5rem-2.25rem)] flex flex-col">
      <SEO title="Community" description="ChainFunded community: chat, share trades, governance, and live platform feeds." />
      <CommunityTermsGate>
        <CommunityStatsBar stats={stats} />
        <div className="flex flex-1 min-h-0">

          {/* Desktop sidebar */}
          <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-border bg-card/30 overflow-y-auto">
            <div className="px-3 py-3 border-b border-border">
              <h2 className="text-sm font-grotesk font-bold text-foreground">Community</h2>
            </div>
            {channelsLoading ? (
              <div className="text-xs text-muted-foreground p-4">Loading…</div>
            ) : (
              <ChannelList
                channels={channels}
                activeChannelId={activeChannel?.id}
                unread={unread}
                onSelect={handleSelectChannel}
              />
            )}
          </aside>

          {/* Mobile drawer */}
          {drawerOpen && (
            <div className="md:hidden fixed inset-0 z-40 flex">
              <div
                className="flex-1 bg-black/60"
                onClick={() => setDrawerOpen(false)}
              />
              <aside className="absolute left-0 top-0 bottom-0 w-72 bg-card border-r border-border overflow-y-auto">
                <div className="flex items-center justify-between px-3 py-3 border-b border-border">
                  <h2 className="text-sm font-grotesk font-bold text-foreground">Community</h2>
                  <button onClick={() => setDrawerOpen(false)} className="text-muted-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <ChannelList
                  channels={channels}
                  activeChannelId={activeChannel?.id}
                  onSelect={handleSelectChannel}
                />
              </aside>
            </div>
          )}

          {/* Channel / view area */}
          <section className="flex-1 flex flex-col min-w-0">
            {view === "mod-queue" ? (
              <>
                <header className="flex items-center gap-2 px-3 sm:px-4 h-12 border-b border-border bg-background/60 backdrop-blur shrink-0">
                  <button className="md:hidden text-muted-foreground" onClick={() => setDrawerOpen(true)} aria-label="Open channels">
                    <Menu className="w-5 h-5" />
                  </button>
                  <h3 className="font-semibold text-sm text-foreground">Moderation Queue</h3>
                </header>
                <ModQueue />
              </>
            ) : view === "profile" ? (
              <ProfileView onOpenChannels={() => setDrawerOpen(true)} />
            ) : view === "mentions" ? (
              <MentionsView
                onOpenChannels={() => setDrawerOpen(true)}
                onJump={handleSelectChannel}
              />
            ) : (
              <>
                <header className="flex items-center gap-2 px-3 sm:px-4 h-12 border-b border-border bg-background/60 backdrop-blur shrink-0">
                  <button
                    className="md:hidden text-muted-foreground"
                    onClick={() => setDrawerOpen(true)}
                    aria-label="Open channels"
                  >
                    <Menu className="w-5 h-5" />
                  </button>
                  {activeChannel ? (
                    <>
                      <span className="text-base">{activeChannel.emoji || "#"}</span>
                      <h3 className="font-semibold text-sm text-foreground truncate">
                        {activeChannel.name}
                      </h3>
                      {activeChannel.description && (
                        <p className="text-xs text-muted-foreground truncate hidden sm:block">
                          · {activeChannel.description}
                        </p>
                      )}
                    </>
                  ) : (
                    <h3 className="font-semibold text-sm text-muted-foreground">
                      {channelsLoading ? "Loading…" : "Channel not found"}
                    </h3>
                  )}
                </header>

                <MessageList
                  messages={showMessages ? messages : []}
                  loading={msgsLoading || (!showMessages && messages.length > 0)}
                  reactions={reactions}
                  profiles={profiles}
                  onReactToggle={handleReactToggle}
                />

                {activeChannel && (
                  <MessageInput channel={activeChannel} onPosted={reloadMessages} />
                )}
              </>
            )}
          </section>
        </div>
      </CommunityTermsGate>
    </div>
  );
}

const PHASE_LABEL = ["—", "Phase 1", "Phase 2", "Funded"];

function fmtUsd(n) {
  const num = Number(n) || 0;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  return `$${num.toFixed(0)}`;
}

function ProfileView({ onOpenChannels }) {
  const { address, isAuthenticated } = useAuth();
  const { profile, loading, reload } = useCommunityProfile(address);
  const [editing, setEditing] = useState(false);

  return (
    <>
      <header className="flex items-center gap-2 px-3 sm:px-4 h-12 border-b border-border bg-background/60 backdrop-blur shrink-0">
        <button className="md:hidden text-muted-foreground" onClick={onOpenChannels} aria-label="Open channels">
          <Menu className="w-5 h-5" />
        </button>
        <h3 className="font-semibold text-sm text-foreground">My Profile</h3>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {!isAuthenticated ? (
          <div className="text-sm text-muted-foreground">Connect a wallet to view your profile.</div>
        ) : loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : editing ? (
          <div className="max-w-md">
            <ProfileEdit
              initial={profile}
              onCancel={() => setEditing(false)}
              onSaved={() => { setEditing(false); reload(); }}
            />
          </div>
        ) : (
          <div className="max-w-md space-y-4">
            <div className="space-y-1">
              <div className="text-lg font-semibold text-foreground">
                {profile?.handle ? `@${profile.handle}` : "No handle set"}
              </div>
              <div className="text-xs font-mono text-muted-foreground break-all">{address}</div>
              {profile?.is_private && (
                <div className="text-xs text-muted-foreground italic">Profile is private</div>
              )}
            </div>

            {profile && !profile.is_private && (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-secondary/30 rounded-md p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Highest Phase</div>
                  <div className="text-sm font-semibold text-foreground">{PHASE_LABEL[profile.max_phase] || "—"}</div>
                </div>
                <div className="bg-secondary/30 rounded-md p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Active Accounts</div>
                  <div className="text-sm font-semibold text-foreground">
                    {profile.accounts_active}{profile.accounts_total !== profile.accounts_active ? ` / ${profile.accounts_total}` : ""}
                  </div>
                </div>
                <div className="bg-secondary/30 rounded-md p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Total Payouts</div>
                  <div className="text-sm font-semibold text-foreground">{fmtUsd(profile.payout_total_usdc)}</div>
                </div>
                <div className="bg-secondary/30 rounded-md p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Season Points</div>
                  <div className="text-sm font-semibold text-foreground">{Number(profile.season_points || 0).toLocaleString()}</div>
                </div>
              </div>
            )}

            <button
              onClick={() => setEditing(true)}
              className="text-xs px-3 py-1.5 rounded-md border border-border bg-secondary/40 hover:bg-secondary/70 text-foreground"
            >
              Edit profile
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function formatMentionTime(iso) {
  if (!iso) return "";
  return formatUtcDateTime(iso);
}

function MentionsView({ onOpenChannels, onJump }) {
  const { address, isAuthenticated } = useAuth();
  const { profile } = useCommunityProfile(address);
  const handle = profile?.handle || null;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!handle) { setItems([]); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error: err } = await supabase
        .from("community_messages")
        .select("id, channel_id, author_address, content, created_at, mentions, deleted_at")
        .contains("mentions", [handle.toLowerCase()])
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (cancelled) return;
      if (err) {
        setError(err.message || "Failed to load mentions");
        setItems([]);
      } else {
        setError(null);
        setItems(data || []);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [handle]);

  return (
    <>
      <header className="flex items-center gap-2 px-3 sm:px-4 h-12 border-b border-border bg-background/60 backdrop-blur shrink-0">
        <button className="md:hidden text-muted-foreground" onClick={onOpenChannels} aria-label="Open channels">
          <Menu className="w-5 h-5" />
        </button>
        <h3 className="font-semibold text-sm text-foreground">Mentions</h3>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {!isAuthenticated ? (
          <div className="text-sm text-muted-foreground">Connect a wallet to see mentions.</div>
        ) : !handle ? (
          <div className="text-sm text-muted-foreground">
            Set a handle on your profile to receive mentions.
          </div>
        ) : loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="text-sm text-rose-400">{error}</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No one has @-tagged you yet.
          </div>
        ) : (
          <ul className="space-y-2 max-w-2xl">
            {items.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => onJump(m.channel_id)}
                  className="w-full text-left bg-secondary/30 hover:bg-secondary/60 border border-border rounded-md p-3 transition-colors"
                >
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
                    <span className="font-mono">#{m.channel_id}</span>
                    <span>·</span>
                    <span>{formatMentionTime(m.created_at)}</span>
                  </div>
                  <div className="text-sm text-foreground/90 whitespace-pre-wrap break-words line-clamp-3">
                    {m.content || "(no text)"}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function fmtCount(n) {
  if (n == null) return "—";
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(num >= 10_000_000 ? 0 : 1)}M`;
  if (num >= 10_000) return `${(num / 1_000).toFixed(0)}K`;
  return num.toLocaleString();
}

function CommunityStatsBar({ stats }) {
  const cells = [
    { label: "Platform Users",  value: stats.platformUsers },
    { label: "Active Phase 1",  value: stats.activePhase1 },
    { label: "Active Phase 2",  value: stats.activePhase2 },
    { label: "Funded Accounts", value: stats.funded },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border/50 border-b border-border shrink-0">
      {cells.map((c) => (
        <div key={c.label} className="bg-card/40 px-3 sm:px-4 py-2 flex items-center justify-between">
          <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            {c.label}
          </span>
          <span className="text-sm sm:text-base font-semibold text-foreground tabular-nums">
            {fmtCount(c.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
