/**
 * ShareTradeModal — share a closed trade two ways:
 *   1. Post to the ChainFunded community (#share-trades) — requires a
 *      community session (signs once if needed).
 *   2. Share externally — X, native share sheet, or copy a caption + link.
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { X, MessageCircle, Copy, Check, Share2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useCommunityToken } from "@/hooks/useCommunityToken";
import { communityApi } from "@/lib/communityApi";

function XLogo({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817-5.97 6.817H1.674l7.73-8.835L1.25 2.25h6.83l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

function buildCaption(trade) {
  const dir = (trade.direction === "long" ? "Long" : "Short");
  const lev = (trade.leverage || 1) > 1 ? ` ${trade.leverage}×` : "";
  const margin = (trade.leverage || 1) > 0 ? (trade.size || 0) / (trade.leverage || 1) : (trade.size || 0);
  const pct = typeof trade.pnl_pct === "number"
    ? trade.pnl_pct
    : (margin > 0 && typeof trade.pnl === "number" ? (trade.pnl / margin) * 100 : null);
  const sign = (pct ?? 0) >= 0 ? "+" : "";
  const result = pct != null ? `${sign}${pct.toFixed(2)}%` : (trade.pnl >= 0 ? "in profit" : "");
  const emoji = (pct ?? trade.pnl ?? 0) >= 0 ? "📈" : "📉";
  return `${dir}${lev} ${trade.symbol} ${result} on ChainFunded ${emoji}`;
}

function ShareRow({ icon: Icon, label, sub, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-border bg-secondary/40 hover:bg-secondary text-left transition-colors disabled:opacity-50"
    >
      <span className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        {sub && <span className="block text-[11px] text-muted-foreground">{sub}</span>}
      </span>
    </button>
  );
}

export default function ShareTradeModal({ trade, onClose }) {
  const { token, signIn, signing } = useCommunityToken();
  const [posting, setPosting] = useState(false);
  const [copied, setCopied] = useState(false);

  const caption = buildCaption(trade);
  const shareUrl = typeof window !== "undefined" ? window.location.origin : "https://chainfunded.io";
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const postToCommunity = async () => {
    if (posting) return;
    setPosting(true);
    try {
      let active = token;
      if (!active) active = await signIn();
      if (!active) return;
      await communityApi.shareTrade(active, { tradeId: trade.id });
      toast.success("Shared to #share-trades");
      onClose();
    } catch (err) {
      toast.error("Couldn't share", { description: err?.message });
    } finally {
      setPosting(false);
    }
  };

  const shareToX = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title: "ChainFunded", text: caption, url: shareUrl });
      onClose();
    } catch { /* user dismissed */ }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${caption}\n${shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Share trade</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 pt-3">
          <p className="text-xs text-muted-foreground bg-secondary/40 border border-border rounded-lg px-3 py-2 leading-snug">
            {caption}
          </p>
        </div>

        <div className="p-4 space-y-2">
          <ShareRow
            icon={MessageCircle}
            label="Post to ChainFunded community"
            sub="Share in #share-trades"
            onClick={postToCommunity}
            disabled={posting || signing}
          />
          <ShareRow
            icon={XLogo}
            label="Share on X"
            sub="Opens a pre-filled post"
            onClick={shareToX}
          />
          {canNativeShare && (
            <ShareRow
              icon={Share2}
              label="More…"
              sub="Open your device share sheet"
              onClick={nativeShare}
            />
          )}
          <ShareRow
            icon={copied ? Check : Copy}
            label={copied ? "Copied!" : "Copy caption + link"}
            onClick={copy}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
