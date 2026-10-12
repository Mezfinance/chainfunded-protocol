/**
 * SupportChat — AI-powered support chat widget.
 *
 * Floating chat bubble on all pages. Can be collapsed into the right
 * edge of the screen via a swipe or dismiss button, leaving only a
 * small tab to bring it back. Sends messages to the Vercel API route
 * /api/support-agent (Claude Haiku).
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, ExternalLink, ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import ChatMarkdown from "@/components/ChatMarkdown";

const DISCORD_LINK = "https://discord.gg/EdYwteDTHq";
const SUPPORT_API = import.meta.env.VITE_SUPPORT_API_URL || "/api/support-agent";

const DEFAULT_BOTTOM = 24; // px — matches bottom-6
const MIN_BOTTOM = 24;

export default function SupportChat() {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [bottomY, setBottomY] = useState(DEFAULT_BOTTOM);
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! I'm the ChainFunded support assistant. How can I help you today?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // Allow the mobile nav (and anywhere else) to open the chat via a global
  // event — on mobile the floating bubble is hidden in favour of a nav button.
  useEffect(() => {
    const handler = () => { setCollapsed(false); setOpen(true); };
    window.addEventListener("open-support-chat", handler);
    return () => window.removeEventListener("open-support-chat", handler);
  }, []);

  // ── Vertical drag ────────────────────────────────────────────────────
  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartBottom = useRef(0);

  const onPointerDown = useCallback((e) => {
    isDragging.current = true;
    dragStartY.current = e.clientY;
    dragStartBottom.current = bottomY;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [bottomY]);

  const onPointerMove = useCallback((e) => {
    if (!isDragging.current) return;
    const delta = dragStartY.current - e.clientY;
    const maxBottom = window.innerHeight - 80;
    setBottomY(Math.max(MIN_BOTTOM, Math.min(maxBottom, dragStartBottom.current + delta)));
  }, []);

  const onPointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = messages.filter(m => m.role !== "system").map(m => ({ role: m.role, content: m.content }));
      const resp = await fetch(SUPPORT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const data = await resp.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.reply || "Sorry, I couldn't process that." }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: `I'm having trouble connecting. Please try again or reach out on Discord: ${DISCORD_LINK}` }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Collapsed state: small tab on right edge (desktop only) ───────────
  if (collapsed) {
    return (
      <div className="fixed right-0 z-50 hidden nav:flex items-center" style={{ bottom: bottomY }}>
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="flex items-center justify-center w-4 h-8 cursor-grab active:cursor-grabbing text-white/50 hover:text-white touch-none"
        >
          <GripVertical className="w-3 h-3" />
        </div>
        <button
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-1 pl-1.5 pr-1 h-14 rounded-l-lg bg-primary text-white shadow-lg hover:bg-primary/90 transition-colors"
          aria-label="Show support chat"
        >
          <ChevronLeft className="w-4 h-4" />
          <MessageCircle className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // ── Bubble state: floating button (desktop only) ──────────────────────
  if (!open) {
    return (
      <div className="fixed right-6 z-50 hidden nav:flex items-center gap-1.5" style={{ bottom: bottomY }}>
        {/* Drag handle */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="flex items-center justify-center w-4 h-7 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground touch-none rounded"
        >
          <GripVertical className="w-3 h-3" />
        </div>
        {/* Collapse button */}
        <button
          onClick={() => setCollapsed(true)}
          className="w-6 h-6 rounded-full bg-card border border-border text-muted-foreground hover:text-foreground shadow-md flex items-center justify-center transition-colors"
          aria-label="Hide support chat"
        >
          <ChevronRight className="w-3 h-3" />
        </button>
        {/* Chat bubble */}
        <button
          onClick={() => setOpen(true)}
          className="relative w-11 h-11 rounded-full bg-primary text-white shadow-lg hover:bg-primary/90 transition-all flex items-center justify-center"
          aria-label="Open support chat"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-white" />
        </button>
      </div>
    );
  }

  // ── Open state: chat panel ────────────────────────────────────────────
  return (
    <div className="fixed right-6 bottom-6 z-50 w-[380px] max-w-[calc(100vw-32px)] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden" style={{ height: 520, maxHeight: 'calc(100vh - 48px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-primary/5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <MessageCircle className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">Support</div>
            <div className="text-xs text-muted-foreground">Powered by AI &middot; Escalates to humans</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setOpen(false); setCollapsed(true); }}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
            title="Minimize"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ overscrollBehavior: "contain" }}>
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed break-words ${
                m.role === "user"
                  ? "bg-primary text-white rounded-br-sm whitespace-pre-wrap"
                  : "bg-secondary text-foreground rounded-bl-sm"
              }`}
            >
              {m.role === "user" ? m.content : <ChatMarkdown>{m.content}</ChatMarkdown>}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-secondary rounded-xl px-3.5 py-2.5 rounded-bl-sm">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Discord escalation */}
      <div className="px-4 py-2 border-t border-border bg-secondary/50">
        <a
          href={DISCORD_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          Need a human? Join our Discord <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-border">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
            disabled={loading}
            maxLength={500}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="w-9 h-9 rounded-lg bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
