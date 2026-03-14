import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api";

const STATUS_COLORS = { running:"bg-green-500", stopped:"bg-slate-500", error:"bg-red-500", installing:"bg-yellow-500", idle:"bg-blue-500" };
const STATUS_TEXT   = { running:"text-green-400", stopped:"text-slate-400", error:"text-red-400", installing:"text-yellow-400", idle:"text-blue-400" };

const TEXT_EXT = new Set(["js","jsx","ts","tsx","json","env","md","txt","sh","py","rb","go","java","cpp","c","h","css","html","xml","yaml","yml","toml","ini","conf","log","sql"]);
function isText(name) { return TEXT_EXT.has(name.split(".").pop()?.toLowerCase() || ""); }

// ─── File tree node ───────────────────────────────────────────────────────
function FileNode({ node, depth = 0, onSelect, selected }) {
  const [open, setOpen] = useState(depth < 2);
  const isSelected = selected === node.path;
  const pad = depth * 14;

  if (node.type === "dir") return (
    <div>
      <div onClick={() => setOpen(o => !o)} style={{ paddingLeft: pad + 6 }}
        className="flex items-center gap-1.5 py-1 px-2 hover:bg-[#1a1a24] cursor-pointer rounded text-slate-400 hover:text-slate-200 text-xs select-none">
        <span className="text-slate-600">{open ? "▼" : "▶"}</span>
        <span className="text-blue-300">📁</span>
        <span className="font-medium">{node.name}</span>
      </div>
      {open && node.children?.map(c => (
        <FileNode key={c.path} node={c} depth={depth + 1} onSelect={onSelect} selected={selected} />
      ))}
    </div>
  );

  return (
    <div onClick={() => isText(node.name) && onSelect(node)}
      style={{ paddingLeft: pad + 6 }}
      className={`flex items-center gap-1.5 py-1 px-2 rounded text-xs cursor-pointer select-none transition
        ${isSelected ? "bg-blue-600/20 text-blue-300" : "hover:bg-[#1a1a24] text-slate-400 hover:text-slate-200"}
        ${!isText(node.name) ? "opacity-60 cursor-default" : ""}`}>
      <span className="w-3" />
      <span>📄</span>
      <span>{node.name}</span>
      {node.size && <span className="ml-auto text-[10px] text-slate-600">{node.size > 1024 ? (node.size/1024).toFixed(1)+"k" : node.size+"b"}</span>}
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
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

  // File manager state
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState("");
  const [fileSaving, setFileSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const fileInputRef = useRef(null);

  const load = useCallback(async () => { try { setProject(await api.getProject(id)); } catch {} }, [id]);
  const loadLogs = useCallback(async () => {
    try { const r = await api.getLogs(id); setLogs(r.logs); setTimeout(() => { if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight; }, 50); } catch {}
  }, [id]);
  const loadFiles = useCallback(async () => {
    try { const r = await api.listFiles(id); setFiles(r.files || []); } catch {}
  }, [id]);

  useEffect(() => { load(); loadLogs(); }, [id]);
  useEffect(() => { if (project) setSettings({ name: project.name, description: project.description || "", startCommand: project.startCommand, githubUrl: project.githubUrl || "" }); }, [project]);
  useEffect(() => { if (live) { const t = setInterval(() => { load(); loadLogs(); }, 3000); return () => clearInterval(t); } }, [live]);
  useEffect(() => { if (tab === "env") api.getEnv(id).then(r => { setEnv(r.env); setEnvRows(Object.entries(r.env).length ? Object.entries(r.env) : [["", ""]]); }).catch(() => {}); }, [tab]);
  useEffect(() => { if (tab === "files") loadFiles(); }, [tab]);

  function flash(m) { setMsg(m); setTimeout(() => setMsg(""), 4000); }

  async function action(fn, label) { setMsg(""); try { await fn(id); flash(`✅ ${label}`); load(); loadLogs(); } catch (e) { flash(`❌ ${e.message}`); } }
  async function saveEnv(e) { e.preventDefault(); setS(true); try { const obj = Object.fromEntries(envRows.filter(([k]) => k)); await api.updateEnv(id, obj); flash("✅ Environment saved"); } catch (e) { flash(`❌ ${e.message}`); } finally { setS(false); } }
  async function deploy(e) { e.preventDefault(); setD(true); setMsg(""); try { await api.deployProject(id, { githubUrl: settings.githubUrl }); flash("✅ Deploy started"); load(); loadLogs(); } catch (e) { flash(`❌ ${e.message}`); } finally { setD(false); } }

  async function openFile(node) {
    setSelectedFile(node);
    setFileContent("Loading...");
    try { const r = await api.getFileContent(id, node.path); setFileContent(r.content); }
    catch (e) { setFileContent(`// Error: ${e.message}`); }
  }

  async function saveFile() {
    if (!selectedFile) return;
    setFileSaving(true);
    try { await api.saveFileContent(id, selectedFile.path, fileContent); flash("✅ File saved"); }
    catch (e) { flash(`❌ ${e.message}`); }
    setFileSaving(false);
  }

  async function deleteFile(node) {
    if (!confirm(`Delete "${node.path}"? This cannot be undone.`)) return;
    try {
      await api.deleteFile(id, node.path);
      if (selectedFile?.path === node.path) { setSelectedFile(null); setFileContent(""); }
      await loadFiles();
      flash(`✅ Deleted ${node.name}`);
    } catch (e) { flash(`❌ ${e.message}`); }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadProgress(`Uploading ${file.name}...`);
    try {
      await api.uploadFile(id, file);
      setUploadProgress(`✅ ${file.name} uploaded!`);
      await loadFiles();
      setTimeout(() => setUploadProgress(""), 3000);
    } catch (err) {
      setUploadProgress(`❌ ${err.message}`);
      setTimeout(() => setUploadProgress(""), 4000);
    }
    setUploading(false);
    e.target.value = "";
  }

  if (!project) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-slate-500">Loading...</div>;
  const canStop = project.status === "running" || project.status === "error" || project.status === "installing";

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <nav className="border-b border-[#2d2d3e] bg-[#111118] px-4 sm:px-6 py-4 flex items-center gap-3 flex-wrap">
        <Link to="/" className="text-slate-400 hover:text-white text-sm transition">← Dashboard</Link>
        <span className="text-slate-600">/</span>
        <h1 className="text-white font-semibold">{project.name}</h1>
        <span className={`flex items-center gap-1.5 text-xs ${STATUS_TEXT[project.status]}`}>
          <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[project.status]}`} />
          {project.status}
        </span>
        {project.uptime && <span className="text-slate-600 text-xs ml-1">Uptime: {project.uptime}</span>}
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {msg && <div className={`rounded-lg px-4 py-2.5 mb-4 text-sm ${msg.startsWith("✅") ? "bg-green-900/30 border border-green-700 text-green-400" : "bg-red-900/30 border border-red-700 text-red-400"}`}>{msg}</div>}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 mb-6">
          {project.status !== "running" && project.status !== "installing" && (
            <button onClick={() => action(api.startProject, "Started")} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition">▶ Start</button>
          )}
          {canStop && (
            <button onClick={() => action(api.stopProject, "Stopped")} className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition">■ Stop</button>
          )}
          <button onClick={() => { load(); loadLogs(); }} className="bg-[#1a1a24] hover:bg-[#22222f] border border-[#2d2d3e] text-slate-300 px-4 py-2 rounded-lg text-sm transition">↻ Refresh</button>
          <button onClick={() => setLive(l => !l)} className={`px-4 py-2 rounded-lg text-sm border transition ${live ? "bg-blue-600/20 border-blue-500 text-blue-400" : "bg-[#1a1a24] border-[#2d2d3e] text-slate-400 hover:text-white"}`}>
            {live ? "● Live" : "○ Live"}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#2d2d3e] mb-6 overflow-x-auto gap-1">
          {["logs","files","env","settings"].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition capitalize whitespace-nowrap ${tab === t ? "border-blue-500 text-blue-400" : "border-transparent text-slate-400 hover:text-white"}`}>
              {t === "files" ? "📁 Files" : t === "logs" ? "📋 Logs" : t === "env" ? "🔐 Env" : "⚙️ Settings"}
            </button>
          ))}
        </div>

        {/* Logs */}
        {tab === "logs" && (
          <div ref={logsRef} className="bg-[#0d0d14] border border-[#2d2d3e] rounded-xl p-4 h-[500px] overflow-y-auto font-mono text-xs text-slate-300 space-y-0.5">
            {logs.length === 0 ? (
              <p className="text-slate-600 text-center py-8">No logs yet. Start your project to see output.</p>
            ) : logs.map((l, i) => (
              <div key={i} className={l.includes("ERROR") || l.includes("error") ? "text-red-400" : l.includes("WARN") || l.includes("warn") ? "text-yellow-400" : "text-slate-300"}>
                {l}
              </div>
            ))}
          </div>
        )}

        {/* Files */}
        {tab === "files" && (
          <div className="space-y-4">
            {/* Upload section */}
            <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-5">
              <h3 className="text-white font-semibold mb-1">Upload Files</h3>
              <p className="text-slate-500 text-xs mb-3">Upload a ZIP file (auto-extracted) or any single file to your project directory.</p>
              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2">
                  {uploading ? <><span className="animate-spin">⟳</span> Uploading...</> : "⬆ Upload ZIP / File"}
                </button>
                {uploadProgress && (
                  <span className={`text-sm ${uploadProgress.startsWith("✅") ? "text-green-400" : uploadProgress.startsWith("❌") ? "text-red-400" : "text-slate-400"}`}>
                    {uploadProgress}
                  </span>
                )}
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload}
                  accept=".zip,.js,.jsx,.ts,.tsx,.json,.env,.py,.rb,.sh,.md,.txt,.html,.css,.yaml,.yml,.toml" />
              </div>
              <div className="mt-3 p-3 bg-[#0d0d14] border border-[#2d2d3e] rounded-lg">
                <p className="text-slate-600 text-xs leading-relaxed">
                  💡 <strong className="text-slate-500">WhatsApp bot?</strong> Zip your bot folder and upload. The ZIP is auto-extracted — files go directly into your project directory. Then set your start command (e.g. <code className="text-blue-400">node index.js</code>) and hit Start.
                </p>
              </div>
            </div>

            {/* File manager */}
            <div className="grid lg:grid-cols-[280px_1fr] gap-4">
              {/* File tree */}
              <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#2d2d3e]">
                  <span className="text-white text-sm font-semibold">Files</span>
                  <button onClick={loadFiles} className="text-slate-500 hover:text-white text-xs transition">↻</button>
                </div>
                <div className="overflow-y-auto max-h-[450px] py-1">
                  {files.length === 0 ? (
                    <div className="text-center py-8 text-slate-600 text-xs">
                      <p>No files yet.</p>
                      <p className="mt-1">Upload a ZIP to get started.</p>
                    </div>
                  ) : files.map(node => (
                    <FileNode key={node.path} node={node} onSelect={openFile} selected={selectedFile?.path} />
                  ))}
                </div>
              </div>

              {/* File editor */}
              <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl overflow-hidden flex flex-col">
                {selectedFile ? (
                  <>
                    <div className="flex items-center justify-between px-4 py-3 border-b border-[#2d2d3e]">
                      <span className="text-slate-300 text-xs font-mono truncate">{selectedFile.path}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={saveFile} disabled={fileSaving}
                          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1 rounded text-xs font-medium transition">
                          {fileSaving ? "Saving..." : "💾 Save"}
                        </button>
                        <button onClick={() => deleteFile(selectedFile)}
                          className="bg-red-900/30 hover:bg-red-900/50 border border-red-700 text-red-400 px-3 py-1 rounded text-xs transition">
                          🗑️ Delete
                        </button>
                        <button onClick={() => { setSelectedFile(null); setFileContent(""); }}
                          className="text-slate-500 hover:text-white text-xs transition px-1">✕</button>
                      </div>
                    </div>
                    <textarea
                      value={fileContent}
                      onChange={e => setFileContent(e.target.value)}
                      className="flex-1 bg-[#0d0d14] text-slate-300 font-mono text-xs p-4 resize-none focus:outline-none min-h-[400px] leading-relaxed"
                      spellCheck={false}
                    />
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full min-h-[200px] text-slate-600 text-sm flex-col gap-2">
                    <span className="text-3xl">📝</span>
                    <p>Click a text file to edit it</p>
                    <p className="text-xs text-slate-700">Binary files cannot be edited</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Env */}
        {tab === "env" && (
          <form onSubmit={saveEnv} className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-6 space-y-3">
            <h3 className="text-white font-medium mb-2">Environment Variables</h3>
            <p className="text-slate-500 text-xs mb-3">These are passed to your project on start. Restart your project to apply changes.</p>
            {envRows.map(([k, v], i) => (
              <div key={i} className="flex gap-2">
                <input value={k} onChange={e => setEnvRows(r => r.map((row, j) => j === i ? [e.target.value, row[1]] : row))}
                  placeholder="KEY" className="flex-1 bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500 transition" />
                <input value={v} onChange={e => setEnvRows(r => r.map((row, j) => j === i ? [row[0], e.target.value] : row))}
                  placeholder="value" className="flex-[2] bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500 transition" />
                <button type="button" onClick={() => setEnvRows(r => r.filter((_, j) => j !== i))} className="text-slate-600 hover:text-red-400 px-2 transition">✕</button>
              </div>
            ))}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setEnvRows(r => [...r, ["", ""]])} className="text-blue-400 hover:text-blue-300 text-sm transition">+ Add variable</button>
              <button type="submit" disabled={saving} className="ml-auto bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm transition">{saving ? "Saving..." : "Save"}</button>
            </div>
          </form>
        )}

        {/* Settings */}
        {tab === "settings" && (
          <div className="space-y-6">
            <form onSubmit={deploy} className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-6 space-y-4">
              <h3 className="text-white font-medium">Deploy from GitHub</h3>
              <p className="text-slate-500 text-xs">Paste a GitHub repo URL to clone and run. Or use the Files tab to upload a ZIP directly.</p>
              <div>
                <label className="text-slate-400 text-sm block mb-1">GitHub URL</label>
                <input value={settings.githubUrl || ""} onChange={e => setSettings(s => ({ ...s, githubUrl: e.target.value }))}
                  placeholder="https://github.com/user/repo"
                  className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition" />
              </div>
              <div>
                <label className="text-slate-400 text-sm block mb-1">Start Command</label>
                <input value={settings.startCommand || ""} onChange={e => setSettings(s => ({ ...s, startCommand: e.target.value }))}
                  className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500 transition" />
              </div>
              <button type="submit" disabled={deploying} className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition">
                {deploying ? "Deploying..." : "🚀 Deploy from GitHub"}
              </button>
            </form>

            <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-6 space-y-3">
              <h3 className="text-white font-medium">Project Info</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-slate-500 text-xs">ID</p><p className="text-slate-300 font-mono text-xs mt-0.5">{project.id}</p></div>
                <div><p className="text-slate-500 text-xs">Status</p><p className={`mt-0.5 text-sm ${STATUS_TEXT[project.status]}`}>{project.status}</p></div>
                <div><p className="text-slate-500 text-xs">Start Command</p><p className="text-slate-300 font-mono text-xs mt-0.5">{project.startCommand}</p></div>
                <div><p className="text-slate-500 text-xs">Created</p><p className="text-slate-300 text-xs mt-0.5">{new Date(project.createdAt || project.created_at).toLocaleDateString()}</p></div>
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
