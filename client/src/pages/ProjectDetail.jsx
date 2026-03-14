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

// ─── npm Package Manager Component ────────────────────────────────────────
function NpmManager({ projectId, onLog }) {
  const [pkgs, setPkgs] = useState([]);
  const [input, setInput] = useState("");
  const [dev, setDev] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  function flash(m) { setMsg(m); setTimeout(() => setMsg(""), 5000); }

  useEffect(() => {
    api.npmPackages(projectId).then(r => { setPkgs(r.packages || []); setLoading(false); }).catch(() => setLoading(false));
  }, [projectId]);

  async function install(e) {
    e.preventDefault();
    if (!input.trim()) return;
    const packages = input.trim().split(/[\s,]+/).filter(Boolean);
    try {
      await api.npmInstall(projectId, packages, dev);
      flash(`Installing ${packages.join(", ")}... Check Logs tab for progress.`);
      setInput(""); onLog();
    } catch (e) { flash("❌ " + e.message); }
  }

  async function uninstall(name) {
    if (!confirm(`Uninstall ${name}?`)) return;
    try { await api.npmUninstall(projectId, [name]); setPkgs(p => p.filter(x => x.name !== name)); flash(`Uninstalled ${name}. Check Logs tab.`); onLog(); }
    catch (e) { flash("❌ " + e.message); }
  }

  return (
    <div className="px-4 sm:px-6 pb-8 space-y-4">
      {msg && <div className="bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-sm text-green-400">{msg}</div>}
      <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-5 space-y-3">
        <h3 className="text-white font-semibold">📦 Install Package</h3>
        <form onSubmit={install} className="flex gap-2 flex-wrap">
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="e.g. express axios lodash"
            className="flex-1 min-w-0 bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-blue-500" />
          <label className="flex items-center gap-1.5 text-slate-400 text-sm px-1 cursor-pointer">
            <input type="checkbox" checked={dev} onChange={e => setDev(e.target.checked)} className="accent-blue-500" />
            --save-dev
          </label>
          <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition">Install</button>
        </form>
        <p className="text-slate-600 text-xs">Separate multiple packages with spaces. Installation output appears in the Logs tab.</p>
      </div>
      <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl">
        <div className="px-5 py-3 border-b border-[#2d2d3e] flex items-center justify-between">
          <h3 className="text-white font-semibold text-sm">Installed Packages</h3>
          <span className="text-slate-500 text-xs">{pkgs.length} packages</span>
        </div>
        {loading ? <div className="text-center py-8 text-slate-600 text-sm animate-pulse">Loading...</div> :
         pkgs.length === 0 ? <div className="text-center py-8 text-slate-600 text-sm">No packages found (no package.json?)</div> :
          <div className="divide-y divide-[#2d2d3e]/50 max-h-80 overflow-y-auto">
            {pkgs.map(p => (
              <div key={p.name} className="flex items-center justify-between px-5 py-2.5 hover:bg-[#1a1a24] transition">
                <div className="flex items-center gap-3">
                  <span className="text-slate-200 text-sm font-mono">{p.name}</span>
                  <span className="text-slate-600 text-xs">{p.version}</span>
                  {p.dev && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400">dev</span>}
                </div>
                <button onClick={() => uninstall(p.name)} className="text-red-400 hover:text-red-300 text-xs px-2 py-1 hover:bg-red-900/20 rounded transition">Remove</button>
              </div>
            ))}
          </div>
        }
      </div>
    </div>
  );
}

// ─── Webhook Panel Component ───────────────────────────────────────────────
function WebhookPanel({ projectId }) {
  const [webhook, setWebhook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.getWebhook(projectId).then(setWebhook).catch(() => {}).finally(() => setLoading(false));
  }, [projectId]);

  async function regen() {
    if (!confirm("Regenerate webhook URL? The old URL will stop working.")) return;
    try { setWebhook(await api.regenWebhook(projectId)); } catch {}
  }

  function copy(text) {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  return (
    <div className="px-4 sm:px-6 pb-8">
      <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-6 space-y-5">
        <div>
          <h3 className="text-white font-semibold">🔗 Auto-Deploy Webhook</h3>
          <p className="text-slate-500 text-sm mt-1">Connect this URL to GitHub → Settings → Webhooks. Every push to your repo will automatically re-pull and restart this project.</p>
        </div>
        {loading ? <div className="text-slate-600 text-sm animate-pulse">Loading...</div> : webhook && (
          <>
            <div>
              <label className="text-slate-400 text-xs block mb-1.5">Webhook URL</label>
              <div className="flex gap-2">
                <input readOnly value={webhook.webhookUrl}
                  className="flex-1 bg-[#0d0d14] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-green-400 font-mono text-xs focus:outline-none" />
                <button onClick={() => copy(webhook.webhookUrl)} className="bg-[#1a1a24] hover:bg-[#22222f] border border-[#2d2d3e] text-slate-300 hover:text-white px-4 py-2 rounded-lg text-sm transition">
                  {copied ? "✅ Copied" : "Copy"}
                </button>
              </div>
            </div>
            <div className="bg-blue-900/10 border border-blue-800/40 rounded-lg p-4 space-y-2">
              <p className="text-blue-300 text-sm font-medium">GitHub Setup</p>
              <ol className="text-slate-400 text-sm space-y-1.5 list-decimal list-inside">
                <li>Go to your GitHub repo → <strong>Settings → Webhooks → Add webhook</strong></li>
                <li>Paste the URL above as the <strong>Payload URL</strong></li>
                <li>Set <strong>Content type</strong> to <code className="bg-[#2d2d3e] px-1 rounded text-xs">application/json</code></li>
                <li>Choose <strong>Just the push event</strong></li>
                <li>Click <strong>Add webhook</strong> — you're done!</li>
              </ol>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-slate-600 text-xs">Webhook secret for security reference: <span className="font-mono text-slate-500">{webhook.secret?.slice(0,8)}...</span></p>
              <button onClick={regen} className="text-xs text-red-400 hover:text-red-300 border border-red-900 px-3 py-1.5 rounded-lg hover:bg-red-900/20 transition">↺ Regenerate URL</button>
            </div>
          </>
        )}
      </div>
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
  const [autoRestart, setAutoRestart] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
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
  useEffect(() => { if (project) { setAutoRestart(!!project.auto_restart); setSettings({ name: project.name, description: project.description || "", startCommand: project.startCommand, githubUrl: project.githubUrl || "" }); } }, [project]);
  useEffect(() => { if (live) { const t = setInterval(() => { load(); loadLogs(); }, 3000); return () => clearInterval(t); } }, [live]);
  useEffect(() => { if (tab === "env") api.getEnv(id).then(r => { setEnv(r.env); setEnvRows(Object.entries(r.env).length ? Object.entries(r.env) : [["", ""]]); }).catch(() => {}); }, [tab]);
  useEffect(() => { if (tab === "files") loadFiles(); }, [tab]);

  function flash(m) { setMsg(m); setTimeout(() => setMsg(""), 4000); }

  async function action(fn, label) { setMsg(""); try { await fn(id); flash(`✅ ${label}`); load(); loadLogs(); } catch (e) { flash(`❌ ${e.message}`); } }
  async function saveEnv(e) { e.preventDefault(); setS(true); try { const obj = Object.fromEntries(envRows.filter(([k]) => k)); await api.updateEnv(id, obj); flash("✅ Environment saved"); } catch (e) { flash(`❌ ${e.message}`); } finally { setS(false); } }
  async function deploy(e) { e.preventDefault(); setD(true); setMsg(""); try { await api.deployProject(id, { githubUrl: settings.githubUrl }); flash("✅ Deploy started"); load(); loadLogs(); } catch (e) { flash(`❌ ${e.message}`); } finally { setD(false); } }

  async function saveSettings() {
    setSavingSettings(true);
    try {
      await api.updateProjectSettings(id, {
        name: settings.name, description: settings.description,
        startCommand: settings.startCommand, githubUrl: settings.githubUrl, autoRestart
      });
      flash("✅ Settings saved"); await load();
    } catch (e) { flash("❌ " + e.message); }
    setSavingSettings(false);
  }

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
          <a href={api.backupProject(id)} download className="bg-[#1a1a24] hover:bg-[#22222f] border border-[#2d2d3e] text-slate-300 px-4 py-2 rounded-lg text-sm transition flex items-center gap-1">
            ⬇ Backup
          </a>
          <button onClick={() => setLive(l => !l)} className={`px-4 py-2 rounded-lg text-sm border transition ${live ? "bg-blue-600/20 border-blue-500 text-blue-400" : "bg-[#1a1a24] border-[#2d2d3e] text-slate-400 hover:text-white"}`}>
            {live ? "● Live" : "○ Live"}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#2d2d3e] mb-6 overflow-x-auto gap-1">
          {["logs","files","env","npm","webhook","settings"].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition capitalize whitespace-nowrap ${tab === t ? "border-blue-500 text-blue-400" : "border-transparent text-slate-400 hover:text-white"}`}>
              {t === "files" ? "📁 Files" : t === "logs" ? "📋 Logs" : t === "env" ? "🔐 Env" : t === "npm" ? "📦 npm" : t === "webhook" ? "🔗 Webhook" : "⚙️ Settings"}
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
            <div className="space-y-4">
              {/* Project settings */}
              <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-6 space-y-4">
                <h3 className="text-white font-medium">Project Settings</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-slate-400 text-sm block mb-1">Project Name</label>
                    <input value={settings.name||""} onChange={e=>setSettings(s=>({...s,name:e.target.value}))}
                      className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="text-slate-400 text-sm block mb-1">Start Command</label>
                    <input value={settings.startCommand||""} onChange={e=>setSettings(s=>({...s,startCommand:e.target.value}))}
                      className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-slate-400 text-sm block mb-1">GitHub URL</label>
                    <input value={settings.githubUrl||""} onChange={e=>setSettings(s=>({...s,githubUrl:e.target.value}))}
                      placeholder="https://github.com/user/repo"
                      className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                </div>
                {/* Auto-restart toggle */}
                <div className="flex items-center justify-between p-4 bg-[#1a1a24] border border-[#2d2d3e] rounded-lg">
                  <div>
                    <div className="text-white text-sm font-medium">Auto-Restart on Crash</div>
                    <div className="text-slate-500 text-xs mt-0.5">Automatically restart your project if it crashes (non-zero exit code)</div>
                  </div>
                  <button type="button" onClick={() => setAutoRestart(v => !v)}
                    className={`relative w-12 h-6 rounded-full transition-colors ${autoRestart ? "bg-green-600" : "bg-[#2d2d3e]"}`}>
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${autoRestart ? "translate-x-6" : ""}`} />
                  </button>
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={saveSettings} disabled={savingSettings}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition">
                    {savingSettings ? "Saving..." : "💾 Save Settings"}
                  </button>
                  <form onSubmit={deploy} className="flex gap-3">
                    <button type="submit" disabled={deploying} className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition">
                      {deploying ? "Deploying..." : "🚀 Deploy from GitHub"}
                    </button>
                  </form>
                </div>
              </div>

            <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-6 space-y-3">
              <h3 className="text-white font-medium">Project Info</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-slate-500 text-xs">ID</p><p className="text-slate-300 font-mono text-xs mt-0.5">{project.id}</p></div>
                <div><p className="text-slate-500 text-xs">Status</p><p className={`mt-0.5 text-sm ${STATUS_TEXT[project.status]}`}>{project.status}</p></div>
                <div><p className="text-slate-500 text-xs">Start Command</p><p className="text-slate-300 font-mono text-xs mt-0.5">{project.startCommand}</p></div>
                <div><p className="text-slate-500 text-xs">Created</p><p className="text-slate-300 text-xs mt-0.5">{new Date(project.createdAt||project.created_at).toLocaleDateString()}</p></div>
                <div><p className="text-slate-500 text-xs">Restarts</p><p className="text-slate-300 text-xs mt-0.5">{project.restart_count || 0}</p></div>
                <div><p className="text-slate-500 text-xs">Auto-Restart</p><p className={`text-xs mt-0.5 ${project.auto_restart ? "text-green-400" : "text-slate-500"}`}>{project.auto_restart ? "Enabled" : "Disabled"}</p></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* npm Package Manager */}
      {tab === "npm" && project && <NpmManager projectId={id} onLog={() => setTab("logs")} />}

      {/* Webhook */}
      {tab === "webhook" && project && <WebhookPanel projectId={id} />}

      <footer className="text-center py-6 text-slate-600 text-xs">
        BrucePanel by <a href="https://wa.me/254787527753" target="_blank" rel="noreferrer" className="hover:text-slate-400">Bruce Bera</a> — Bera Tech Org
      </footer>
    </div>
  );
}
