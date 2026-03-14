import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../api";

const STATUS_COLORS = { running: "bg-green-500", stopped: "bg-slate-500", error: "bg-red-500", installing: "bg-yellow-500", idle: "bg-blue-500" };
const STATUS_TEXT = { running: "text-green-400", stopped: "text-slate-400", error: "text-red-400", installing: "text-yellow-400", idle: "text-blue-400" };

export default function ProjectDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [project, setProject] = useState(null);
  const [tab, setTab] = useState("logs");
  const [logs, setLogs] = useState([]);
  const [live, setLive] = useState(false);
  const [env, setEnv] = useState({});
  const [envRows, setEnvRows] = useState([["", ""]]);
  const [saving, setS] = useState(false);
  const [settings, setSettings] = useState({});
  const [deploying, setD] = useState(false);
  const [msg, setMsg] = useState("");
  const logsRef = useRef(null);

  const load = async () => { try { setProject(await api.getProject(id)); } catch {} };
  const loadLogs = async () => {
    try { const r = await api.getLogs(id); setLogs(r.logs); setTimeout(() => { if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight; }, 50); } catch {}
  };

  useEffect(() => { load(); loadLogs(); }, [id]);
  useEffect(() => { if (project) setSettings({ name: project.name, description: project.description || "", startCommand: project.startCommand, githubUrl: project.githubUrl || "" }); }, [project]);
  useEffect(() => { if (live) { const t = setInterval(() => { load(); loadLogs(); }, 3000); return () => clearInterval(t); } }, [live]);
  useEffect(() => { if (tab === "env") api.getEnv(id).then(r => { setEnv(r.env); setEnvRows(Object.entries(r.env).length ? Object.entries(r.env) : [["", ""]]); }).catch(() => {}); }, [tab]);

  async function action(fn, label) { setMsg(""); try { await fn(id); setMsg(`✅ ${label}`); load(); loadLogs(); } catch (e) { setMsg(`❌ ${e.message}`); } }
  async function saveEnv(e) { e.preventDefault(); setS(true); try { const obj = Object.fromEntries(envRows.filter(([k]) => k)); await api.updateEnv(id, obj); setMsg("✅ Environment saved"); } catch (e) { setMsg(`❌ ${e.message}`); } finally { setS(false); } }
  async function deploy(e) { e.preventDefault(); setD(true); setMsg(""); try { await api.deployProject(id, { githubUrl: settings.githubUrl }); setMsg("✅ Deploy started"); load(); loadLogs(); } catch (e) { setMsg(`❌ ${e.message}`); } finally { setD(false); } }

  if (!project) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-slate-500">Loading...</div>;

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <nav className="border-b border-[#2d2d3e] bg-[#111118] px-6 py-4 flex items-center gap-4">
        <Link to="/" className="text-slate-400 hover:text-white text-sm transition">← Dashboard</Link>
        <span className="text-slate-600">/</span>
        <h1 className="text-white font-semibold">{project.name}</h1>
        <span className={`flex items-center gap-1.5 text-xs ml-2 ${STATUS_TEXT[project.status]}`}>
          <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[project.status]}`} />
          {project.status}
        </span>
        {project.uptime && <span className="text-slate-600 text-xs">Uptime: {project.uptime}</span>}
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {msg && <div className={`rounded-lg px-4 py-2.5 mb-4 text-sm ${msg.startsWith("✅") ? "bg-green-900/30 border border-green-700 text-green-400" : "bg-red-900/30 border border-red-700 text-red-400"}`}>{msg}</div>}

        <div className="flex flex-wrap gap-2 mb-6">
          {project.status === "running"
            ? <button onClick={() => action(api.stopProject, "Stopped")} className="bg-[#111118] hover:bg-red-900/30 border border-[#2d2d3e] hover:border-red-700 text-red-400 px-4 py-2 rounded-lg text-sm transition">■ Stop</button>
            : <button onClick={() => action(api.startProject, "Started")} className="bg-[#111118] hover:bg-green-900/30 border border-[#2d2d3e] hover:border-green-700 text-green-400 px-4 py-2 rounded-lg text-sm transition">▶ Start</button>
          }
          <button onClick={() => action(api.restartProject, "Restarted")} className="bg-[#111118] hover:bg-[#1a1a24] border border-[#2d2d3e] text-slate-300 px-4 py-2 rounded-lg text-sm transition">↺ Restart</button>
          <button onClick={() => action(api.reinstallProject, "Reinstalling...")} className="bg-[#111118] hover:bg-[#1a1a24] border border-[#2d2d3e] text-yellow-400 px-4 py-2 rounded-lg text-sm transition">⟳ Reinstall</button>
          <button onClick={() => { if (confirm("Delete this project?")) { api.deleteProject(id).then(() => nav("/")); } }} className="ml-auto bg-[#111118] hover:bg-red-900/30 border border-[#2d2d3e] hover:border-red-700 text-red-500 px-4 py-2 rounded-lg text-sm transition">Delete</button>
        </div>

        <div className="flex border-b border-[#2d2d3e] mb-6">
          {["logs", "env", "settings"].map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-5 py-2.5 text-sm capitalize transition border-b-2 -mb-px ${tab === t ? "border-blue-500 text-blue-400" : "border-transparent text-slate-500 hover:text-slate-300"}`}>{t === "env" ? "Environment" : t === "logs" ? "Logs" : "Settings"}</button>
          ))}
        </div>

        {tab === "logs" && (
          <div>
            <div className="flex justify-between items-center mb-3">
              <button onClick={() => { loadLogs(); }} className="text-slate-500 hover:text-white text-xs transition">↻ Refresh</button>
              <label className="flex items-center gap-2 text-slate-500 text-xs cursor-pointer">
                <input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} className="rounded" />
                Live (every 3s)
              </label>
            </div>
            <div ref={logsRef} className="bg-[#0a0a0f] border border-[#2d2d3e] rounded-xl p-4 h-96 overflow-y-auto font-mono text-xs text-slate-300 space-y-0.5">
              {logs.map((line, i) => <div key={i} className={`${line.includes("[ERR]") ? "text-red-400" : line.includes("✅") ? "text-green-400" : "text-slate-300"}`}>{line}</div>)}
            </div>
          </div>
        )}

        {tab === "env" && (
          <form onSubmit={saveEnv} className="space-y-3">
            <p className="text-slate-500 text-sm mb-4">Set environment variables available to your project at runtime.</p>
            {envRows.map(([k, v], i) => (
              <div key={i} className="flex gap-2">
                <input value={k} onChange={e => setEnvRows(r => r.map((row, j) => j === i ? [e.target.value, row[1]] : row))} placeholder="KEY" className="flex-1 bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500 transition" />
                <input value={v} onChange={e => setEnvRows(r => r.map((row, j) => j === i ? [row[0], e.target.value] : row))} placeholder="value" className="flex-2 w-2/3 bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500 transition" />
                <button type="button" onClick={() => setEnvRows(r => r.filter((_, j) => j !== i))} className="text-slate-600 hover:text-red-400 px-2 transition">✕</button>
              </div>
            ))}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setEnvRows(r => [...r, ["", ""]])} className="text-blue-400 hover:text-blue-300 text-sm transition">+ Add variable</button>
              <button type="submit" disabled={saving} className="ml-auto bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm transition">{saving ? "Saving..." : "Save"}</button>
            </div>
          </form>
        )}

        {tab === "settings" && (
          <div className="space-y-6">
            <form onSubmit={deploy} className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-6 space-y-4">
              <h3 className="text-white font-medium">Deploy from GitHub</h3>
              <div>
                <label className="text-slate-400 text-sm block mb-1">GitHub URL</label>
                <input value={settings.githubUrl || ""} onChange={e => setSettings(s => ({ ...s, githubUrl: e.target.value }))} placeholder="https://github.com/user/repo" className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition" />
              </div>
              <div>
                <label className="text-slate-400 text-sm block mb-1">Start Command</label>
                <input value={settings.startCommand || ""} onChange={e => setSettings(s => ({ ...s, startCommand: e.target.value }))} className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500 transition" />
              </div>
              <button type="submit" disabled={deploying} className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition">{deploying ? "Deploying..." : "🚀 Deploy"}</button>
            </form>

            <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-6 space-y-3">
              <h3 className="text-white font-medium">Project Info</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-slate-500">ID</p><p className="text-slate-300 font-mono text-xs mt-0.5">{project.id}</p></div>
                <div><p className="text-slate-500">Status</p><p className={`mt-0.5 ${STATUS_TEXT[project.status]}`}>{project.status}</p></div>
                <div><p className="text-slate-500">Start Command</p><p className="text-slate-300 font-mono text-xs mt-0.5">{project.startCommand}</p></div>
                <div><p className="text-slate-500">Created</p><p className="text-slate-300 text-xs mt-0.5">{new Date(project.createdAt).toLocaleDateString()}</p></div>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="text-center py-6 text-slate-600 text-xs">
        BrucePanel by <a href="https://wa.me/254787527753" target="_blank" rel="noreferrer" className="hover:text-slate-400">Bruce Bera</a> — Bera Tech Org
      </footer>
    </div>
  );
}
