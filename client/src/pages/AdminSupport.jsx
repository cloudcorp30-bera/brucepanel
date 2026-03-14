import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../api";

function timeAgo(d) {
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60)   return "just now";
  if (s < 3600)  return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

// Quick reply presets
const PRESETS = [
  "Thanks for reaching out! Let me look into this for you.",
  "Could you please provide more details about the issue?",
  "This has been resolved on our end. Please restart your project and let us know if it persists.",
  "Your project has been checked and is running normally. Please check your bot token and env vars.",
  "We'll need to escalate this. You'll hear back within 24 hours.",
  "Session resolved ✅ Feel free to open a new one if anything else comes up!",
];

export default function AdminSupport() {
  const [sessions, setSessions]   = useState([]);
  const [stats, setStats]         = useState({});
  const [filter, setFilter]       = useState("open");
  const [selected, setSelected]   = useState(null);
  const [messages, setMsgs]       = useState([]);
  const [liveSession, setLiveSes] = useState(null);
  const [input, setInput]         = useState("");
  const [sending, setSending]     = useState(false);
  const [loading, setLoading]     = useState(true);
  const [showPresets, setPresets] = useState(false);
  const bottomRef = useRef(null);
  const pollRef   = useRef(null);

  async function loadSessions() {
    try {
      const [s, st] = await Promise.all([
        api.adminSupportSessions(filter),
        api.adminSupportStats(),
      ]);
      setSessions(s.sessions || []); setStats(st);
    } catch {}
    setLoading(false);
  }

  async function loadChat(session) {
    try {
      const r = await api.supportSession(session.id);
      setMsgs(r.messages || []); setLiveSes(r.session);
    } catch {}
  }

  useEffect(() => { loadSessions(); }, [filter]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (selected) {
      loadChat(selected);
      pollRef.current = setInterval(() => loadChat(selected), 3000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selected]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function send(e) {
    e.preventDefault();
    if (!input.trim() || sending || !selected) return;
    setSending(true);
    try {
      await api.supportSend(selected.id, input.trim());
      setInput(""); setShowPresets(false); await loadChat(selected); loadSessions();
    } catch (e) { alert(e.message); }
    setSending(false);
  }

  async function closeSession(id) {
    if (!confirm("Close this session?")) return;
    try { await api.supportClose(id); await loadChat({ id }); loadSessions(); }
    catch (e) { alert(e.message); }
  }

  async function reopenSession(id) {
    try { await api.supportReopen(id); await loadChat({ id }); loadSessions(); }
    catch (e) { alert(e.message); }
  }

  const isClosed = liveSession?.status === "closed";

  return (
    <div className="flex h-[calc(100vh-120px)] border border-[#2d2d3e] rounded-xl overflow-hidden bg-[#0a0a0f]">

      {/* ── LEFT: session list ─────────────────────────── */}
      <div className={`${selected ? "hidden sm:flex" : "flex"} flex-col w-full sm:w-80 border-r border-[#2d2d3e] bg-[#111118]`}>
        {/* Stats bar */}
        <div className="px-4 py-3 border-b border-[#2d2d3e] grid grid-cols-3 gap-2 text-center">
          {[
            { l:"Open",    v:stats.open,     c:"text-green-400" },
            { l:"Unread",  v:stats.unread,   c:"text-red-400"   },
            { l:"Total",   v:(stats.open||0)+(stats.closed||0), c:"text-slate-300" },
          ].map(s => (
            <div key={s.l}>
              <div className={`text-lg font-bold ${s.c}`}>{s.v ?? "—"}</div>
              <div className="text-slate-600 text-[10px]">{s.l}</div>
            </div>
          ))}
        </div>

        {/* Filter */}
        <div className="flex border-b border-[#2d2d3e]">
          {["open","closed",""].map((f, i) => (
            <button key={i} onClick={() => { setFilter(f); setSelected(null); }}
              className={`flex-1 py-2.5 text-xs font-medium transition ${filter===f?"text-blue-400 border-b-2 border-blue-400 bg-blue-900/10":"text-slate-500 hover:text-white"}`}>
              {f==="open"?"Open":f==="closed"?"Closed":"All"}
            </button>
          ))}
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center py-12 text-slate-600 text-xs animate-pulse">Loading...</div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12 text-slate-600 text-sm">No {filter} sessions</div>
          ) : (
            sessions.map(s => (
              <div key={s.id} onClick={() => setSelected(s)}
                className={`px-4 py-3.5 border-b border-[#2d2d3e]/50 cursor-pointer transition hover:bg-[#1a1a24]
                  ${selected?.id===s.id?"bg-blue-900/10 border-l-2 border-l-blue-500":""}`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                      {s.username?.[0]?.toUpperCase()}
                    </div>
                    <span className="text-white text-xs font-medium truncate">{s.username}</span>
                    {s.unread_admin > 0 && (
                      <span className="bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-1 shrink-0">
                        {s.unread_admin}
                      </span>
                    )}
                  </div>
                  <span className="text-slate-600 text-[10px] shrink-0">{timeAgo(s.updated_at)}</span>
                </div>
                <p className="text-slate-300 text-xs truncate font-medium">{s.subject}</p>
                {s.last_message && <p className="text-slate-600 text-[10px] truncate mt-0.5">{s.last_message}</p>}
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border capitalize ${s.status==="open"?"text-green-400 border-green-900 bg-green-900/10":"text-slate-500 border-[#2d2d3e]"}`}>{s.status}</span>
                  <span className="text-slate-700 text-[9px]">{s.message_count} msgs</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── RIGHT: chat pane ───────────────────────────── */}
      {!selected ? (
        <div className="flex-1 hidden sm:flex flex-col items-center justify-center text-slate-600">
          <div className="text-5xl mb-4">💬</div>
          <p className="text-sm">Select a session to respond</p>
          <p className="text-xs mt-1">
            {stats.unread > 0 && <span className="text-red-400">{stats.unread} session{stats.unread!==1?"s":""} need your response</span>}
          </p>
        </div>
      ) : (
        <div className={`flex-1 flex flex-col ${!selected ? "hidden sm:flex" : "flex"}`}>
          {/* Chat header */}
          <div className="border-b border-[#2d2d3e] bg-[#111118] px-4 py-3 flex items-center gap-3">
            <button onClick={() => setSelected(null)} className="sm:hidden text-slate-400 hover:text-white text-lg">←</button>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
              {selected.username?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-semibold">{selected.username} <span className="text-slate-500 font-normal">· {selected.email||"no email"}</span></div>
              <div className="text-slate-500 text-xs truncate">{liveSession?.subject || selected.subject}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-[10px] px-2 py-0.5 rounded border capitalize ${liveSession?.status==="open"?"text-green-400 border-green-900":"text-slate-500 border-[#2d2d3e]"}`}>{liveSession?.status}</span>
              {!isClosed
                ? <button onClick={() => closeSession(selected.id)} className="text-red-400 hover:text-red-300 text-xs border border-red-900 hover:bg-red-900/20 px-2 py-1 rounded-lg transition">Close</button>
                : <button onClick={() => reopenSession(selected.id)} className="text-green-400 hover:text-green-300 text-xs border border-green-900 hover:bg-green-900/20 px-2 py-1 rounded-lg transition">Reopen</button>
              }
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m, i) => {
              const isAdmin = m.is_admin;
              return (
                <div key={m.id || i} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[75%]">
                    {!isAdmin && (
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-[9px] font-bold">
                          {selected.username?.[0]?.toUpperCase()}
                        </div>
                        <span className="text-slate-500 text-[10px]">{selected.username} · {timeAgo(m.created_at)}</span>
                      </div>
                    )}
                    <div className={`px-4 py-2.5 rounded-2xl text-sm break-words whitespace-pre-wrap
                      ${isAdmin
                        ? "bg-red-700/80 text-white rounded-br-sm"
                        : "bg-[#1a1a24] border border-[#2d2d3e] text-slate-200 rounded-bl-sm"
                      }`}>
                      {m.message}
                    </div>
                    {isAdmin && <div className="text-slate-600 text-[10px] text-right mt-1">You · {timeAgo(m.created_at)}</div>}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Quick reply presets */}
          {showPresets && (
            <div className="border-t border-[#2d2d3e] bg-[#0d0d14] p-3 space-y-1 max-h-48 overflow-y-auto">
              <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wider mb-2">Quick Replies</p>
              {PRESETS.map((p, i) => (
                <button key={i} onClick={() => { setInput(p); setShowPresets(false); }}
                  className="w-full text-left text-xs text-slate-300 hover:text-white hover:bg-[#1a1a24] px-3 py-2 rounded-lg transition truncate">
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="border-t border-[#2d2d3e] bg-[#111118] p-3">
            {isClosed ? (
              <div className="text-center py-2">
                <p className="text-slate-500 text-sm">Session closed.</p>
                <button onClick={() => reopenSession(selected.id)} className="text-blue-400 text-xs hover:underline mt-1">Reopen to reply</button>
              </div>
            ) : (
              <form onSubmit={send}>
                <div className="flex gap-2 mb-2">
                  <textarea value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(e); } }}
                    placeholder="Type your reply... (Enter to send)"
                    rows={2}
                    className="flex-1 bg-[#1a1a24] border border-[#2d2d3e] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-red-500 resize-none" />
                  <div className="flex flex-col gap-2">
                    <button type="submit" disabled={sending || !input.trim()}
                      className="bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white px-4 py-2 rounded-xl text-sm font-medium transition">
                      {sending ? "..." : "Send"}
                    </button>
                    <button type="button" onClick={() => setShowPresets(v => !v)}
                      className="bg-[#1a1a24] border border-[#2d2d3e] text-slate-400 hover:text-white px-3 py-2 rounded-xl text-xs transition">
                      💬
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
