import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";

const STATUS_DOT  = { running:"bg-green-400", stopped:"bg-slate-500", error:"bg-red-400", installing:"bg-yellow-400", idle:"bg-slate-600" };
const STATUS_TEXT = { running:"text-green-400", stopped:"text-slate-400", error:"text-red-400", installing:"text-yellow-400", idle:"text-slate-500" };
const STATUS_FILTERS = ["all", "running", "stopped", "error", "installing"];

export default function Dashboard() {
  const [user, setUser]               = useState(null);
  const [projects, setProjects]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showNew, setShowNew]         = useState(false);
  const [notifications, setNotif]     = useState([]);
  const [showNotif, setShowNotif]     = useState(false);
  const [search, setSearch]           = useState("");
  const [statusFilter, setStatus]     = useState("all");
  const [sortBy, setSortBy]           = useState("name");
  const [newForm, setNewForm]         = useState({ name:"", description:"", startCommand:"node index.js", githubUrl:"" });
  const [creating, setCreating]       = useState(false);
  const [createError, setCreateError] = useState("");
  const [cloning, setCloning]         = useState(null);
  const [actionMsg, setActionMsg]     = useState("");
  const notifRef = useRef(null);
  const nav = useNavigate();

  async function load() {
    try {
      const [me, proj, notif] = await Promise.all([api.me(), api.projects(), api.notifications()]);
      setUser(me);
      localStorage.setItem("bp_user", JSON.stringify(me));
      setProjects(proj.projects || []);
      setNotif(notif.notifications || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    function handleClick(e) { if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotif(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function logout() { localStorage.removeItem("bp_token"); localStorage.removeItem("bp_user"); nav("/login"); }

  function flash(m) { setActionMsg(m); setTimeout(() => setActionMsg(""), 3500); }

  async function createProject(e) {
    e.preventDefault(); setCreating(true); setCreateError("");
    try {
      await api.createProject(newForm);
      setShowNew(false); setNewForm({ name:"", description:"", startCommand:"node index.js", githubUrl:"" });
      await load();
    } catch (err) {
      setCreateError(err.code === "INSUFFICIENT_COINS" ? "Not enough BB Coins — you need 50 coins. Buy more in the Store!" : err.message);
    }
    setCreating(false);
  }

  async function doAction(id, fn, label) {
    try { await fn(id); await load(); flash(`✅ ${label}`); } catch (e) { flash(`❌ ${e.message}`); }
  }

  async function cloneProject(p) {
    const name = prompt("Name for the clone:", p.name + " (copy)");
    if (!name) return;
    setCloning(p.id);
    try {
      const r = await api.cloneProject(p.id, name);
      await load(); flash(`✅ Cloned as "${r.name}"`);
    } catch (e) { flash("❌ " + e.message); }
    setCloning(null);
  }

  async function markRead(id) {
    await api.markRead(id).catch(() => {});
    setNotif(ns => ns.map(n => n.id === id ? { ...n, read: true } : n));
  }

  // Filter + search + sort
  const visible = projects
    .filter(p => statusFilter === "all" || p.status === statusFilter)
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.description||"").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "name")    return a.name.localeCompare(b.name);
      if (sortBy === "status")  return (a.status||"").localeCompare(b.status||"");
      if (sortBy === "newest")  return new Date(b.created_at||b.createdAt) - new Date(a.created_at||a.createdAt);
      return 0;
    });

  const unread  = notifications.filter(n => !n.read).length;
  const isAdmin = user?.role === "admin" || user?.role === "moderator";
  const runningCount = projects.filter(p => p.status === "running").length;

  return (
    <div className="min-h-screen bg-[#0a0a0f]">

      {/* Navbar */}
      <nav className="border-b border-[#2d2d3e] bg-[#111118] px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-20">
        <div>
          <h1 className="text-lg font-bold text-white">🦅 BrucePanel</h1>
          <p className="text-xs text-slate-600 hidden sm:block">by Bera Tech Org</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {/* BB Coins / Store */}
          {user && (
            <Link to="/store" className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-amber-500/20 transition">
              <span>🪙</span>
              <span className="font-bold">{user.coins?.toLocaleString() || 0}</span>
            </Link>
          )}
          {/* Notification bell */}
          <div className="relative" ref={notifRef}>
            <button onClick={() => setShowNotif(v => !v)}
              className="relative p-2 rounded-lg hover:bg-[#1a1a24] transition text-slate-400 hover:text-white">
              🔔
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
            {showNotif && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-[#111118] border border-[#2d2d3e] rounded-xl shadow-2xl z-50 max-h-96 overflow-y-auto">
                <div className="px-4 py-3 border-b border-[#2d2d3e] flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">Notifications</span>
                  {unread > 0 && <span className="text-xs text-slate-500">{unread} unread</span>}
                </div>
                {notifications.length === 0
                  ? <div className="px-4 py-6 text-center text-slate-500 text-sm">No notifications</div>
                  : notifications.slice(0, 15).map(n => (
                    <div key={n.id} onClick={() => markRead(n.id)}
                      className={`px-4 py-3 border-b border-[#2d2d3e]/50 cursor-pointer hover:bg-[#1a1a24] transition ${!n.read ? "border-l-2 border-l-blue-500" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <span className={`text-xs font-semibold ${!n.read ? "text-white" : "text-slate-300"}`}>{n.title}</span>
                        <span className="text-[10px] text-slate-600 whitespace-nowrap shrink-0">{new Date(n.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{n.message}</p>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
          {/* Nav links */}
          <Link to="/account"  className="hidden sm:block text-slate-400 hover:text-white text-sm transition px-1">Account</Link>
          <Link to="/referral" className="hidden sm:block text-slate-400 hover:text-white text-sm transition px-1">Referral</Link>
          <Link to="/support"  className="hidden sm:block text-blue-400 hover:text-blue-300 text-sm transition px-1">💬 Support</Link>
          {isAdmin && <Link to="/admin" className="hidden sm:block text-red-400 hover:text-red-300 text-sm font-medium transition px-1">Admin</Link>}
          <button onClick={() => setShowNew(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition">+ New</button>
          <button onClick={logout} className="text-slate-500 hover:text-white text-sm transition">Logout</button>
        </div>
      </nav>

      {/* Mobile quick links */}
      <div className="sm:hidden bg-[#111118] border-b border-[#2d2d3e] px-4 py-2 flex gap-4">
        <Link to="/subscribe" className="text-amber-400 text-xs">💳 Subscribe</Link>
        <Link to="/store"     className="text-amber-400 text-xs">🛒 Store</Link>
        <Link to="/referral"  className="text-blue-400  text-xs">👥 Referral</Link>
        <Link to="/support"   className="text-blue-400  text-xs">💬 Support</Link>
        <Link to="/account"   className="text-slate-400 text-xs">👤 Account</Link>
        {isAdmin && <Link to="/admin" className="text-red-400 text-xs font-medium">👑 Admin</Link>}
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* Greeting + flash */}
        {user && (
          <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-white">Welcome back, {user.username} 👋</h2>
              <p className="text-slate-500 text-sm mt-1">
                {runningCount} running · {projects.length} total projects · <span className="text-amber-400">🪙 {user.coins?.toLocaleString() || 0} coins</span>
                {(user.freeAppsUsed || 0) < 2 && <span className="text-green-400 ml-2">· {2 - (user.freeAppsUsed || 0)} free slot{2 - (user.freeAppsUsed || 0) !== 1 ? "s" : ""} left</span>}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Link to="/subscribe" className="text-xs border border-[#2d2d3e] text-slate-400 hover:text-white hover:border-slate-500 px-3 py-1.5 rounded-lg transition">💳 Get Coins</Link>
              <Link to="/store"     className="text-xs border border-amber-800/40 text-amber-400 hover:bg-amber-900/10 px-3 py-1.5 rounded-lg transition">🛒 Store</Link>
              <a href="/status" target="_blank" rel="noreferrer" className="text-xs border border-[#2d2d3e] text-slate-400 hover:text-white px-3 py-1.5 rounded-lg transition">📊 Status</a>
            </div>
          </div>
        )}

        {actionMsg && (
          <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm border ${actionMsg.startsWith("✅") ? "bg-green-900/20 border-green-700/50 text-green-400" : "bg-red-900/20 border-red-700/50 text-red-400"}`}>
            {actionMsg}
          </div>
        )}

        {loading ? (
          <div className="text-slate-500 text-center py-20 animate-pulse">Loading projects...</div>
        ) : (
          <>
            {/* New project form */}
            {showNew && (
              <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white font-semibold">New Project</h3>
                  <button onClick={() => { setShowNew(false); setCreateError(""); }} className="text-slate-500 hover:text-white text-lg">✕</button>
                </div>
                {createError && (
                  <div className="bg-red-900/30 border border-red-700 text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">
                    {createError}
                    {createError.includes("coins") && (
                      <Link to="/store" className="block mt-1.5 text-amber-400 underline text-xs">🛒 Visit Store →</Link>
                    )}
                  </div>
                )}
                <form onSubmit={createProject} className="grid sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="text-slate-400 text-sm block mb-1">Project Name *</label>
                    <input value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500"
                      placeholder="My Telegram Bot" required />
                  </div>
                  <div>
                    <label className="text-slate-400 text-sm block mb-1">Start Command</label>
                    <input value={newForm.startCommand} onChange={e => setNewForm(f => ({ ...f, startCommand: e.target.value }))}
                      className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500"
                      placeholder="node index.js" />
                  </div>
                  <div>
                    <label className="text-slate-400 text-sm block mb-1">GitHub URL <span className="text-slate-600">(optional)</span></label>
                    <input value={newForm.githubUrl} onChange={e => setNewForm(f => ({ ...f, githubUrl: e.target.value }))}
                      className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500"
                      placeholder="https://github.com/user/repo" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-slate-400 text-sm block mb-1">Description <span className="text-slate-600">(optional)</span></label>
                    <input value={newForm.description} onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))}
                      className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500"
                      placeholder="What does this project do?" />
                  </div>
                  <div className="sm:col-span-2 flex gap-3 items-center">
                    <button type="submit" disabled={creating}
                      className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition">
                      {creating ? "Creating..." : "Create Project"}
                    </button>
                    <button type="button" onClick={() => { setShowNew(false); setCreateError(""); }}
                      className="text-slate-400 hover:text-white px-4 py-2.5 text-sm transition">Cancel</button>
                    <span className="text-slate-600 text-xs ml-auto">First 2 projects free · 50 coins/extra</span>
                  </div>
                </form>
              </div>
            )}

            {projects.length === 0 && !showNew ? (
              <div className="text-center py-20 border border-dashed border-[#2d2d3e] rounded-xl">
                <p className="text-5xl mb-4">🚀</p>
                <p className="text-slate-400 mb-2">No projects yet.</p>
                <p className="text-slate-600 text-sm mb-6">Your first 2 projects are completely free.</p>
                <button onClick={() => setShowNew(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg text-sm transition">
                  Create your first project
                </button>
              </div>
            ) : (
              <>
                {/* Search + filter toolbar */}
                {projects.length > 0 && (
                  <div className="flex flex-col sm:flex-row gap-3 mb-5">
                    <div className="relative flex-1">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none">🔍</span>
                      <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search projects..."
                        className="w-full bg-[#111118] border border-[#2d2d3e] rounded-lg pl-9 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 transition" />
                      {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs">✕</button>}
                    </div>
                    {/* Status filter */}
                    <div className="flex gap-1 flex-wrap">
                      {STATUS_FILTERS.map(f => (
                        <button key={f} onClick={() => setStatus(f)}
                          className={`px-3 py-2 rounded-lg text-xs font-medium transition capitalize ${statusFilter === f ? "bg-blue-600 text-white" : "bg-[#111118] border border-[#2d2d3e] text-slate-400 hover:text-white"}`}>
                          {f === "all" ? `All (${projects.length})` : f}
                        </button>
                      ))}
                    </div>
                    {/* Sort */}
                    <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                      className="bg-[#111118] border border-[#2d2d3e] text-slate-400 text-sm rounded-lg px-3 py-2.5 focus:outline-none hover:text-white">
                      <option value="name">Sort: Name</option>
                      <option value="status">Sort: Status</option>
                      <option value="newest">Sort: Newest</option>
                    </select>
                  </div>
                )}

                {/* No results */}
                {visible.length === 0 && (
                  <div className="text-center py-16 border border-dashed border-[#2d2d3e] rounded-xl">
                    <p className="text-slate-500 text-sm">No projects match "{search || statusFilter}"</p>
                    <button onClick={() => { setSearch(""); setStatus("all"); }} className="text-blue-400 text-xs mt-2 hover:underline">Clear filters</button>
                  </div>
                )}

                {/* Projects grid */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {visible.map(p => (
                    <div key={p.id} className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-5 hover:border-[#3d3d4e] transition group">
                      <div className="flex items-start justify-between mb-2">
                        <Link to={`/projects/${p.id}`} className="text-white font-semibold hover:text-blue-400 transition truncate mr-2 text-sm">{p.name}</Link>
                        <span className={`flex items-center gap-1.5 text-xs shrink-0 ${STATUS_TEXT[p.status] || "text-slate-400"}`}>
                          <span className={`w-2 h-2 rounded-full ${p.status === "running" ? "animate-pulse" : ""} ${STATUS_DOT[p.status] || "bg-slate-500"}`} />
                          {p.status}
                        </span>
                      </div>

                      {p.description && <p className="text-slate-500 text-xs mb-2 line-clamp-1">{p.description}</p>}
                      <p className="text-slate-600 text-xs font-mono mb-1 truncate">{p.startCommand || "—"}</p>

                      <div className="flex items-center gap-2 mb-3">
                        {p.isFreeSlot && <span className="text-[10px] bg-green-900/30 text-green-400 border border-green-500/20 px-1.5 py-0.5 rounded">Free</span>}
                        {p.auto_restart && <span className="text-[10px] bg-blue-900/30 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded">Auto-restart</span>}
                        {p.restart_count > 0 && <span className="text-[10px] text-slate-600">↺{p.restart_count}</span>}
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2">
                        {p.status === "running"
                          ? <button onClick={() => doAction(p.id, api.stopProject, "Stopped")} className="flex-1 bg-[#1a1a24] hover:bg-red-900/30 border border-[#2d2d3e] hover:border-red-700/50 text-red-400 text-xs py-1.5 rounded-lg transition">Stop</button>
                          : <button onClick={() => doAction(p.id, api.startProject, "Started")} className="flex-1 bg-[#1a1a24] hover:bg-green-900/30 border border-[#2d2d3e] hover:border-green-700/50 text-green-400 text-xs py-1.5 rounded-lg transition">Start</button>
                        }
                        <Link to={`/projects/${p.id}`} className="flex-1 text-center bg-[#1a1a24] hover:bg-[#22222f] border border-[#2d2d3e] text-blue-400 text-xs py-1.5 rounded-lg transition">Open</Link>
                      </div>

                      {/* Hover extra actions */}
                      <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => cloneProject(p)} disabled={cloning === p.id}
                          className="flex-1 bg-[#1a1a24] border border-[#2d2d3e] text-slate-400 hover:text-white text-xs py-1.5 rounded-lg transition">
                          {cloning === p.id ? "Cloning..." : "⎘ Clone"}
                        </button>
                        <a href={api.logsDownloadUrl(p.id)} download
                          className="flex-1 text-center bg-[#1a1a24] border border-[#2d2d3e] text-slate-400 hover:text-white text-xs py-1.5 rounded-lg transition">
                          ⬇ Logs
                        </a>
                        <a href={api.backupProject(p.id)} download
                          className="flex-1 text-center bg-[#1a1a24] border border-[#2d2d3e] text-slate-400 hover:text-white text-xs py-1.5 rounded-lg transition">
                          💾 ZIP
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <footer className="text-center py-6 text-slate-700 text-xs border-t border-[#1a1a24] mt-8">
        BrucePanel by <a href="https://wa.me/254787527753" target="_blank" rel="noreferrer" className="hover:text-slate-500">Bruce Bera</a> · Bera Tech Org · <a href="/status" target="_blank" rel="noreferrer" className="hover:text-slate-500">Status</a>
      </footer>
    </div>
  );
}
