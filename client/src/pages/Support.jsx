import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";

const STATUS_PILL = {
  open:   "bg-green-900/40 text-green-400 border border-green-800/60",
  closed: "bg-[#1a1a24] text-slate-500 border border-[#2d2d3e]",
};

function timeAgo(d) {
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60)    return "just now";
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ─── Chat view (full-screen on all sizes) ─────────────────────────────────
function ChatView({ session, onBack }) {
  const [messages, setMsgs]   = useState([]);
  const [liveSession, setLS]  = useState(session);
  const [input, setInput]     = useState("");
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await api.supportSession(session.id);
      setMsgs(r.messages || []);
      setLS(r.session);
    } catch {}
  }, [session.id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e) {
    e?.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await api.supportSend(session.id, input.trim());
      setInput("");
      await load();
    } catch (err) { alert(err.message); }
    finally { setSending(false); }
  }

  async function toggleClose() {
    if (liveSession.status === "open") {
      if (!confirm("Close this session?")) return;
      setClosing(true);
      try { await api.supportClose(session.id); await load(); onBack?.(); }
      catch (err) { alert(err.message); }
      finally { setClosing(false); }
    } else {
      try { await api.supportReopen(session.id); await load(); }
      catch (err) { alert(err.message); }
    }
  }

  const isClosed = liveSession.status === "closed";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0f]">
      {/* ── Top bar ── */}
      <div className="shrink-0 bg-[#111118] border-b border-[#2d2d3e] px-4 py-3 flex items-center gap-3 safe-top">
        <button onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#1a1a24] border border-[#2d2d3e] text-slate-300 active:scale-95 transition">
          ←
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate">{liveSession.subject}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_PILL[liveSession.status]}`}>
              {liveSession.status}
            </span>
            <span className="text-slate-600 text-[10px]">{timeAgo(liveSession.created_at)}</span>
          </div>
        </div>
        <button onClick={toggleClose} disabled={closing}
          className={`shrink-0 h-9 px-3 rounded-xl text-xs font-medium border transition active:scale-95
            ${isClosed
              ? "border-green-800/60 text-green-400 bg-green-900/20"
              : "border-red-900/60  text-red-400  bg-red-900/20"}`}>
          {closing ? "…" : isClosed ? "Reopen" : "Close"}
        </button>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-slate-600 text-sm py-10 animate-pulse">Loading…</div>
        )}
        {messages.map((m, i) => {
          const mine = !m.is_admin;
          return (
            <div key={m.id || i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[82%]">
                {!mine && (
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-[10px] font-bold text-white">A</div>
                    <span className="text-slate-500 text-[11px]">Support · {timeAgo(m.created_at)}</span>
                  </div>
                )}
                <div className={`px-4 py-3 text-sm leading-relaxed break-words whitespace-pre-wrap
                  ${mine
                    ? "bg-blue-600 text-white rounded-2xl rounded-br-sm"
                    : "bg-[#1a1a24] border border-[#2d2d3e] text-slate-200 rounded-2xl rounded-bl-sm"}`}>
                  {m.message}
                </div>
                {mine && <p className="text-slate-600 text-[10px] text-right mt-1">{timeAgo(m.created_at)}</p>}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* ── Input area (pinned to bottom) ── */}
      <div className="shrink-0 bg-[#111118] border-t border-[#2d2d3e] px-3 pt-3 pb-4 safe-bottom">
        {isClosed ? (
          <div className="flex flex-col items-center gap-2 py-2">
            <p className="text-slate-500 text-sm">This session is closed.</p>
            <button onClick={toggleClose}
              className="text-blue-400 text-sm font-medium active:opacity-70">Tap to reopen</button>
          </div>
        ) : (
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Type a message…"
              rows={1}
              className="flex-1 bg-[#1a1a24] border border-[#2d2d3e] focus:border-blue-500 rounded-2xl px-4 py-3 text-white text-sm resize-none max-h-32 focus:outline-none transition"
              style={{ fieldSizing: "content" }}
            />
            <button
              onClick={send}
              disabled={sending || !input.trim()}
              className="w-12 h-12 shrink-0 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 flex items-center justify-center text-white text-xl active:scale-95 transition">
              {sending ? <span className="text-sm animate-spin">↻</span> : "↑"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── New session modal ─────────────────────────────────────────────────────
function NewSessionModal({ onClose, onCreate }) {
  const [subject, setSubject]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!subject.trim()) return;
    setLoading(true); setError("");
    try {
      const r = await api.supportCreate(subject.trim());
      onCreate?.(r.sessionId, subject.trim());
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full sm:max-w-md bg-[#111118] border border-[#2d2d3e] rounded-t-2xl sm:rounded-2xl p-5 safe-bottom">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-semibold text-base">New Support Request</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-[#1a1a24] text-slate-400 text-lg active:scale-95">✕</button>
        </div>
        {error && (
          <div className="bg-red-900/30 border border-red-700/60 text-red-400 rounded-xl px-4 py-3 mb-4 text-sm">{error}</div>
        )}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-slate-400 text-sm block mb-1.5">What do you need help with?</label>
            <input
              value={subject} onChange={e => setSubject(e.target.value)}
              required maxLength={200} autoFocus
              placeholder="e.g. My bot keeps restarting, billing issue, file upload help…"
              className="w-full bg-[#1a1a24] border border-[#2d2d3e] focus:border-blue-500 rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition" />
          </div>
          <p className="text-slate-600 text-xs">You can have up to 3 open sessions at once.</p>
          <button type="submit" disabled={loading || !subject.trim()}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-3.5 rounded-xl text-sm font-semibold active:scale-[.98] transition">
            {loading ? "Opening…" : "Open Support Chat →"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Main support page ─────────────────────────────────────────────────────
export default function Support() {
  const [sessions, setSessions]   = useState([]);
  const [loading,  setLoading]    = useState(true);
  const [selected, setSelected]   = useState(null);
  const [showNew,  setShowNew]    = useState(false);
  const nav = useNavigate();

  async function load() {
    try { const r = await api.supportSessions(); setSessions(r.sessions || []); }
    catch {} finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleCreated(sessionId, subject) {
    setShowNew(false);
    await load();
    setSessions(prev => {
      const found = prev.find(s => s.id === sessionId);
      if (found) setSelected(found);
      else setSelected({ id: sessionId, subject, status: "open", created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      return prev;
    });
  }

  // Show chat view (full screen overlay)
  if (selected) {
    return <ChatView session={selected} onBack={() => { setSelected(null); load(); }} />;
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {showNew && <NewSessionModal onClose={() => setShowNew(false)} onCreate={handleCreated} />}

      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-[#111118] border-b border-[#2d2d3e] px-4 py-3 flex items-center gap-3 safe-top">
        <button onClick={() => nav("/")}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#1a1a24] border border-[#2d2d3e] text-slate-300 active:scale-95 transition">
          ←
        </button>
        <div className="flex-1">
          <h1 className="text-white font-bold text-base">💬 Support</h1>
          <p className="text-slate-600 text-[11px]">Bera Tech help desk</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="h-9 px-4 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-sm font-semibold rounded-xl transition">
          + New
        </button>
      </div>

      <div className="px-4 py-5 max-w-2xl mx-auto space-y-5">

        {/* ── Quick links ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: "💬", label: "WhatsApp",    href: "https://wa.me/254787527753", external: true },
            { icon: "📊", label: "Status Page", href: "/status", external: false },
            { icon: "💳", label: "Subscribe",   href: "/subscribe", external: false },
          ].map(l => (
            l.external
              ? <a key={l.label} href={l.href} target="_blank" rel="noreferrer"
                  className="bg-[#111118] border border-[#2d2d3e] rounded-2xl py-4 flex flex-col items-center gap-1.5 active:scale-[.96] transition">
                  <span className="text-xl">{l.icon}</span>
                  <span className="text-slate-400 text-[11px] font-medium">{l.label}</span>
                </a>
              : <Link key={l.label} to={l.href}
                  className="bg-[#111118] border border-[#2d2d3e] rounded-2xl py-4 flex flex-col items-center gap-1.5 active:scale-[.96] transition">
                  <span className="text-xl">{l.icon}</span>
                  <span className="text-slate-400 text-[11px] font-medium">{l.label}</span>
                </Link>
          ))}
        </div>

        {/* ── Sessions list ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold text-sm">Your Sessions</h2>
            <button onClick={load} className="text-slate-600 text-xs active:text-white transition">↻ Refresh</button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1,2].map(i => (
                <div key={i} className="h-20 bg-[#111118] border border-[#2d2d3e] rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-[#2d2d3e] rounded-2xl">
              <p className="text-4xl mb-3">💬</p>
              <p className="text-slate-400 text-sm font-medium">No support sessions yet</p>
              <p className="text-slate-600 text-xs mt-1 mb-5">Open one and we'll get back to you soon</p>
              <button onClick={() => setShowNew(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl text-sm font-semibold active:scale-[.97] transition">
                Open a Request
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {sessions.map(s => (
                <button key={s.id} onClick={() => setSelected(s)}
                  className="w-full text-left bg-[#111118] border border-[#2d2d3e] hover:border-[#3d3d4e] active:scale-[.98] rounded-2xl px-4 py-4 transition">
                  <div className="flex items-start gap-3">
                    {/* Unread dot or status */}
                    <div className="mt-0.5 shrink-0">
                      {s.unread_user > 0
                        ? <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse mt-1" />
                        : <div className="w-2.5 h-2.5 rounded-full bg-[#2d2d3e] mt-1" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-white text-sm font-semibold truncate">{s.subject}</p>
                        {s.unread_user > 0 && (
                          <span className="shrink-0 bg-blue-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                            {s.unread_user}
                          </span>
                        )}
                      </div>
                      {s.last_message && (
                        <p className="text-slate-500 text-xs truncate">{s.last_message}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_PILL[s.status]}`}>{s.status}</span>
                        <span className="text-slate-700 text-[10px]">{timeAgo(s.updated_at)}</span>
                      </div>
                    </div>
                    <span className="text-slate-600 text-sm mt-1 shrink-0">›</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Footer note ── */}
        <div className="text-center py-4 space-y-1">
          <p className="text-slate-700 text-xs">Avg response time: <span className="text-slate-500">under 2 hours</span></p>
          <p className="text-slate-700 text-xs">Support hours: <span className="text-slate-500">8am – 10pm EAT</span></p>
          <a href="https://wa.me/254787527753" target="_blank" rel="noreferrer"
            className="text-green-500 text-xs hover:underline block mt-1">Urgent? WhatsApp us →</a>
        </div>
      </div>
    </div>
  );
}
