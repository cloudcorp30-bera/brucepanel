import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../api";

const STATUS_COLORS = { running: "bg-green-500", stopped: "bg-slate-500", error: "bg-red-500", installing: "bg-yellow-500", idle: "bg-blue-500" };
const STATUS_TEXT = { running: "text-green-400", stopped: "text-slate-400", error: "text-red-400", installing: "text-yellow-400", idle: "text-blue-400" };

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", startCommand: "npm start", githubUrl: "" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const nav = useNavigate();

  const load = async () => { try { setProjects(await api.projects()); } catch {} finally { setLoading(false); } };
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);

  function logout() { localStorage.removeItem("bp_token"); nav("/login"); }

  async function createProject(e) {
    e.preventDefault(); setCreating(true); setError("");
    try {
      const p = await api.createProject({ name: form.name, description: form.description, startCommand: form.startCommand, githubUrl: form.githubUrl });
      setProjects(prev => [p, ...prev]);
      setShowNew(false); setForm({ name: "", description: "", startCommand: "npm start", githubUrl: "" });
    } catch (e) { setError(e.message); }
    finally { setCreating(false); }
  }

  async function action(id, fn) { try { await fn(id); load(); } catch (e) { alert(e.message); } }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <nav className="border-b border-[#2d2d3e] bg-[#111118] px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">BrucePanel</h1>
          <p className="text-xs text-slate-500">Node.js Hosting by Bera Tech Org</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowNew(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition">+ New Project</button>
          <button onClick={logout} className="text-slate-400 hover:text-white text-sm transition">Logout</button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {loading ? <div className="text-slate-500 text-center py-20">Loading projects...</div> : (
          <>
            {projects.length === 0 && !showNew && (
              <div className="text-center py-20">
                <p className="text-slate-500 mb-4">No projects yet.</p>
                <button onClick={() => setShowNew(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg text-sm transition">Create your first project</button>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {projects.map(p => (
                <div key={p.id} className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-5 hover:border-[#3d3d4e] transition">
                  <div className="flex items-start justify-between mb-3">
                    <Link to={`/projects/${p.id}`} className="text-white font-semibold hover:text-blue-400 transition">{p.name}</Link>
                    <span className={`flex items-center gap-1.5 text-xs ${STATUS_TEXT[p.status]}`}>
                      <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[p.status]}`} />
                      {p.status}
                    </span>
                  </div>
                  {p.description && <p className="text-slate-500 text-sm mb-3 line-clamp-2">{p.description}</p>}
                  <p className="text-slate-600 text-xs font-mono mb-1">{p.startCommand}</p>
                  {p.uptime && <p className="text-slate-600 text-xs">Uptime: {p.uptime}</p>}
                  <div className="flex gap-2 mt-4">
                    {p.status === "running"
                      ? <button onClick={() => action(p.id, api.stopProject)} className="flex-1 bg-[#1a1a24] hover:bg-red-900/30 border border-[#2d2d3e] hover:border-red-700 text-red-400 text-xs py-1.5 rounded-lg transition">Stop</button>
                      : <button onClick={() => action(p.id, api.startProject)} className="flex-1 bg-[#1a1a24] hover:bg-green-900/30 border border-[#2d2d3e] hover:border-green-700 text-green-400 text-xs py-1.5 rounded-lg transition">Start</button>
                    }
                    <button onClick={() => action(p.id, api.restartProject)} className="flex-1 bg-[#1a1a24] hover:bg-[#22222f] border border-[#2d2d3e] text-slate-400 text-xs py-1.5 rounded-lg transition">Restart</button>
                    <Link to={`/projects/${p.id}`} className="flex-1 text-center bg-[#1a1a24] hover:bg-[#22222f] border border-[#2d2d3e] text-blue-400 text-xs py-1.5 rounded-lg transition">Details</Link>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-8 w-full max-w-md">
            <h2 className="text-white font-semibold text-lg mb-6">New Project</h2>
            {error && <div className="bg-red-900/30 border border-red-700 text-red-400 rounded-lg px-4 py-2.5 mb-4 text-sm">{error}</div>}
            <form onSubmit={createProject} className="space-y-4">
              {[["Name", "name", "My Bot"], ["Start Command", "startCommand", "npm start"], ["GitHub URL (optional)", "githubUrl", "https://github.com/..."], ["Description (optional)", "description", ""]].map(([label, key, ph]) => (
                <div key={key}>
                  <label className="text-slate-400 text-sm block mb-1">{label}</label>
                  <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={ph} className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition" required={key === "name" || key === "startCommand"} />
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowNew(false); setError(""); }} className="flex-1 border border-[#2d2d3e] text-slate-400 rounded-lg py-2.5 hover:bg-[#1a1a24] transition">Cancel</button>
                <button type="submit" disabled={creating} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg py-2.5 transition">{creating ? "Creating..." : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className="text-center py-6 text-slate-600 text-xs border-t border-[#111118]">
        BrucePanel by <a href="https://wa.me/254787527753" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-300">Bruce Bera</a> — Bera Tech Org
      </footer>
    </div>
  );
}
