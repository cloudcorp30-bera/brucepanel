import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import AdminSupport from "./AdminSupport";

const TABS = ["Overview","Analytics","Live Feed","System","Search Users","Users","Projects","Transactions","Promo Codes","Audit Log","Notifications","Emergency","Platform","Support"];

function bytes(b) {
  if (b > 1e9) return (b/1e9).toFixed(1)+" GB";
  if (b > 1e6) return (b/1e6).toFixed(1)+" MB";
  if (b > 1e3) return (b/1e3).toFixed(1)+" KB";
  return b+" B";
}
function uptime(s) {
  const d=Math.floor(s/86400), h=Math.floor((s%86400)/3600), m=Math.floor((s%3600)/60);
  return d>0?`${d}d ${h}h`:`${h}h ${m}m`;
}
function fmtDate(d) { return d ? new Date(d).toLocaleDateString("en-GB",{day:"2-digit",month:"short"}) : ""; }

// ─── Tiny sparkline bar chart ──────────────────────────────────────────────
function BarChart({ data, color = "bg-blue-500", label = "value", days = 30 }) {
  if (!data?.length) return <div className="text-slate-600 text-xs text-center py-8">No data yet</div>;
  // Fill in missing days
  const map = {};
  data.forEach(r => { map[r.day?.slice(0,10)] = parseInt(r.total||0); });
  const dates = Array.from({ length: days }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (days-1-i)); return d.toISOString().slice(0,10);
  });
  const vals = dates.map(d => map[d] || 0);
  const max  = Math.max(...vals, 1);
  return (
    <div>
      <div className="flex items-end gap-0.5 h-24">
        {vals.map((v, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end group relative">
            <div className={`${color} rounded-sm opacity-80 group-hover:opacity-100 transition-all`}
              style={{ height: Math.max(2, (v / max) * 96) + "px" }} />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-[#2d2d3e] text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
              {fmtDate(dates[i])}: {v.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-slate-600 mt-1">
        <span>{fmtDate(dates[0])}</span><span>{fmtDate(dates[dates.length-1])}</span>
      </div>
    </div>
  );
}

export default function Admin() {
  const [tab, setTab]                 = useState("Overview");
  const [stats, setStats]             = useState(null);
  const [system, setSystem]           = useState(null);
  const [users, setUsers]             = useState([]);
  const [projects, setProjects]       = useState([]);
  const [transactions, setTx]         = useState([]);
  const [promos, setPromos]           = useState([]);
  const [auditLogs, setAudit]         = useState([]);
  const [auditPage, setAuditPage]     = useState(1);
  const [auditTotal, setAuditTotal]   = useState(0);
  const [platform, setPlatform]       = useState({});
  const [analytics, setAnalytics]     = useState(null);
  const [feed, setFeed]               = useState({ feed:[], runningNow:0, recentSignups:[] });
  const [searchQ, setSearchQ]         = useState("");
  const [searchRole, setSearchRole]   = useState("");
  const [searchBanned, setSearchBanned] = useState("");
  const [searchMin, setSearchMin]     = useState("");
  const [searchMax, setSearchMax]     = useState("");
  const [searchResults, setSearchRes] = useState(null);
  const [selectedUsers, setSelected]  = useState(new Set());
  const [notes, setNotes]             = useState("");
  const [notesSaved, setNotesSaved]   = useState(false);
  const [expandedUser, setExpandedUser]   = useState(null);
  const [expandedProject, setExpProject] = useState(null);
  const [projectLogs, setProjectLogs] = useState({});
  const [promoForm, setPromoForm]     = useState({ code:"", coins:"", maxUses:"-1", expiresAt:"" });
  const [notifForm, setNotifForm]     = useState({ title:"", message:"", type:"info", userId:"" });
  const [bulkForm, setBulkForm]       = useState({ amount:"", reason:"" });
  const [emergencyMsg, setEmergMsg]   = useState({ title:"", message:"", type:"warning" });
  const [loading, setLoading]         = useState(true);
  const [msg, setMsg]                 = useState(""); const [msgOk, setMsgOk] = useState(true);
  const feedTimer = useRef(null);
  const nav = useNavigate();

  function flash(m, ok=true) { setMsg(m); setMsgOk(ok); setTimeout(() => setMsg(""), 5000); }

  async function loadAll() {
    setLoading(true);
    try {
      const [s, u, p, t] = await Promise.all([api.adminStats(), api.adminUsers(), api.adminProjects(), api.adminTransactions()]);
      setStats(s); setUsers(u.users||[]); setProjects(p.projects||[]); setTx(t.transactions||[]);
    } catch (e) { if (e.message==="Forbidden"||e.message==="Unauthorized") nav("/"); flash(e.message,false); }
    setLoading(false);
  }

  async function loadFeed() {
    try { const r = await api.adminLiveFeed(); setFeed(r); } catch {}
  }
  async function loadAnalytics() { try { setAnalytics(await api.adminAnalytics()); } catch {} }
  async function loadSystem()    { try { setSystem(await api.adminSystem()); } catch {} }
  async function loadPromos()    { try { const r = await api.adminPromo(); setPromos(r.codes||[]); } catch {} }
  async function loadAudit(page=1) {
    try { const r = await api.adminAudit(page); setAudit(r.logs||[]); setAuditTotal(r.total||0); setAuditPage(page); } catch {}
  }
  async function loadPlatform()  { try { const r = await api.adminPlatform(); setPlatform(r.settings||{}); } catch {} }
  async function loadNotes()     { try { const r = await api.adminNotes(); setNotes(r.notes||""); } catch {} }

  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    if (tab === "Analytics")    loadAnalytics();
    else if (tab === "Live Feed") { loadFeed(); feedTimer.current = setInterval(loadFeed, 5000); }
    else if (tab === "System")  loadSystem();
    else if (tab === "Promo Codes") loadPromos();
    else if (tab === "Audit Log")   loadAudit(1);
    else if (tab === "Platform")    loadPlatform();
    else if (tab === "Emergency")   loadNotes();
    return () => { if (feedTimer.current) { clearInterval(feedTimer.current); feedTimer.current = null; } };
  }, [tab]);

  async function doAction(fn, ok) { try { await fn(); await loadAll(); flash(ok); } catch (e) { flash(e.message,false); } }

  async function loadProjectLogs(id) {
    try { const r = await api.adminProjectLogs(id); setProjectLogs(l => ({ ...l, [id]: r.logs||[] })); } catch {}
  }

  async function createPromo(e) {
    e.preventDefault();
    try {
      await api.adminCreatePromo({ code: promoForm.code, coins: parseInt(promoForm.coins), maxUses: parseInt(promoForm.maxUses), expiresAt: promoForm.expiresAt||undefined });
      flash("Promo code created!"); setPromoForm({ code:"", coins:"", maxUses:"-1", expiresAt:"" }); loadPromos();
    } catch (e) { flash(e.message,false); }
  }

  async function sendNotif(e) {
    e.preventDefault();
    try {
      await api.adminNotify({ ...notifForm, userId: notifForm.userId ? parseInt(notifForm.userId) : undefined });
      flash("Notification sent!"); setNotifForm({ title:"", message:"", type:"info", userId:"" });
    } catch (e) { flash(e.message,false); }
  }

  async function doBulk(e) {
    e.preventDefault();
    if (!confirm(`Give ${bulkForm.amount} coins to all users?`)) return;
    try { const r = await api.adminBulkCoins(parseInt(bulkForm.amount), bulkForm.reason); flash(`Sent ${bulkForm.amount} coins to ${r.affectedUsers} users`); setBulkForm({ amount:"", reason:"" }); loadAll(); }
    catch (e) { flash(e.message,false); }
  }

  async function savePlatform(e) {
    e.preventDefault();
    try { await api.adminSavePlatform(platform); flash("Platform settings saved!"); }
    catch (e) { flash(e.message,false); }
  }

  async function doSearch() {
    try {
      const r = await api.adminSearchUsers({ q: searchQ, role: searchRole, banned: searchBanned, minCoins: searchMin, maxCoins: searchMax });
      setSearchRes(r.users||[]); setSelected(new Set());
    } catch (e) { flash(e.message,false); }
  }

  async function doBulkAction(action, value) {
    if (!selectedUsers.size) { flash("Select at least one user",false); return; }
    const reason = action === "notify" ? value : undefined;
    try {
      const r = await api.adminBulkAction(Array.from(selectedUsers), action, value, reason);
      flash(r.message); setSelected(new Set()); doSearch();
    } catch (e) { flash(e.message,false); }
  }

  async function saveNotes() {
    try { await api.adminSaveNotes(notes); setNotesSaved(true); setTimeout(() => setNotesSaved(false), 2000); }
    catch (e) { flash(e.message,false); }
  }

  if (loading) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-slate-500 animate-pulse">Loading admin...</div>;

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Header */}
      <div className="border-b border-[#2d2d3e] bg-[#111118] px-4 sm:px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">👑 Admin Panel</h1>
          <p className="text-xs text-slate-500 mt-0.5">BrucePanel · Bera Tech Org</p>
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className={`text-sm ${msgOk?"text-green-400":"text-red-400"}`}>{msg}</span>}
          <Link to="/" className="text-slate-400 hover:text-white text-sm transition">← Dashboard</Link>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-[#2d2d3e] bg-[#111118] px-2 sm:px-4 flex gap-0.5 overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-3 text-xs font-medium border-b-2 transition whitespace-nowrap ${tab===t?"border-red-400 text-red-400":"border-transparent text-slate-400 hover:text-white"}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* ── Overview ─────────────────────────────────────── */}
        {tab==="Overview" && stats && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { l:"Users",         v:stats.totalUsers,                                          i:"👥", c:"text-blue-400"   },
                { l:"Projects",      v:stats.totalProjects,                                       i:"📁", c:"text-green-400"  },
                { l:"Revenue (KSH)", v:(stats.totalRevenue||0).toLocaleString(),                  i:"💰", c:"text-amber-400"  },
                { l:"Coins in Circ.",v:(stats.totalCoinsInCirculation||0).toLocaleString(),       i:"🪙", c:"text-purple-400" },
              ].map(s => (
                <div key={s.l} className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-5">
                  <div className="text-2xl mb-2">{s.i}</div>
                  <div className={`text-2xl font-bold ${s.c}`}>{s.v}</div>
                  <div className="text-slate-500 text-xs mt-1">{s.l}</div>
                </div>
              ))}
            </div>
            {/* Airdrop */}
            <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-6">
              <h3 className="text-white font-semibold mb-4">🪙 Airdrop Coins to All Users</h3>
              <form onSubmit={doBulk} className="flex flex-col sm:flex-row gap-3">
                <input value={bulkForm.amount} onChange={e=>setBulkForm(f=>({...f,amount:e.target.value}))} type="number" required placeholder="Coins" className="w-28 bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500" />
                <input value={bulkForm.reason} onChange={e=>setBulkForm(f=>({...f,reason:e.target.value}))} required placeholder="Reason (e.g. Holiday Airdrop)" className="flex-1 bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500" />
                <button type="submit" className="bg-amber-600 hover:bg-amber-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition">Send Airdrop</button>
              </form>
            </div>
            {/* Export quick links */}
            <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-5">
              <h3 className="text-white font-semibold mb-3">📤 Quick Export</h3>
              <div className="flex flex-wrap gap-2">
                <a href="/api/brucepanel/admin/export/users"        className="text-xs bg-[#1a1a24] border border-[#2d2d3e] text-green-400 hover:border-green-700 px-4 py-2 rounded-lg transition">⬇ Users CSV</a>
                <a href="/api/brucepanel/admin/export/transactions" className="text-xs bg-[#1a1a24] border border-[#2d2d3e] text-amber-400 hover:border-amber-700 px-4 py-2 rounded-lg transition">⬇ Transactions CSV</a>
                <a href="/api/brucepanel/admin/export/projects"     className="text-xs bg-[#1a1a24] border border-[#2d2d3e] text-blue-400 hover:border-blue-700 px-4 py-2 rounded-lg transition">⬇ Projects CSV</a>
              </div>
            </div>
          </div>
        )}

        {/* ── Analytics ────────────────────────────────────── */}
        {tab==="Analytics" && (
          <div className="space-y-6">
            {!analytics ? <div className="text-slate-500 text-center py-12 animate-pulse">Loading analytics...</div> : (
              <>
                {/* Totals */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {[
                    { l:"Total Revenue", v:`KSH ${(analytics.totals?.revenue||0).toLocaleString()}`, c:"text-amber-400" },
                    { l:"Total Users",   v:(analytics.totals?.users||0).toLocaleString(),             c:"text-blue-400"  },
                    { l:"Projects",      v:(analytics.totals?.projects||0).toLocaleString(),          c:"text-green-400" },
                    { l:"Transactions",  v:(analytics.totals?.transactions||0).toLocaleString(),      c:"text-purple-400"},
                    { l:"Coins Held",    v:(analytics.totals?.coins||0).toLocaleString(),             c:"text-yellow-400"},
                  ].map(s => (
                    <div key={s.l} className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-4 text-center">
                      <div className={`text-xl font-bold ${s.c}`}>{s.v}</div>
                      <div className="text-slate-500 text-xs mt-1">{s.l}</div>
                    </div>
                  ))}
                </div>
                {/* Charts */}
                <div className="grid sm:grid-cols-2 gap-4">
                  {[
                    { title:"💰 Daily Revenue (KSH)", data:analytics.revenue,  color:"bg-amber-500" },
                    { title:"👥 New Signups",          data:analytics.signups,  color:"bg-blue-500"  },
                    { title:"📁 New Projects",         data:analytics.projects, color:"bg-green-500" },
                  ].map(c => (
                    <div key={c.title} className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-5">
                      <h3 className="text-white font-semibold text-sm mb-4">{c.title} <span className="text-slate-600 font-normal text-xs">— last 30 days</span></h3>
                      <BarChart data={c.data} color={c.color} />
                      <div className="flex justify-between mt-3 text-xs text-slate-500">
                        <span>Total: <span className="text-white font-medium">{c.data?.reduce((s,r) => s+parseInt(r.total||0),0).toLocaleString()}</span></span>
                        <span>Peak: <span className="text-white font-medium">{Math.max(0,...(c.data||[]).map(r=>parseInt(r.total||0))).toLocaleString()}</span></span>
                        <span>Days with data: <span className="text-white font-medium">{c.data?.length||0}</span></span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Live Feed ─────────────────────────────────────── */}
        {tab==="Live Feed" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-white font-semibold">Live Activity</span>
                <span className="text-slate-500 text-sm">auto-refreshes every 5s</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-green-400 text-sm font-medium">{feed.runningNow} running</span>
                <button onClick={loadFeed} className="text-slate-500 hover:text-white text-sm">↻</button>
              </div>
            </div>

            {/* Recent signups */}
            {feed.recentSignups?.length > 0 && (
              <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-4">
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Recent Signups</p>
                <div className="flex flex-wrap gap-2">
                  {feed.recentSignups.map(u => (
                    <div key={u.username} className="flex items-center gap-2 bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-3 py-1.5">
                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold">
                        {u.username[0].toUpperCase()}
                      </div>
                      <span className="text-slate-300 text-xs">{u.username}</span>
                      <span className="text-slate-600 text-[10px]">{new Date(u.created_at).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Activity stream */}
            <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl divide-y divide-[#2d2d3e]/50">
              {feed.feed?.length === 0 && <div className="text-center py-12 text-slate-600 text-sm">No activity yet</div>}
              {feed.feed?.map((l, i) => (
                <div key={i} className="px-5 py-3 flex items-start gap-3 hover:bg-[#1a1a24] transition">
                  <div className="w-7 h-7 rounded-full bg-[#2d2d3e] flex items-center justify-center text-xs text-slate-400 font-bold shrink-0">
                    {(l.username||"?")[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white text-xs font-medium">{l.username||"system"}</span>
                      <span className="text-blue-400 text-[10px] bg-blue-900/20 px-1.5 py-0.5 rounded">{l.action}</span>
                      {l.ip && <span className="text-slate-700 text-[10px]">{l.ip}</span>}
                      <span className="text-slate-600 text-[10px] ml-auto">{new Date(l.created_at).toLocaleString()}</span>
                    </div>
                    {l.details && <p className="text-slate-500 text-xs mt-0.5 truncate">{l.details}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── System ───────────────────────────────────────── */}
        {tab==="System" && (
          <div className="space-y-4">
            <button onClick={loadSystem} className="bg-[#1a1a24] border border-[#2d2d3e] text-slate-300 hover:text-white px-4 py-2 rounded-lg text-sm transition">↻ Refresh</button>
            {!system ? <div className="text-slate-500 text-center py-12">Loading...</div> : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-5">
                  <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Memory</h3>
                  <div className="text-3xl font-bold text-blue-400 mb-1">{system.memory.pct}%</div>
                  <div className="w-full bg-[#1a1a24] rounded-full h-2 mb-3"><div className="bg-blue-500 h-2 rounded-full" style={{ width:system.memory.pct+"%" }} /></div>
                  <div className="text-slate-500 text-xs space-y-0.5">
                    <p>Used: <span className="text-slate-300">{bytes(system.memory.used)}</span></p>
                    <p>Total: <span className="text-slate-300">{bytes(system.memory.total)}</span></p>
                  </div>
                </div>
                <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-5">
                  <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">CPU</h3>
                  <div className="text-3xl font-bold text-green-400 mb-1">{system.cpu.cores} cores</div>
                  <div className="text-slate-500 text-xs space-y-0.5">
                    <p>Model: <span className="text-slate-300 truncate block">{system.cpu.model?.split("@")[0]?.trim()}</span></p>
                    <p>Load (1m): <span className="text-slate-300">{system.cpu.loadAvg[0]?.toFixed(2)}</span></p>
                    <p>Load (5m): <span className="text-slate-300">{system.cpu.loadAvg[1]?.toFixed(2)}</span></p>
                  </div>
                </div>
                <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-5">
                  <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Uptime</h3>
                  <div className="text-3xl font-bold text-purple-400 mb-1">{uptime(system.uptime)}</div>
                  <div className="text-slate-500 text-xs space-y-0.5">
                    <p>Running: <span className="text-green-400 font-bold">{system.running}</span></p>
                    <p>Audit entries: <span className="text-slate-300">{system.auditEntries?.toLocaleString()}</span></p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Search Users ──────────────────────────────────── */}
        {tab==="Search Users" && (
          <div className="space-y-5">
            <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-5 space-y-4">
              <h3 className="text-white font-semibold">🔍 Search & Segment Users</h3>
              <div className="grid sm:grid-cols-3 gap-3">
                <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doSearch()}
                  placeholder="Username or email..." className="bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 text-sm" />
                <select value={searchRole} onChange={e=>setSearchRole(e.target.value)} className="bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none">
                  <option value="">All roles</option>
                  <option value="user">User</option>
                  <option value="moderator">Moderator</option>
                  <option value="admin">Admin</option>
                </select>
                <select value={searchBanned} onChange={e=>setSearchBanned(e.target.value)} className="bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none">
                  <option value="">Any status</option>
                  <option value="false">Active only</option>
                  <option value="true">Banned only</option>
                </select>
                <div className="flex gap-2">
                  <input value={searchMin} onChange={e=>setSearchMin(e.target.value)} type="number" placeholder="Min coins" className="flex-1 bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-3 py-2.5 text-white focus:outline-none" />
                  <input value={searchMax} onChange={e=>setSearchMax(e.target.value)} type="number" placeholder="Max coins" className="flex-1 bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-3 py-2.5 text-white focus:outline-none" />
                </div>
                <button onClick={doSearch} className="sm:col-span-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition">Search</button>
              </div>
            </div>

            {searchResults !== null && (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <span className="text-slate-400 text-sm">{searchResults.length} results · {selectedUsers.size} selected</span>
                  {selectedUsers.size > 0 && (
                    <div className="flex flex-wrap gap-2">
                      <button onClick={()=>{ const v=prompt("Coins to add:"); if(v) doBulkAction("add_coins",v); }} className="text-xs bg-amber-900/20 border border-amber-700 text-amber-400 hover:bg-amber-900/30 px-3 py-1.5 rounded-lg transition">+ Coins</button>
                      <button onClick={()=>{ const v=prompt("Message to send:"); if(v) doBulkAction("notify",v); }} className="text-xs bg-blue-900/20 border border-blue-700 text-blue-400 hover:bg-blue-900/30 px-3 py-1.5 rounded-lg transition">✉ Message</button>
                      <button onClick={()=>doBulkAction("ban","true")} className="text-xs bg-red-900/20 border border-red-700 text-red-400 hover:bg-red-900/30 px-3 py-1.5 rounded-lg transition">🚫 Ban</button>
                      <button onClick={()=>doBulkAction("unban","true")} className="text-xs bg-green-900/20 border border-green-700 text-green-400 hover:bg-green-900/30 px-3 py-1.5 rounded-lg transition">✅ Unban</button>
                      <button onClick={() => setSelected(new Set())} className="text-xs text-slate-500 hover:text-white transition">Clear</button>
                    </div>
                  )}
                  <button onClick={() => setSelected(new Set(searchResults.map(u=>u.id)))} className="text-xs text-blue-400 hover:underline">Select all</button>
                </div>
                <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl divide-y divide-[#2d2d3e]/50">
                  {searchResults.map(u => (
                    <div key={u.id} className={`flex items-center gap-3 px-5 py-3 hover:bg-[#1a1a24] transition cursor-pointer ${selectedUsers.has(u.id) ? "bg-blue-900/10" : ""}`}
                      onClick={() => setSelected(s => { const n = new Set(s); n.has(u.id) ? n.delete(u.id) : n.add(u.id); return n; })}>
                      <div className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${selectedUsers.has(u.id) ? "bg-blue-600 border-blue-500 text-white" : "border-[#2d2d3e]"}`}>
                        {selectedUsers.has(u.id) && "✓"}
                      </div>
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                        {u.username[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-sm font-medium flex items-center gap-2">
                          {u.username}
                          {u.role!=="user" && <span className="text-[10px] px-1.5 bg-red-900/30 text-red-400 rounded">{u.role}</span>}
                          {u.is_banned && <span className="text-[10px] px-1.5 bg-red-900/20 text-red-400 rounded border border-red-700">Banned</span>}
                        </div>
                        <div className="text-slate-500 text-xs">{u.email||"no email"} · {u.project_count||0} projects</div>
                      </div>
                      <div className="text-amber-400 text-sm font-medium">🪙 {u.coins?.toLocaleString()}</div>
                    </div>
                  ))}
                  {searchResults.length===0 && <div className="text-center py-12 text-slate-600 text-sm">No users found</div>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Users ─────────────────────────────────────────── */}
        {tab==="Users" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-slate-400 text-sm">{users.length} users</span>
              <a href="/api/brucepanel/admin/export/users" className="text-xs bg-[#1a1a24] border border-[#2d2d3e] text-green-400 hover:border-green-700 px-3 py-1.5 rounded-lg transition">⬇ Export CSV</a>
            </div>
            {users.map(u => (
              <div key={u.id} className="bg-[#111118] border border-[#2d2d3e] rounded-xl">
                <div className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-[#1a1a24] transition rounded-xl"
                  onClick={() => setExpandedUser(expandedUser===u.id?null:u.id)}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                      {u.username[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm flex items-center gap-2">
                        {u.username}
                        {u.role!=="user" && <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${u.role==="admin"?"bg-red-900/50 text-red-400":"bg-yellow-900/50 text-yellow-400"}`}>{u.role}</span>}
                        {u.isBanned && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/30 text-red-400 border border-red-700">Banned</span>}
                      </div>
                      <div className="text-slate-500 text-xs">{u.email||"no email"} · {u.projectCount||0} projects</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-amber-400 text-sm font-medium">🪙 {u.coins?.toLocaleString()}</span>
                    <span className="text-slate-500 text-xs">{expandedUser===u.id?"▲":"▼"}</span>
                  </div>
                </div>
                {expandedUser===u.id && (
                  <div className="px-5 pb-5 border-t border-[#2d2d3e] pt-4 space-y-3">
                    <div className="text-slate-500 text-xs">Joined: {new Date(u.createdAt||u.created_at).toLocaleDateString()} · Last login: {u.last_login?new Date(u.last_login).toLocaleString():"N/A"} · Referrals: {u.referralCount||0}</div>
                    <div className="flex flex-wrap gap-2">
                      {["admin","moderator","user"].map(role => (
                        <button key={role} onClick={()=>doAction(()=>api.adminSetRole(u.id,role),`Role → ${role}`)}
                          className={`text-xs px-3 py-1.5 rounded-lg border transition ${u.role===role?"bg-blue-600 border-blue-500 text-white":"bg-[#1a1a24] border-[#2d2d3e] text-slate-300 hover:border-blue-500"}`}>{role}</button>
                      ))}
                      <button onClick={()=>doAction(()=>api.adminBan(u.id,!u.isBanned),u.isBanned?"Unbanned":"Banned")}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition ${u.isBanned?"bg-green-900/30 border-green-700 text-green-400":"bg-red-900/30 border-red-700 text-red-400"}`}>
                        {u.isBanned?"Unban":"Ban"}
                      </button>
                      <button onClick={async()=>{const a=prompt("Coins (+/-):"); if(!a)return; const r=prompt("Reason:")||"Admin"; doAction(()=>api.adminUpdateCoins(u.id,parseInt(a),r),"Coins updated");}}
                        className="text-xs px-3 py-1.5 rounded-lg border border-[#2d2d3e] bg-[#1a1a24] text-amber-400 hover:border-amber-500 transition">± Coins</button>
                      <button onClick={async()=>{const t=prompt("Title:"); const m=prompt("Message:"); if(t&&m) doAction(()=>api.adminMessageUser(u.id,t,m,"info"),"DM sent");}}
                        className="text-xs px-3 py-1.5 rounded-lg border border-[#2d2d3e] bg-[#1a1a24] text-blue-400 hover:border-blue-500 transition">✉ DM</button>
                      <button onClick={()=>{if(confirm(`Login as ${u.username}?`)) api.adminImpersonate(u.id).then(r=>{localStorage.setItem("bp_token",r.token);localStorage.setItem("bp_user",JSON.stringify(r.user));nav("/");}).catch(e=>flash(e.message,false));}}
                        className="text-xs px-3 py-1.5 rounded-lg border border-yellow-900 bg-yellow-900/10 text-yellow-400 hover:bg-yellow-900/30 transition">👤 Impersonate</button>
                      <button onClick={()=>{if(confirm(`Delete ${u.username}?`)) doAction(()=>api.adminDeleteUser(u.id),"User deleted");}}
                        className="text-xs px-3 py-1.5 rounded-lg border border-red-900 bg-red-900/10 text-red-400 hover:bg-red-900/30 transition">🗑 Delete</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Projects ──────────────────────────────────────── */}
        {tab==="Projects" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-slate-400 text-sm">{projects.length} projects · {projects.filter(p=>p.status==="running").length} running</span>
              <a href="/api/brucepanel/admin/export/projects" className="text-xs bg-[#1a1a24] border border-[#2d2d3e] text-blue-400 hover:border-blue-700 px-3 py-1.5 rounded-lg transition">⬇ Export CSV</a>
            </div>
            {projects.map(p => (
              <div key={p.id} className="bg-[#111118] border border-[#2d2d3e] rounded-xl">
                <div className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-[#1a1a24] transition rounded-xl"
                  onClick={()=>setExpProject(expandedProject===p.id?null:p.id)}>
                  <div>
                    <div className="text-white font-medium text-sm">{p.name}
                      <span className={`ml-2 text-xs ${p.status==="running"?"text-green-400":p.status==="error"?"text-red-400":"text-slate-500"}`}>● {p.status}</span>
                    </div>
                    <div className="text-slate-500 text-xs">owner: {p.username||p.userId} · {p.start_command||p.startCommand}</div>
                  </div>
                  <span className="text-slate-500 text-xs">{expandedProject===p.id?"▲":"▼"}</span>
                </div>
                {expandedProject===p.id && (
                  <div className="px-5 pb-5 border-t border-[#2d2d3e] pt-4 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={()=>doAction(()=>api.adminForceStop(p.id),"Stopped")} className="text-xs px-3 py-1.5 bg-red-900/20 border border-red-700 text-red-400 hover:bg-red-900/40 rounded-lg transition">■ Force Stop</button>
                      <button onClick={()=>doAction(()=>api.adminForceStart(p.id),"Started")} className="text-xs px-3 py-1.5 bg-green-900/20 border border-green-700 text-green-400 hover:bg-green-900/40 rounded-lg transition">▶ Force Start</button>
                      <button onClick={()=>loadProjectLogs(p.id)} className="text-xs px-3 py-1.5 bg-[#1a1a24] border border-[#2d2d3e] text-blue-400 hover:border-blue-500 rounded-lg transition">📋 Logs</button>
                      <button onClick={()=>{if(confirm(`Delete "${p.name}"?`)) doAction(()=>api.adminDeleteProject(p.id),"Deleted");}} className="text-xs px-3 py-1.5 bg-red-900/10 border border-red-900 text-red-400 hover:bg-red-900/30 rounded-lg transition">🗑 Delete</button>
                    </div>
                    {projectLogs[p.id] && (
                      <div className="bg-[#0d0d14] border border-[#2d2d3e] rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs text-slate-400 space-y-0.5">
                        {projectLogs[p.id].slice(-50).map((l,i)=><div key={i}>{l}</div>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Transactions ──────────────────────────────────── */}
        {tab==="Transactions" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <a href="/api/brucepanel/admin/export/transactions" className="text-xs bg-[#1a1a24] border border-[#2d2d3e] text-amber-400 hover:border-amber-700 px-3 py-1.5 rounded-lg transition">⬇ Export CSV</a>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-[#2d2d3e] text-slate-400 text-xs">
                  {["ID","User","Plan","Amount","Status","Date"].map(h=><th key={h} className="text-left py-3 pr-4">{h}</th>)}
                </tr></thead>
                <tbody>
                  {transactions.map(t=>(
                    <tr key={t.id} className="border-b border-[#2d2d3e]/40 hover:bg-[#111118]">
                      <td className="py-3 pr-4 text-slate-600 text-xs font-mono">#{String(t.id).slice(0,8)}</td>
                      <td className="py-3 pr-4 text-slate-300">{t.username||t.userId}</td>
                      <td className="py-3 pr-4 text-slate-300 capitalize">{t.planId||t.plan}</td>
                      <td className="py-3 pr-4 text-amber-400 font-medium">KSH {t.amount?.toLocaleString()}</td>
                      <td className="py-3 pr-4"><span className={`text-xs px-2 py-0.5 rounded-full ${t.status==="completed"?"bg-green-900/30 text-green-400":t.status==="failed"?"bg-red-900/30 text-red-400":"bg-yellow-900/30 text-yellow-400"}`}>{t.status}</span></td>
                      <td className="py-3 text-slate-500 text-xs">{new Date(t.createdAt||t.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {transactions.length===0 && <div className="text-slate-500 text-center py-12">No transactions yet</div>}
            </div>
          </div>
        )}

        {/* ── Promo Codes ────────────────────────────────────── */}
        {tab==="Promo Codes" && (
          <div className="space-y-6">
            <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-6">
              <h3 className="text-white font-semibold mb-4">Create Promo Code</h3>
              <form onSubmit={createPromo} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div><label className="text-slate-400 text-xs block mb-1">Code *</label>
                  <input value={promoForm.code} onChange={e=>setPromoForm(f=>({...f,code:e.target.value.toUpperCase()}))} required className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white font-mono uppercase focus:outline-none focus:border-blue-500" placeholder="LAUNCH2026" /></div>
                <div><label className="text-slate-400 text-xs block mb-1">Coins *</label>
                  <input value={promoForm.coins} onChange={e=>setPromoForm(f=>({...f,coins:e.target.value}))} required type="number" min="1" className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500" placeholder="100" /></div>
                <div><label className="text-slate-400 text-xs block mb-1">Max Uses (-1 = unlimited)</label>
                  <input value={promoForm.maxUses} onChange={e=>setPromoForm(f=>({...f,maxUses:e.target.value}))} type="number" className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500" /></div>
                <div><label className="text-slate-400 text-xs block mb-1">Expires (optional)</label>
                  <input value={promoForm.expiresAt} onChange={e=>setPromoForm(f=>({...f,expiresAt:e.target.value}))} type="datetime-local" className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500" /></div>
                <div className="sm:col-span-2 lg:col-span-4"><button type="submit" className="bg-green-600 hover:bg-green-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition">Create Code</button></div>
              </form>
            </div>
            <div className="space-y-2">
              {promos.map(c=>(
                <div key={c.id} className="bg-[#111118] border border-[#2d2d3e] rounded-xl px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-white font-mono font-bold text-sm">{c.code}</span>
                    <span className="text-amber-400 text-sm">+{c.coins} coins</span>
                    <span className="text-slate-500 text-xs">{c.used_count}/{c.max_uses===-1?"∞":c.max_uses} used</span>
                    {c.expires_at && <span className="text-slate-600 text-xs">Exp: {new Date(c.expires_at).toLocaleDateString()}</span>}
                  </div>
                  <button onClick={()=>{if(confirm(`Delete ${c.code}?`)) doAction(()=>api.adminDeletePromo(c.code),"Deleted").then(loadPromos);}} className="text-red-400 hover:text-red-300 text-xs px-3 py-1.5 border border-red-900 rounded-lg hover:bg-red-900/20 transition">Delete</button>
                </div>
              ))}
              {promos.length===0 && <div className="text-slate-600 text-center py-8 text-sm">No promo codes yet</div>}
            </div>
          </div>
        )}

        {/* ── Audit Log ─────────────────────────────────────── */}
        {tab==="Audit Log" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-slate-400 text-sm">{auditTotal.toLocaleString()} total entries</div>
              <div className="flex items-center gap-2">
                <button disabled={auditPage<=1} onClick={()=>loadAudit(auditPage-1)} className="text-slate-400 hover:text-white disabled:opacity-30 text-sm px-2">←</button>
                <span className="text-slate-500 text-xs">Page {auditPage}</span>
                <button disabled={auditLogs.length<60} onClick={()=>loadAudit(auditPage+1)} className="text-slate-400 hover:text-white disabled:opacity-30 text-sm px-2">→</button>
              </div>
            </div>
            <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl divide-y divide-[#2d2d3e]/50">
              {auditLogs.map((l,i)=>(
                <div key={i} className="px-5 py-3 flex items-start gap-4 hover:bg-[#1a1a24] transition">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-[#2d2d3e] flex items-center justify-center text-xs text-slate-400 font-bold">{(l.username||"?")[0]?.toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white text-sm font-medium">{l.username||"system"}</span>
                      <span className="text-blue-400 text-xs bg-blue-900/20 px-2 py-0.5 rounded">{l.action}</span>
                      {l.ip && <span className="text-slate-600 text-xs">{l.ip}</span>}
                      <span className="text-slate-600 text-xs ml-auto">{new Date(l.created_at).toLocaleString()}</span>
                    </div>
                    {l.details && <p className="text-slate-500 text-xs mt-0.5 truncate">{l.details}</p>}
                  </div>
                </div>
              ))}
              {auditLogs.length===0 && <div className="text-center py-12 text-slate-600 text-sm">No audit entries</div>}
            </div>
          </div>
        )}

        {/* ── Notifications ─────────────────────────────────── */}
        {tab==="Notifications" && (
          <div className="space-y-6">
            <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-6">
              <h3 className="text-white font-semibold mb-4">Send Notification</h3>
              <form onSubmit={sendNotif} className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div><label className="text-slate-400 text-xs block mb-1">Title *</label>
                    <input value={notifForm.title} onChange={e=>setNotifForm(f=>({...f,title:e.target.value}))} required className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 text-sm" placeholder="Announcement" /></div>
                  <div><label className="text-slate-400 text-xs block mb-1">Type</label>
                    <select value={notifForm.type} onChange={e=>setNotifForm(f=>({...f,type:e.target.value}))} className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none text-sm">
                      <option value="info">Info</option><option value="success">Success</option><option value="warning">Warning</option><option value="error">Error</option>
                    </select></div>
                </div>
                <div><label className="text-slate-400 text-xs block mb-1">Message *</label>
                  <textarea value={notifForm.message} onChange={e=>setNotifForm(f=>({...f,message:e.target.value}))} required rows={3} className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 text-sm resize-none" /></div>
                <div><label className="text-slate-400 text-xs block mb-1">User ID <span className="text-slate-600">(blank = all)</span></label>
                  <input value={notifForm.userId} onChange={e=>setNotifForm(f=>({...f,userId:e.target.value}))} type="number" className="w-40 bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none text-sm" placeholder="optional" /></div>
                <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition">{notifForm.userId?"Send to User":"Broadcast to All"}</button>
              </form>
            </div>
            <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-6">
              <h3 className="text-white font-semibold mb-2">Purge Old Notifications</h3>
              <button onClick={()=>{if(confirm("Purge 30+ day old notifications?")) doAction(()=>api.adminPurge(30),"Purged");}} className="bg-red-900/30 border border-red-700 text-red-400 hover:bg-red-900/50 px-5 py-2.5 rounded-lg text-sm transition">Purge (30+ days old)</button>
            </div>
          </div>
        )}

        {/* ── Emergency ─────────────────────────────────────── */}
        {tab==="Emergency" && (
          <div className="space-y-4">
            <div className="bg-red-900/10 border border-red-800/40 rounded-xl p-4">
              <p className="text-red-400 text-sm font-semibold">⚠️ Emergency Controls</p>
              <p className="text-slate-500 text-xs mt-1">These actions affect all users and all projects immediately. Use with caution.</p>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { label:"⛔ Stop All Projects", desc:"Immediately stops every running project", action: async()=>{if(!confirm("Stop ALL running projects?")) return; doAction(()=>api.adminEmergencyStop(),"All projects stopped");}, cls:"border-red-800 bg-red-900/10 text-red-400 hover:bg-red-900/20" },
                { label:"🔄 Restart All",        desc:"Restart every currently running project",action: async()=>{if(!confirm("Restart all running projects?")) return; doAction(()=>api.adminEmergencyRestart(),"All projects restarted");}, cls:"border-amber-800 bg-amber-900/10 text-amber-400 hover:bg-amber-900/20" },
              ].map(b => (
                <button key={b.label} onClick={b.action} className={`border rounded-xl p-5 text-left transition ${b.cls}`}>
                  <div className="font-semibold text-sm mb-1">{b.label}</div>
                  <div className="text-xs opacity-70">{b.desc}</div>
                </button>
              ))}
              <div className="border border-[#2d2d3e] rounded-xl p-5 bg-[#111118]">
                <div className="text-white font-semibold text-sm mb-1">📊 Right now</div>
                <div className="text-slate-500 text-xs">{projects.filter(p=>p.status==="running").length} projects running</div>
                <div className="text-slate-500 text-xs">{users.length} total users</div>
              </div>
            </div>

            {/* Emergency broadcast */}
            <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-6 space-y-3">
              <h3 className="text-white font-semibold">📢 Emergency Broadcast</h3>
              <p className="text-slate-500 text-xs">Sends an immediate notification to every user on the platform.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><label className="text-slate-400 text-xs block mb-1">Title *</label>
                  <input value={emergencyMsg.title} onChange={e=>setEmergMsg(m=>({...m,title:e.target.value}))} className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-red-500 text-sm" placeholder="⚠️ Maintenance Notice" /></div>
                <div><label className="text-slate-400 text-xs block mb-1">Type</label>
                  <select value={emergencyMsg.type} onChange={e=>setEmergMsg(m=>({...m,type:e.target.value}))} className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none text-sm">
                    <option value="warning">Warning</option><option value="info">Info</option><option value="error">Error</option><option value="success">Success</option>
                  </select></div>
                <div className="sm:col-span-2"><label className="text-slate-400 text-xs block mb-1">Message *</label>
                  <textarea value={emergencyMsg.message} onChange={e=>setEmergMsg(m=>({...m,message:e.target.value}))} rows={2} className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-red-500 text-sm resize-none" /></div>
              </div>
              <button onClick={()=>{if(!emergencyMsg.title||!emergencyMsg.message){flash("Title and message required",false);return;} if(!confirm(`Broadcast "${emergencyMsg.title}" to ALL users?`)) return; doAction(()=>api.adminEmergencyBroadcast(emergencyMsg.title,emergencyMsg.message,emergencyMsg.type),"Broadcast sent!");}}
                className="bg-red-700 hover:bg-red-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition">Send Emergency Broadcast</button>
            </div>

            {/* Admin notes */}
            <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-semibold">📝 Admin Notes</h3>
                <span className="text-slate-600 text-xs">Private — only visible to admins</span>
              </div>
              <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={6} placeholder="Use this for internal notes: ongoing issues, maintenance schedule, user flags..."
                className="w-full bg-[#0d0d14] border border-[#2d2d3e] rounded-lg px-4 py-3 text-slate-300 text-sm focus:outline-none focus:border-blue-500 resize-none font-mono" />
              <button onClick={saveNotes} className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition">
                {notesSaved ? "✅ Saved!" : "Save Notes"}
              </button>
            </div>
          </div>
        )}

        {/* ── Platform ──────────────────────────────────────── */}
        {tab==="Platform" && (
          <form onSubmit={savePlatform} className="space-y-4">
            <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-6">
              <h3 className="text-white font-semibold mb-5">Platform Settings</h3>
              <div className="grid sm:grid-cols-2 gap-5">
                {[
                  ["maintenance",           "Maintenance Mode (true/false)",           "false"],
                  ["registrations_enabled", "Allow New Registrations (true/false)",    "true" ],
                  ["max_projects_per_user", "Max Projects Per User",                   "10"   ],
                  ["coin_per_referral",     "Coins Per Referral",                      "25"   ],
                  ["free_app_slots",        "Free App Slots Per User",                 "2"    ],
                  ["min_password_length",   "Min Password Length",                     "6"    ],
                ].map(([key,label,def])=>(
                  <div key={key}>
                    <label className="text-slate-400 text-sm block mb-1">{label}</label>
                    <input value={platform[key]??def} onChange={e=>setPlatform(p=>({...p,[key]:e.target.value}))}
                      className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 font-mono" />
                  </div>
                ))}
              </div>
              <button type="submit" className="mt-5 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition">Save Settings</button>
            </div>
          </form>
        )}

        {/* ── Support ────────────────────────────────────────── */}
        {tab==="Support" && <AdminSupport />}

      </div>
    </div>
  );
}
