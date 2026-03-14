import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

const STATUS_DOT  = { running:"bg-green-400", stopped:"bg-slate-500", error:"bg-red-400", installing:"bg-yellow-400", idle:"bg-slate-600" };
const STATUS_TEXT = { running:"text-green-400", stopped:"text-slate-400", error:"text-red-400", installing:"text-yellow-400", idle:"text-slate-500" };
const STATUS_FILTERS = ["all", "running", "stopped", "error", "installing"];

export default function Dashboard() {
  const [user, setUser]               = useState(null);
  const [projects, setProjects]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showNew, setShowNew]         = useState(false);
  const [createMode, setCreateMode]   = useState("github"); // "github" | "zip"
  const [zipFile, setZipFile]         = useState(null);
  const [uploading, setUploading]     = useState(false);
  const [uploadProgress, setProgress] = useState("");

  const [search, setSearch]           = useState("");
  const [statusFilter, setStatus]     = useState("all");
  const [sortBy, setSortBy]           = useState("name");
  const [newForm, setNewForm]         = useState({ name:"", description:"", startCommand:"node index.js", githubUrl:"" });
  const [creating, setCreating]       = useState(false);
  const [createError, setCreateError] = useState("");
  const [cloning, setCloning]         = useState(null);
  const [actionMsg, setActionMsg]     = useState("");

  async function load() {
    try {
      const [me, proj] = await Promise.all([api.me(), api.projects()]);
      setUser(me);
      localStorage.setItem("bp_user", JSON.stringify(me));
      setProjects(proj.projects || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  function flash(m) { setActionMsg(m); setTimeout(() => setActionMsg(""), 3500); }

  function resetNewModal() {
    setShowNew(false); setCreateMode("github"); setZipFile(null);
    setProgress(""); setCreateError("");
    setNewForm({ name:"", description:"", startCommand:"node index.js", githubUrl:"" });
  }

  async function createProject(e) {
    e.preventDefault(); setCreating(true); setCreateError("");
    try {
      // If ZIP mode, don't pass githubUrl
      const payload = createMode === "zip"
        ? { name: newForm.name, description: newForm.description, startCommand: newForm.startCommand }
        : newForm;
      const proj = await api.createProject(payload);

      // Upload ZIP straight after creation if one is selected
      if (createMode === "zip" && zipFile) {
        setUploading(true);
        setProgress("Uploading ZIP...");
        await api.uploadFile(proj.id || proj.projectId, zipFile);
        setProgress("Installing dependencies...");
        await new Promise(r => setTimeout(r, 1500)); // brief pause for UX
        setProgress("");
        setUploading(false);
      }

      resetNewModal();
      await load();
      flash("✅ Project created" + (createMode === "zip" && zipFile ? " and ZIP deployed!" : "!"));
    } catch (err) {
      setUploading(false); setProgress("");
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

  const runningCount = projects.filter(p => p.status === "running").length;

  return (
    <div className="min-h-screen bg-[#0a0a0f]">


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
              <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl mb-6 overflow-hidden">
                {/* Modal header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4">
                  <h3 className="text-white font-semibold text-base">New Project</h3>
                  <button onClick={resetNewModal} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#2d2d3e] text-slate-500 hover:text-white transition text-lg">✕</button>
                </div>

                {/* Deployment method tabs */}
                <div className="flex border-b border-[#2d2d3e] px-6">
                  <button type="button" onClick={() => setCreateMode("github")}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition
                      ${createMode === "github" ? "border-blue-500 text-blue-400" : "border-transparent text-slate-500 hover:text-white"}`}>
                    <span>🐙</span> GitHub Repo
                  </button>
                  <button type="button" onClick={() => setCreateMode("zip")}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition
                      ${createMode === "zip" ? "border-green-500 text-green-400" : "border-transparent text-slate-500 hover:text-white"}`}>
                    <span>📦</span> ZIP Upload
                  </button>
                </div>

                <div className="px-6 py-5">
                  {createError && (
                    <div className="bg-red-900/30 border border-red-700 text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">
                      {createError}
                      {createError.includes("coins") && (
                        <Link to="/store" className="block mt-1.5 text-amber-400 underline text-xs">🛒 Visit Store →</Link>
                      )}
                    </div>
                  )}

                  {/* Upload progress */}
                  {uploading && (
                    <div className="bg-blue-900/20 border border-blue-800/50 text-blue-400 rounded-lg px-4 py-3 mb-4 text-sm flex items-center gap-3">
                      <span className="animate-spin text-base">↻</span>
                      <span>{uploadProgress || "Processing..."}</span>
                    </div>
                  )}

                  <form onSubmit={createProject} className="space-y-4">
                    {/* Common fields */}
                    <div className="grid sm:grid-cols-2 gap-4">
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
                        <label className="text-slate-400 text-sm block mb-1">Description <span className="text-slate-600">(optional)</span></label>
                        <input value={newForm.description} onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))}
                          className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500"
                          placeholder="What does this do?" />
                      </div>
                    </div>

                    {/* GitHub-only field */}
                    {createMode === "github" && (
                      <div>
                        <label className="text-slate-400 text-sm block mb-1">GitHub URL <span className="text-slate-600">(optional)</span></label>
                        <input value={newForm.githubUrl} onChange={e => setNewForm(f => ({ ...f, githubUrl: e.target.value }))}
                          className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500"
                          placeholder="https://github.com/user/repo" />
                        <p className="text-slate-600 text-xs mt-1.5">Leave blank to start with an empty project and upload files later.</p>
                      </div>
                    )}

                    {/* ZIP Upload field */}
                    {createMode === "zip" && (
                      <div>
                        <label className="text-slate-400 text-sm block mb-1">ZIP File <span className="text-slate-600">(optional — can upload after creation too)</span></label>
                        <div
                          onClick={() => document.getElementById("zipInput").click()}
                          className={`w-full border-2 border-dashed rounded-xl px-4 py-8 text-center cursor-pointer transition
                            ${zipFile ? "border-green-600/60 bg-green-900/10" : "border-[#2d2d3e] hover:border-[#3d3d4e] hover:bg-[#1a1a24]"}`}>
                          {zipFile ? (
                            <div>
                              <p className="text-green-400 text-2xl mb-1">📦</p>
                              <p className="text-green-400 font-medium text-sm">{zipFile.name}</p>
                              <p className="text-slate-500 text-xs mt-1">{(zipFile.size / 1024 / 1024).toFixed(2)} MB · Click to change</p>
                            </div>
                          ) : (
                            <div>
                              <p className="text-3xl mb-2">📦</p>
                              <p className="text-slate-300 text-sm font-medium">Click to pick a ZIP file</p>
                              <p className="text-slate-600 text-xs mt-1">Max 100 MB · Your bot/app code in a .zip archive</p>
                            </div>
                          )}
                          <input id="zipInput" type="file" accept=".zip" className="hidden"
                            onChange={e => setZipFile(e.target.files?.[0] || null)} />
                        </div>
                        {zipFile && (
                          <button type="button" onClick={() => setZipFile(null)}
                            className="text-slate-500 hover:text-red-400 text-xs mt-1.5 transition">✕ Remove file</button>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-3 items-center pt-1">
                      <button type="submit" disabled={creating || uploading}
                        className={`px-6 py-2.5 rounded-lg text-sm font-medium text-white transition disabled:opacity-50
                          ${createMode === "zip" ? "bg-green-700 hover:bg-green-600" : "bg-blue-600 hover:bg-blue-500"}`}>
                        {uploading ? uploadProgress || "Uploading..." : creating ? "Creating..." : createMode === "zip" ? "📦 Create & Deploy" : "🐙 Create Project"}
                      </button>
                      <button type="button" onClick={resetNewModal}
                        className="text-slate-400 hover:text-white px-4 py-2.5 text-sm transition">Cancel</button>
                      <span className="text-slate-600 text-xs ml-auto">First 2 projects free · 50 coins/extra</span>
                    </div>
                  </form>
                </div>
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
