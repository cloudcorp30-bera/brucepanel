import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../api";

function timeAgo(d) {
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60)    return "just now";
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const PRESETS = [
  "Thanks for reaching out! Let me look into this for you.",
  "Could you please provide more details about the issue?",
  "This has been resolved. Please restart your project and let us know if it persists.",
  "Your project is running normally. Please check your bot token and env vars.",
  "We'll need to escalate this. You'll hear back within 24 hours.",
  "Session resolved ✅ Feel free to open a new one if anything else comes up!",
];

// ─── Chat pane ─────────────────────────────────────────────────────────────
function ChatPane({ session, onBack, onSessionChange }) {
  const [messages, setMsgs]   = useState([]);
  const [liveSession, setLS]  = useState(session);
  const [input, setInput]     = useState("");
  const [sending, setSending] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const bottomRef = useRef(null);

  const loadChat = useCallback(async () => {
    try {
      const r = await api.supportSession(session.id);
      setMsgs(r.messages || []);
      setLS(r.session);
    } catch {}
  }, [session.id]);

  useEffect(() => {
    loadChat();
    const t = setInterval(loadChat, 3000);
    return () => clearInterval(t);
  }, [loadChat]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e) {
    e?.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await api.supportSend(session.id, input.trim());
      setInput(""); setShowPresets(false); await loadChat(); onSessionChange?.();
    } catch (err) { alert(err.message); }
    finally { setSending(false); }
  }

  async function toggleClose() {
    try {
      if (liveSession.status === "open") {
        if (!confirm("Close this session?")) return;
        await api.supportClose(session.id);
      } else {
        await api.supportReopen(session.id);
      }
      await loadChat(); onSessionChange?.();
    } catch (err) { alert(err.message); }
  }

  const isClosed = liveSession.status === "closed";

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="shrink-0 bg-[#111118] border-b border-[#2d2d3e] px-4 py-3 flex items-center gap-3">
        <button onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#1a1a24] border border-[#2d2d3e] text-slate-300 active:scale-95 transition shrink-0">
          ←
        </button>
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
          {session.username?.[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold truncate">
            {session.username}
            <span className="text-slate-500 font-normal text-xs ml-1">· {session.email || "no email"}</span>
          </p>
          <p className="text-slate-500 text-xs truncate">{liveSession.subject}</p>
        </div>
        <button onClick={toggleClose}
          className={`shrink-0 h-8 px-3 rounded-xl text-xs font-medium border transition active:scale-95
            ${isClosed
              ? "border-green-800/60 text-green-400 bg-green-900/20"
              : "border-red-900/60  text-red-400  bg-red-900/20"}`}>
          {isClosed ? "Reopen" : "Close"}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((m, i) => {
          const isAdmin = m.is_admin;
          return (
            <div key={m.id || i} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[82%]">
                {!isAdmin && (
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white">
                      {session.username?.[0]?.toUpperCase()}
                    </div>
                    <span className="text-slate-500 text-[11px]">{session.username} · {timeAgo(m.created_at)}</span>
                  </div>
                )}
                <div className={`px-4 py-3 text-sm leading-relaxed break-words whitespace-pre-wrap
                  ${isAdmin
                    ? "bg-red-700/80 text-white rounded-2xl rounded-br-sm"
                    : "bg-[#1a1a24] border border-[#2d2d3e] text-slate-200 rounded-2xl rounded-bl-sm"}`}>
                  {m.message}
                </div>
                {isAdmin && <p className="text-[10px] text-slate-600 text-right mt-1">You · {timeAgo(m.created_at)}</p>}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Quick reply presets */}
      {showPresets && (
        <div className="shrink-0 border-t border-[#2d2d3e] bg-[#0d0d14] max-h-44 overflow-y-auto">
          <p className="text-slate-600 text-[10px] font-semibold uppercase tracking-wider px-4 pt-3 pb-1">Quick Replies</p>
          {PRESETS.map((p, i) => (
            <button key={i} onClick={() => { setInput(p); setShowPresets(false); }}
              className="w-full text-left text-xs text-slate-300 hover:text-white hover:bg-[#1a1a24] active:bg-[#1a1a24] px-4 py-3 border-b border-[#2d2d3e]/50 last:border-0 transition">
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 bg-[#111118] border-t border-[#2d2d3e] px-3 pt-3 pb-4 safe-bottom">
        {isClosed ? (
          <div className="flex flex-col items-center gap-1.5 py-2">
            <p className="text-slate-500 text-sm">Session closed.</p>
            <button onClick={toggleClose} className="text-blue-400 text-sm font-medium active:opacity-70">Reopen to reply</button>
          </div>
        ) : (
          <div className="flex gap-2 items-end">
            <div className="flex-1 flex flex-col gap-2">
              <textarea
                value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Type your reply…"
                rows={1}
                className="w-full bg-[#1a1a24] border border-[#2d2d3e] focus:border-red-500 rounded-2xl px-4 py-3 text-white text-sm resize-none max-h-32 focus:outline-none transition"
                style={{ fieldSizing: "content" }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={send} disabled={sending || !input.trim()}
                className="w-12 h-12 shrink-0 rounded-2xl bg-red-700 hover:bg-red-600 disabled:opacity-40 flex items-center justify-center text-white text-xl active:scale-95 transition">
                {sending ? <span className="animate-spin text-sm">↻</span> : "↑"}
              </button>
              <button onClick={() => setShowPresets(v => !v)}
                className={`w-12 h-10 rounded-2xl border flex items-center justify-center text-base active:scale-95 transition
                  ${showPresets ? "bg-[#2d2d3e] border-[#3d3d4e] text-white" : "bg-[#1a1a24] border-[#2d2d3e] text-slate-400"}`}>
                💬
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Session list ──────────────────────────────────────────────────────────
function SessionList({ sessions, stats, filter, onFilterChange, onSelect, loading }) {
  return (
    <div className="flex flex-col h-full bg-[#111118]">
      {/* Stats bar */}
      <div className="shrink-0 grid grid-cols-3 divide-x divide-[#2d2d3e] border-b border-[#2d2d3e]">
        {[
          { l: "Open",   v: stats.open,   c: "text-green-400" },
          { l: "Unread", v: stats.unread, c: "text-red-400"   },
          { l: "Closed", v: stats.closed, c: "text-slate-400" },
        ].map(s => (
          <div key={s.l} className="flex flex-col items-center justify-center py-3">
            <span className={`text-lg font-bold ${s.c}`}>{s.v ?? "—"}</span>
            <span className="text-slate-600 text-[10px]">{s.l}</span>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="shrink-0 flex border-b border-[#2d2d3e]">
        {[["open","Open"],["closed","Closed"],["","All"]].map(([f, label]) => (
          <button key={f} onClick={() => onFilterChange(f)}
            className={`flex-1 py-3 text-xs font-semibold transition
              ${filter === f
                ? "text-blue-400 border-b-2 border-blue-400 bg-blue-900/10"
                : "text-slate-500 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-px">
            {[1,2,3].map(i => (
              <div key={i} className="px-4 py-4 border-b border-[#2d2d3e]/50 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#2d2d3e]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-[#2d2d3e] rounded w-24" />
                    <div className="h-2.5 bg-[#2d2d3e] rounded w-40" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-600 text-sm gap-2">
            <span className="text-3xl">🎉</span>
            <span>No {filter || ""} sessions</span>
          </div>
        ) : (
          sessions.map(s => (
            <button key={s.id} onClick={() => onSelect(s)}
              className="w-full text-left px-4 py-4 border-b border-[#2d2d3e]/50 hover:bg-[#1a1a24] active:bg-[#1a1a24] transition">
              <div className="flex items-start gap-3">
                {/* Avatar with unread badge */}
                <div className="relative shrink-0">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
                    {s.username?.[0]?.toUpperCase()}
                  </div>
                  {s.unread_admin > 0 && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 border-2 border-[#111118] flex items-center justify-center text-white text-[8px] font-bold">
                      {s.unread_admin > 9 ? "9+" : s.unread_admin}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p className="text-white text-sm font-semibold truncate">{s.username}</p>
                    <p className="text-slate-600 text-[10px] shrink-0">{timeAgo(s.updated_at)}</p>
                  </div>
                  <p className="text-slate-300 text-xs truncate mb-1">{s.subject}</p>
                  {s.last_message && (
                    <p className="text-slate-600 text-[10px] truncate">{s.last_message}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border capitalize
                      ${s.status === "open" ? "text-green-400 border-green-900 bg-green-900/20" : "text-slate-500 border-[#2d2d3e]"}`}>
                      {s.status}
                    </span>
                    <span className="text-slate-700 text-[9px]">{s.message_count} msgs</span>
                  </div>
                </div>
                <span className="text-slate-600 text-base shrink-0">›</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main AdminSupport component ───────────────────────────────────────────
export default function AdminSupport() {
  const [sessions, setSessions] = useState([]);
  const [stats, setStats]       = useState({});
  const [filter, setFilter]     = useState("open");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading]   = useState(true);

  async function loadSessions() {
    try {
      const [s, st] = await Promise.all([
        api.adminSupportSessions(filter),
        api.adminSupportStats(),
      ]);
      setSessions(s.sessions || []);
      setStats(st);
    } catch {} finally { setLoading(false); }
  }

  useEffect(() => { setLoading(true); loadSessions(); }, [filter]);

  // On mobile: show chat full-screen on top; on desktop: split view side-by-side
  return (
    <div className="relative">
      {/* ── Mobile: full-screen chat overlay ── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex flex-col lg:hidden">
          <ChatPane
            session={selected}
            onBack={() => { setSelected(null); loadSessions(); }}
            onSessionChange={loadSessions}
          />
        </div>
      )}

      {/* ── Desktop: split view ── */}
      <div className="hidden lg:flex border border-[#2d2d3e] rounded-xl overflow-hidden"
           style={{ height: "calc(100vh - 180px)" }}>
        {/* Left: session list */}
        <div className="w-80 shrink-0 flex flex-col border-r border-[#2d2d3e]">
          <SessionList
            sessions={sessions} stats={stats} filter={filter} loading={loading}
            onFilterChange={f => { setFilter(f); setSelected(null); }}
            onSelect={setSelected}
          />
        </div>
        {/* Right: chat or empty */}
        <div className="flex-1 flex flex-col">
          {selected
            ? <ChatPane session={selected} onBack={() => setSelected(null)} onSessionChange={loadSessions} />
            : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-3">
                <span className="text-5xl">💬</span>
                <p className="text-sm">Select a session to respond</p>
                {(stats.unread || 0) > 0 && (
                  <p className="text-red-400 text-xs">{stats.unread} session{stats.unread !== 1 ? "s" : ""} need your response</p>
                )}
              </div>
            )
          }
        </div>
      </div>

      {/* ── Mobile: session list ── */}
      <div className="lg:hidden flex flex-col" style={{ minHeight: "60vh" }}>
        <SessionList
          sessions={sessions} stats={stats} filter={filter} loading={loading}
          onFilterChange={f => { setFilter(f); setSelected(null); }}
          onSelect={setSelected}
        />
      </div>
    </div>
  );
}
