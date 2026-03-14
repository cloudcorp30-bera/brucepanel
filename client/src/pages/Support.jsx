import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

const STATUS_COLORS = { open: "text-green-400 bg-green-900/20 border-green-800", closed: "text-slate-400 bg-[#1a1a24] border-[#2d2d3e]" };

function timeAgo(d) {
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60)  return "just now";
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

// ─── Individual chat view ──────────────────────────────────────────────────
function ChatView({ session, onBack, onClose, onReopen }) {
  const [messages, setMsgs]     = useState([]);
  const [input, setInput]       = useState("");
  const [sending, setSending]   = useState(false);
  const [closing, setClosing]   = useState(false);
  const [liveSession, setLive]  = useState(session);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const me = JSON.parse(localStorage.getItem("bp_user") || "{}");

  const load = useCallback(async () => {
    try {
      const r = await api.supportSession(session.id);
      setMsgs(r.messages || []);
      setLive(r.session);
    } catch {}
  }, [session.id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await api.supportSend(session.id, input.trim());
      setInput(""); await load();
    } catch (e) { alert(e.message); }
    setSending(false);
  }

  async function closeSession() {
    if (!confirm("Close this support session?")) return;
    setClosing(true);
    try { await api.supportClose(session.id); await load(); onClose?.(); }
    catch (e) { alert(e.message); }
    setClosing(false);
  }

  async function reopenSession() {
    try { await api.supportReopen(session.id); await load(); onReopen?.(); }
    catch (e) { alert(e.message); }
  }

  const isClosed = liveSession.status === "closed";

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="border-b border-[#2d2d3e] bg-[#111118] px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-white transition text-lg shrink-0">←</button>
        <div className="flex-1 min-w-0">
          <div className="text-white font-semibold text-sm truncate">{liveSession.subject}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize ${STATUS_COLORS[liveSession.status]}`}>{liveSession.status}</span>
            <span className="text-slate-600 text-xs">Opened {timeAgo(liveSession.created_at)}</span>
          </div>
        </div>
        {!isClosed
          ? <button onClick={closeSession} disabled={closing} className="text-red-400 hover:text-red-300 text-xs border border-red-900 hover:bg-red-900/20 px-3 py-1.5 rounded-lg transition">
              {closing ? "Closing..." : "Close"}
            </button>
          : <button onClick={reopenSession} className="text-green-400 hover:text-green-300 text-xs border border-green-900 hover:bg-green-900/20 px-3 py-1.5 rounded-lg transition">
              Reopen
            </button>
        }
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => {
          const isMe = !m.is_admin;
          return (
            <div key={m.id || i} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] sm:max-w-[65%]`}>
                {!isMe && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-white text-[9px] font-bold">A</div>
                    <span className="text-slate-500 text-[10px]">Support · {timeAgo(m.created_at)}</span>
                  </div>
                )}
                <div className={`px-4 py-2.5 rounded-2xl text-sm break-words whitespace-pre-wrap
                  ${isMe
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-[#1a1a24] border border-[#2d2d3e] text-slate-200 rounded-bl-sm"
                  }`}>
                  {m.message}
                </div>
                {isMe && <div className="text-slate-600 text-[10px] text-right mt-1">{timeAgo(m.created_at)}</div>}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-[#2d2d3e] bg-[#111118] p-3">
        {isClosed ? (
          <div className="text-center py-2">
            <p className="text-slate-500 text-sm">This session is closed.</p>
            <button onClick={reopenSession} className="text-blue-400 text-xs hover:underline mt-1">Reopen session</button>
          </div>
        ) : (
          <form onSubmit={send} className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(e); } }}
              placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
              rows={2}
              className="flex-1 bg-[#1a1a24] border border-[#2d2d3e] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
            <button type="submit" disabled={sending || !input.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-4 rounded-xl text-sm font-medium transition self-end py-2.5">
              {sending ? "..." : "Send"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Main Support Page ─────────────────────────────────────────────────────
export default function Support() {
  const [sessions, setSessions]     = useState([]);
  const [selected, setSelected]     = useState(null);
  const [loading, setLoading]       = useState(true);
  const [showNew, setShowNew]       = useState(false);
  const [subject, setSubject]       = useState("");
  const [creating, setCreating]     = useState(false);
  const [createError, setCreateErr] = useState("");

  async function load() {
    try { const r = await api.supportSessions(); setSessions(r.sessions || []); }
    catch {} finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function createSession(e) {
    e.preventDefault(); setCreating(true); setCreateErr("");
    try {
      const r = await api.supportCreate(subject);
      setSubject(""); setShowNew(false);
      await load();
      // Auto-open the new session
      const newSession = sessions.find(s => s.id === r.sessionId) || { id: r.sessionId, subject, status: "open", created_at: new Date().toISOString() };
      setTimeout(() => { load().then(() => setSessions(s => { const found = s.find(x => x.id === r.sessionId); if (found) setSelected(found); return s; })); }, 500);
    } catch (e) { setCreateErr(e.message); }
    setCreating(false);
  }

  if (selected) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
        <ChatView
          session={selected}
          onBack={() => { setSelected(null); load(); }}
          onClose={() => load()}
          onReopen={() => load()}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Header */}
      <div className="border-b border-[#2d2d3e] bg-[#111118] px-4 sm:px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">💬 Support</h1>
          <p className="text-xs text-slate-500 mt-0.5">Get help from the Bera Tech team</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/" className="text-slate-400 hover:text-white text-sm transition">← Dashboard</Link>
          <button onClick={() => setShowNew(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
            + New Request
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">

        {/* New session form */}
        {showNew && (
          <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">New Support Request</h3>
              <button onClick={() => { setShowNew(false); setCreateErr(""); }} className="text-slate-500 hover:text-white text-xl">✕</button>
            </div>
            {createError && <div className="bg-red-900/30 border border-red-700 text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">{createError}</div>}
            <form onSubmit={createSession} className="space-y-3">
              <div>
                <label className="text-slate-400 text-sm block mb-1">What do you need help with? *</label>
                <input value={subject} onChange={e => setSubject(e.target.value)} required maxLength={200}
                  placeholder="e.g. My bot keeps restarting, Payment not working, How do I upload files?"
                  className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 text-sm" />
              </div>
              <div className="text-slate-600 text-xs">You can have up to 3 open sessions at once. After submitting, describe your issue in detail in the chat.</div>
              <div className="flex gap-3">
                <button type="submit" disabled={creating}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition">
                  {creating ? "Opening..." : "Open Support Chat"}
                </button>
                <button type="button" onClick={() => { setShowNew(false); setCreateErr(""); }}
                  className="text-slate-400 hover:text-white px-4 py-2 text-sm transition">Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* Quick links */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { icon:"📚", label:"Documentation",  href:"#" },
            { icon:"💬", label:"WhatsApp",       href:"https://wa.me/254787527753" },
            { icon:"📊", label:"Status Page",    href:"/status" },
          ].map(l => (
            <a key={l.label} href={l.href} target="_blank" rel="noreferrer"
              className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-4 text-center hover:border-[#3d3d4e] transition group">
              <div className="text-2xl mb-1">{l.icon}</div>
              <div className="text-slate-400 group-hover:text-white text-xs transition">{l.label}</div>
            </a>
          ))}
        </div>

        {/* Sessions list */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold">Your Support Sessions</h2>
            <button onClick={load} className="text-slate-500 hover:text-white text-sm transition">↻ Refresh</button>
          </div>

          {loading ? (
            <div className="text-slate-600 text-center py-12 animate-pulse text-sm">Loading...</div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-[#2d2d3e] rounded-xl">
              <p className="text-4xl mb-3">💬</p>
              <p className="text-slate-400 text-sm">No support sessions yet.</p>
              <p className="text-slate-600 text-xs mt-1 mb-4">Open a new one and our team will get back to you.</p>
              <button onClick={() => setShowNew(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg text-sm transition">Open First Request</button>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map(s => (
                <div key={s.id} onClick={() => setSelected(s)}
                  className="bg-[#111118] border border-[#2d2d3e] hover:border-[#3d3d4e] rounded-xl px-5 py-4 cursor-pointer transition group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-white font-medium text-sm truncate">{s.subject}</span>
                        {s.unread_user > 0 && (
                          <span className="bg-blue-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shrink-0">
                            {s.unread_user}
                          </span>
                        )}
                      </div>
                      {s.last_message && <p className="text-slate-500 text-xs truncate">{s.last_message}</p>}
                      <p className="text-slate-700 text-[10px] mt-1">{timeAgo(s.updated_at)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded border font-medium capitalize ${STATUS_COLORS[s.status]}`}>{s.status}</span>
                      <span className="text-slate-600 text-[10px] group-hover:text-slate-400 transition">Open →</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-10 text-center text-slate-700 text-xs">
          <p>Average response time: <strong className="text-slate-500">under 2 hours</strong> · Support hours: 8am–10pm EAT</p>
          <p className="mt-1">For urgent issues reach us on <a href="https://wa.me/254787527753" target="_blank" rel="noreferrer" className="text-green-500 hover:underline">WhatsApp</a></p>
        </div>
      </div>
    </div>
  );
}
