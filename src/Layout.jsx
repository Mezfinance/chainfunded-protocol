/**
 * Layout — Main application shell wrapping all pages.
 *
 * Provides: sidebar navigation (desktop: persistent, mobile: drawer),
 * top header bar with wallet connection status, theme toggle, and
 * responsive breakpoint handling. Conditionally renders nav items
 * based on auth state (connected wallet, admin status). All pages
 * are rendered as children within this layout via pages.config.js.
 */
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useState } from "react";
import SupportChat from "@/components/SupportChat";
import ManageCookiesLink from "@/components/ManageCookiesLink";
import {
  TrendingUp,
  Droplets,
  ShieldCheck,
  LifeBuoy,
  Menu,
  X,
  Zap,
  Clock,
  ChevronRight,
  ChevronDown,
  Wallet,
  User,
  LogOut,
  Users,
  BarChart2,
  HelpCircle,
  BookOpen,
  BookText,
  Mail,
  Trophy,
  Info,
  Medal,
  CreditCard,
  ListChecks,
  CheckSquare,
  FileSignature,
  Coins,
  MessageCircle,
  AtSign,
  Pin,
  ShieldAlert,
  FileCode2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useAuth } from "@/lib/AuthContext";
import { useConnectModal, useDisconnect, useActiveWallet } from "thirdweb/react";
import { thirdwebClient, chain, wallets, appMetadata } from "@/lib/thirdwebClient";
import SanctionedAddressBlock from "@/components/SanctionedAddressBlock";
import GeoBlockedScreen from "@/components/GeoBlockedScreen";
import { useGeoBlocking } from "@/hooks/useGeoBlocking";
import SeasonIndicator from "@/components/cfg/SeasonIndicator";
import NotificationBell from "@/components/NotificationBell";
import PauseBanner from "@/components/PauseBanner";
import LaunchSaleBanner from "@/components/LaunchSaleBanner";
import PresaleBar from "@/components/PresaleBar";
import { presaleActive } from "@/config/presale";
import NavDropdown from "@/components/nav/NavDropdown";
import { useMentionNotifications } from "@/hooks/useMentionNotifications";
import { useCommunityModerator } from "@/hooks/useCommunityModerator";
import { useZoneAccess } from "@/hooks/useZoneAccess";

// Top-nav config. Each top-level item opens a hover dropdown listing sub-pages.
//
// Submenu items can specify either:
//   - `to`:  absolute path (used by Trade / Earn / Community where each
//            submenu item is its own page)
//   - `tab`: tab slug appended as `?tab=<slug>` to the parent page (used by
//            Support / Admin where the submenu maps to in-page tabs)
//
// `activePages` lists which `currentPageName` values should highlight this
// nav category — without it, the trigger highlights only when the page
// matches `page` exactly.
const PUBLIC_NAV = [
  {
    label: "Trade",
    page:  "TraderDashboard",
    icon:  BarChart2,
    activePages: ["TraderDashboard", "TradingTerminal", "ZoneTrades"],
    submenu: [
      { label: "Trader Hub", description: "All your challenge accounts in one place", icon: TrendingUp, to: createPageUrl("TraderDashboard") },
      { label: "Terminal",   description: "Open and manage live positions",           icon: BarChart2,  to: createPageUrl("TradingTerminal") },
    ],
  },
  {
    label: "Earn",
    page:  "CfgRewards",
    icon:  Coins,
    activePages: ["CfgRewards", "LPDashboard", "AffiliateDashboard"],
    submenu: [
      { label: "LP Pool",     description: "Provide USDC liquidity, earn yield + CFG",   icon: Droplets, to: createPageUrl("LPDashboard")        },
      { label: "CFG Rewards", description: "Trading rewards, LP staking, leaderboards",  icon: Trophy,   to: createPageUrl("CfgRewards")         },
      { label: "Affiliates",  description: "Earn commission for referrals",              icon: Users,    to: createPageUrl("AffiliateDashboard") },
    ],
  },
  {
    label: "Community",
    page:  "Community",
    icon:  MessageCircle,
    activePages: ["Community"],
    submenu: [
      { label: "Browse Channels", description: "All chat, feeds, governance",         icon: MessageCircle, to: createPageUrl("Community") },
      { label: "My Profile",      description: "Your handle, badges, verified stats", icon: User,          to: `${createPageUrl("Community")}?view=profile`  },
      { label: "Mentions",        description: "Where you've been @-tagged",          icon: AtSign,        to: `${createPageUrl("Community")}?view=mentions` },
      { label: "Pinned",          description: "Pinned messages across channels",     icon: Pin,           to: `${createPageUrl("Community")}?view=pinned`   },
    ],
  },
  {
    label: "Support",
    page:  "Support",
    icon:  LifeBuoy,
    activePages: ["Support", "Whitepaper", "Proof", "ContractExplorer"],
    submenu: [
      { label: "FAQ",              description: "Common questions about ChainFunded",      icon: HelpCircle, tab: "faq" },
      { label: "How-To Guides",    description: "Step-by-step trader and LP walkthroughs", icon: BookOpen,   tab: "guides" },
      { label: "Contact",          description: "Email, Discord & support channels",       icon: Mail,       tab: "contact" },
      { label: "Proof of Reserves", description: "Live pool, reserve health, settlement — verified on-chain", icon: ShieldCheck, to: createPageUrl("Proof") },
      { label: "Smart Contract",   description: "Read the deployed source and ask it anything — grounded in the code", icon: FileCode2, to: createPageUrl("ContractExplorer") },
      { label: "Whitepaper",       description: "Protocol architecture, NAV mechanics, threat model", icon: BookText, to: createPageUrl("Whitepaper") },
    ],
  },
];

const ADMIN_NAV_ITEM = {
  label: "Admin",
  page:  "AdminDashboard",
  icon:  ShieldCheck,
  // Right-align the panel — Admin sits at the far right of the centred
  // nav, so opening leftward keeps it inside the viewport and away from
  // the theme toggle / wallet area.
  dropdownAlign: "right",
  submenu: [
    { label: "Challenges",    description: "Manage active challenge accounts",  icon: TrendingUp,    tab: "challenges" },
    { label: "Payouts",       description: "Sign and process trader payouts",   icon: CreditCard,    tab: "payouts" },
    { label: "Trading Pairs", description: "Enable or disable tradable assets", icon: ListChecks,    tab: "pairs" },
    { label: "Whitelist",     description: "Approve and manage whitelisted wallets", icon: CheckSquare, tab: "whitelist" },
    { label: "Agreements",    description: "View signed legal agreements",      icon: FileSignature, tab: "agreements" },
  ],
};

export default function Layout({ children, currentPageName }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const { isAdmin, isAuthenticated, address, isSanctioned } = useAuth();
  const { connect }    = useConnectModal();
  const { disconnect } = useDisconnect();
  const wallet         = useActiveWallet();
  const { isBlocked: isGeoBlocked, blockedCountry } = useGeoBlocking();

  // Mod queue option only shows for moderators.
  const { isMod } = useCommunityModerator();
  // Zone Trading is allowlist-gated — add it to the Trade dropdown only when
  // this wallet is permitted by the worker.
  const { allowed: zoneAllowed } = useZoneAccess(address);
  const navItems = (() => {
    let items = PUBLIC_NAV.map((item) => {
      if (item.label === "Trade" && zoneAllowed) {
        return {
          ...item,
          submenu: [
            ...item.submenu,
            { label: "Zone Trading", description: "Short-window Up/Down positions with a staircase payout — Near / Mid / Knockout zones", icon: Zap, to: createPageUrl("ZoneTrades") },
          ],
        };
      }
      return item;
    });
    if (isMod) {
      items = items.map((item) => {
        if (item.label !== "Community") return item;
        const submenu = [...item.submenu, {
          label: "Moderation Queue",
          description: "Pending flags awaiting review",
          icon: ShieldAlert,
          to: `${createPageUrl("Community")}?view=mod-queue`,
        }];
        return { ...item, submenu };
      });
    }
    if (isAdmin) items = [...items, ADMIN_NAV_ITEM];
    return items;
  })();

  // Toast on @mention from any community channel.
  useMentionNotifications();

  const handleSignIn  = () => connect({ client: thirdwebClient, chain, wallets, appMetadata });
  const handleSignOut = () => {
    if (wallet) disconnect(wallet);
    // Clear thirdweb in-app wallet session to prevent auto-reconnect
    localStorage.removeItem("cf_wallet_seen");
    // Clear any thirdweb-specific session keys
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("thirdweb") || key.startsWith("walletconnect") || key.startsWith("wagmi")) {
        localStorage.removeItem(key);
      }
    });
  };

  const shortAddress = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : "";

  // Geo-blocking — block users from sanctioned jurisdictions
  if (isGeoBlocked) {
    return <GeoBlockedScreen countryCode={blockedCountry} />;
  }

  // OFAC screening — block sanctioned wallets at the interface layer
  if (isSanctioned) {
    return <SanctionedAddressBlock />;
  }

  const isTerminal = currentPageName === "TradingTerminal";
  const showPresaleBar = presaleActive();

  return (
    <div className={isTerminal
      ? "h-[100dvh] flex flex-col overflow-hidden font-inter"
      : "min-h-screen font-inter"}>
      {/* Site-wide presale bar — above the nav; hidden on the full-screen terminal and the presale page itself */}
      {!isTerminal && currentPageName !== "Presale" && <PresaleBar />}
      {/* Top Nav — paddingTop pushes content below the iOS status bar in standalone mode */}
      <nav className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md shrink-0"
           style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-3 h-14 relative">

          {/* Logo */}
          <Link to={createPageUrl("Landing")} className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center glow-green-sm">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <span className="font-grotesk font-700 text-lg text-foreground">
              Chain<span className="text-primary">Funded</span>
            </span>
          </Link>

          {/* Season indicator — doubles as the CFG Rewards entry point with a
              hover dropdown. Shown only at xl+ so it never crowds the centred
              nav near the breakpoint (it's still reachable via Earn → CFG
              Rewards and in the mobile drawer). */}
          <div className="hidden xl:block relative z-20 shrink-0">
            <NavDropdown
              triggerTo={createPageUrl("CfgRewards")}
              triggerRender={({ open }) => (
                <SeasonIndicator hasDropdown open={open} />
              )}
              items={[
                { label: "Trading Rewards", description: "Earn CFG by trading challenge accounts", icon: TrendingUp, to: `${createPageUrl("CfgRewards")}?tab=trading` },
                { label: "LP Staking",      description: "Stake CFND to earn CFG and USDC profit", icon: Droplets,   to: `${createPageUrl("CfgRewards")}?tab=lp` },
                { label: "Leaderboard",     description: "Top traders and LPs by CFG earned",      icon: Trophy,     to: `${createPageUrl("CfgRewards")}?tab=leaderboard` },
                { label: "About Seasons",   description: "How CFG, seasons, and allocations work", icon: Info,       to: `${createPageUrl("CfgRewards")}?tab=seasons` },
              ]}
            />
          </div>

          {/* Desktop Nav — centred via flex so it never overlaps the logo /
              season chip / right actions as the viewport shrinks. */}
          <div className="hidden nav:flex items-center gap-1 flex-1 justify-center min-w-0">
            {navItems.map((item) => {
              const { label, page, icon: Icon, submenu } = item;
              const active = item.activePages
                ? item.activePages.includes(currentPageName)
                : currentPageName === page;
              if (submenu?.length) {
                return (
                  <NavDropdown
                    key={page}
                    triggerTo={createPageUrl(page)}
                    trigger={{ label, icon: Icon, active }}
                    align={item.dropdownAlign || "left"}
                    items={submenu.map(s => ({
                      ...s,
                      to: s.to || `${createPageUrl(page)}?tab=${s.tab}`,
                    }))}
                  />
                );
              }
              return (
                <Link key={page} to={createPageUrl(page)}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`gap-2 ${active ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </Button>
                </Link>
              );
            })}
          </div>

          {/* Right */}
          <div className="hidden nav:flex items-center gap-3 shrink-0">
            <ThemeToggle />
            {isAuthenticated && <NotificationBell />}
            {isAuthenticated ? (
              <NavDropdown
                align="right"
                triggerTo={createPageUrl("MyAccount")}
                trigger={{ label: shortAddress, icon: User }}
                items={[
                  {
                    label: "My Account",
                    description: "Profile, identity, and preferences",
                    icon: User,
                    to: createPageUrl("MyAccount"),
                  },
                  {
                    label: "Wallet",
                    description: "Balances, deposits, and transaction history",
                    icon: Wallet,
                    to: createPageUrl("Wallet"),
                  },
                  {
                    label: "Sign Out",
                    description: "Disconnect your wallet from this session",
                    icon: LogOut,
                    onSelect: handleSignOut,
                  },
                ]}
              />
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="border-primary/40 text-primary hover:bg-primary/10 gap-1.5"
                onClick={handleSignIn}
              >
                <Wallet className="w-3.5 h-3.5" /> Sign In
              </Button>
            )}
            <Link to={createPageUrl("Onboarding")}>
              <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1 glow-green-sm">
                Start Challenge <ChevronRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>

          {/* Mobile: sign in / start challenge + theme toggle + hamburger */}
          <div className="nav:hidden ml-auto flex items-center gap-2">
            {!isAuthenticated && (
              <Button
                size="sm"
                variant="outline"
                className="border-primary/40 text-primary hover:bg-primary/10 gap-1.5"
                onClick={handleSignIn}
              >
                <Wallet className="w-3.5 h-3.5" /> Sign In
              </Button>
            )}
            {isAuthenticated && <NotificationBell />}
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("open-support-chat"))}
              className="relative text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Open support chat"
            >
              <MessageCircle className="w-5 h-5" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full" />
            </button>
            <ThemeToggle />
            <button className="text-muted-foreground" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileOpen && (
          <div className="nav:hidden border-t border-border bg-card px-4 py-4 space-y-1">
            <div className="mb-2">
              <SeasonIndicator />
            </div>
            {navItems.map((item) => {
              const { label, page, icon: Icon, submenu } = item;
              if (!submenu?.length) {
                return (
                  <Link key={page} to={createPageUrl(page)} onClick={() => setMobileOpen(false)}>
                    <Button variant="ghost" className="w-full justify-start gap-2 text-muted-foreground">
                      <Icon className="w-4 h-4" />
                      {label}
                    </Button>
                  </Link>
                );
              }
              return (
                <details key={page} className="group">
                  <summary className="list-none cursor-pointer">
                    <div className="flex items-center justify-between w-full px-3 py-2 rounded-md text-muted-foreground hover:bg-secondary/40 transition-colors">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <Icon className="w-4 h-4" />
                        {label}
                      </span>
                      <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                    </div>
                  </summary>
                  <div className="ml-3 mt-1 mb-1 border-l border-border/60 pl-2 space-y-0.5">
                    {submenu.map((s, i) => {
                      const SubIcon = s.icon;
                      const to = s.to || `${createPageUrl(page)}?tab=${s.tab}`;
                      return (
                        <Link key={i} to={to} onClick={() => setMobileOpen(false)}>
                          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground/80 text-xs">
                            {SubIcon && <SubIcon className="w-3.5 h-3.5" />}
                            {s.label}
                          </Button>
                        </Link>
                      );
                    })}
                  </div>
                </details>
              );
            })}
            {isAuthenticated && (
              <>
                <Link to={createPageUrl("MyAccount")} onClick={() => setMobileOpen(false)}>
                  <Button variant="ghost" className="w-full justify-start gap-2 text-muted-foreground">
                    <User className="w-4 h-4" />
                    My Account
                  </Button>
                </Link>
                <Link to={createPageUrl("Wallet")} onClick={() => setMobileOpen(false)}>
                  <Button variant="ghost" className="w-full justify-start gap-2 text-muted-foreground">
                    <Wallet className="w-4 h-4" />
                    Wallet
                  </Button>
                </Link>
              </>
            )}
            {isAuthenticated && (
              <Button
                variant="outline"
                className="w-full gap-2 text-muted-foreground"
                onClick={() => { handleSignOut(); setMobileOpen(false); }}
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </Button>
            )}
            <Link to={createPageUrl("Onboarding")} onClick={() => setMobileOpen(false)}>
              <Button className="w-full bg-primary text-primary-foreground mt-2">
                Start Challenge
              </Button>
            </Link>
          </div>
        )}
      </nav>

      {/* Rotating launch-sale banner is paused during the presale to avoid competing messages */}
      {!showPresaleBar && <LaunchSaleBanner />}

      <PauseBanner />

      {/* Page content */}
      {isTerminal ? (
        <div className="flex-1 min-h-0">{children}</div>
      ) : currentPageName === "Landing" ? (
        children
      ) : (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          {children}
        </main>
      )}

      {/* Global footer disclaimer — hidden on full-screen terminal and landing (has its own footer) */}
      {currentPageName !== "TradingTerminal" && currentPageName !== "Landing" && (
        <footer className="border-t border-border bg-card mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-3 text-center">
            <p className="text-[11px] text-muted-foreground/70 flex items-center justify-center gap-1.5">
              <Clock className="w-3 h-3 shrink-0" />
              All dates and times across ChainFunded are shown in <span className="font-medium text-muted-foreground">UTC</span> — matching the daily-loss reset and trading-day count.
            </p>
            <p className="text-xs text-muted-foreground/70 leading-relaxed max-w-4xl mx-auto">
              <span className="font-medium text-muted-foreground">Risk Warning:</span> ChainFunded is a simulated trading challenge platform. All account balances, P&amp;L, and positions are simulated and do not represent real market exposure. The challenge fee is the only real money paid. LP deposits back real trader payouts and are subject to partial or total loss. Challenge fees are non-refundable once paid on-chain. Past performance does not guarantee future results.
            </p>
            <p className="text-xs text-muted-foreground/50 leading-relaxed max-w-4xl mx-auto">
              By using ChainFunded you confirm you have read and agree to the trading rules. Payouts require passing all rule compliance checks, verified autonomously on-chain. Breaching the 5% daily loss or 10% total drawdown limits fails your challenge. ChainFunded is not a regulated financial service. Nothing on this platform constitutes financial advice.
            </p>
            <div className="flex items-center justify-center gap-4 pt-1">
              <Link to="/legal" className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                Legal
              </Link>
              <span className="text-muted-foreground/30 text-xs">·</span>
              <Link to="/terms-of-service" className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                Terms of Service
              </Link>
              <span className="text-muted-foreground/30 text-xs">·</span>
              <Link to="/privacy-policy" className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                Privacy Policy
              </Link>
              <span className="text-muted-foreground/30 text-xs">·</span>
              <Link to={createPageUrl("Support")} className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                Support
              </Link>
              <span className="text-muted-foreground/30 text-xs">·</span>
              <Link to={createPageUrl("Reviews")} className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                Reviews
              </Link>
              <span className="text-muted-foreground/30 text-xs">·</span>
              <Link to={createPageUrl("Whitepaper")} className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                Whitepaper
              </Link>
              <span className="text-muted-foreground/30 text-xs">·</span>
              <a href="/about" className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                About
              </a>
              <span className="text-muted-foreground/30 text-xs">·</span>
              <a href="https://discord.gg/EdYwteDTHq" target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                Discord
              </a>
              <span className="text-muted-foreground/30 text-xs">·</span>
              <a href="https://chainfundeddao.org" target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                ChainFunded DAO
              </a>
              <span className="text-muted-foreground/30 text-xs">·</span>
              <ManageCookiesLink className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors" />
            </div>
          </div>
        </footer>
      )}
      <SupportChat />
    </div>
  );
}
