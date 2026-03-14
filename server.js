import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("neon") ? { rejectUnauthorized: false } : false,
});

const JWT_SECRET = process.env.JWT_SECRET || "brucepanel-secret-change-me";
const PROJECTS_DIR = path.join(__dirname, "bp_projects");
const MAX_LOG_FILE_BYTES = 512 * 1024;
const PORT = process.env.PORT || 3000;

if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });

const processes = new Map();
const sseClients = new Map(); // projectId => Set<res>

// ─── Log helpers ───────────────────────────────────────────────
function logFilePath(projectId) {
  const dir = path.join(PROJECTS_DIR, projectId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "brucepanel.log");
}

function appendLogToFile(projectId, line) {
  try {
    const file = logFilePath(projectId);
    fs.appendFileSync(file, line + "\n");
    const stat = fs.statSync(file);
    if (stat.size > MAX_LOG_FILE_BYTES) {
      const content = fs.readFileSync(file, "utf8");
      const trimmed = content.slice(content.length / 2);
      const nl = trimmed.indexOf("\n");
      fs.writeFileSync(file, "--- log rotated ---\n" + trimmed.slice(nl + 1));
    }
  } catch {}
}

function readLogsFromFile(projectId, lines = 200) {
  try {
    const file = logFilePath(projectId);
    if (!fs.existsSync(file)) return [];
    const content = fs.readFileSync(file, "utf8");
    return content.split("\n").filter(Boolean).slice(-lines);
  } catch { return []; }
}

function addLog(projectId, line) {
  const timestamped = `[${new Date().toISOString()}] ${line}`;
  const entry = processes.get(projectId);
  if (entry) { entry.logs.push(timestamped); if (entry.logs.length > 500) entry.logs.shift(); }
  appendLogToFile(projectId, timestamped);
  const clients = sseClients.get(projectId);
  if (clients) {
    const payload = `data: ${JSON.stringify({ log: timestamped })}\n\n`;
    for (const res of clients) { try { res.write(payload); } catch {} }
  }
}

// ─── DB init ────────────────────────────────────────────────────
async function initDB() {
  await pool.query(`CREATE TABLE IF NOT EXISTS bp_users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS bp_projects (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES bp_users(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT DEFAULT '', start_command TEXT NOT NULL DEFAULT 'npm start', github_url TEXT DEFAULT '', auto_update BOOLEAN DEFAULT false, status TEXT NOT NULL DEFAULT 'idle', port INTEGER, env TEXT NOT NULL DEFAULT '{}', created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`);
  console.log("✅ Database initialized");
}

// ─── Auth ────────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try { const { userId } = jwt.verify(token, JWT_SECRET); req.userId = userId; next(); }
  catch { res.status(401).json({ error: "Invalid token" }); }
}

// ─── Process management ──────────────────────────────────────────
function stopProcess(projectId) {
  const entry = processes.get(projectId);
  if (!entry?.proc) return Promise.resolve();
  processes.delete(projectId);
  return new Promise((resolve) => {
    const proc = entry.proc;
    let resolved = false;
    const done = () => { if (!resolved) { resolved = true; resolve(); } };
    proc.once("exit", done);
    try { proc.kill("SIGTERM"); } catch {}
    const killer = setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, 3000);
    proc.once("exit", () => clearTimeout(killer));
    setTimeout(done, 3500);
  });
}

async function startProcess(projectId, startCommand, env) {
  await stopProcess(projectId);
  const dir = path.join(PROJECTS_DIR, projectId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await pool.query("UPDATE bp_projects SET status='running', updated_at=NOW() WHERE id=$1", [projectId]);
  const [cmd, ...args] = startCommand.split(" ");
  const proc = spawn(cmd, args, { cwd: dir, env: { ...process.env, ...env }, shell: true });
  processes.set(projectId, { proc, logs: [], startedAt: new Date() });
  addLog(projectId, `▶ Starting: ${startCommand}`);
  proc.stdout?.on("data", d => d.toString().split("\n").filter(Boolean).forEach(l => addLog(projectId, l)));
  proc.stderr?.on("data", d => d.toString().split("\n").filter(Boolean).forEach(l => addLog(projectId, `[stderr] ${l}`)));
  proc.on("exit", code => {
    if (!processes.has(projectId)) return;
    addLog(projectId, `⏹ Process exited with code ${code}`);
    pool.query("UPDATE bp_projects SET status=$1, updated_at=NOW() WHERE id=$2", [code === 0 ? "stopped" : "error", projectId]).catch(() => {});
  });
}

function runInstall(projectId, dir, env, thenStart, startCommand) {
  pool.query("UPDATE bp_projects SET status='installing', updated_at=NOW() WHERE id=$1", [projectId]).catch(() => {});
  if (!processes.has(projectId)) processes.set(projectId, { proc: null, logs: [], startedAt: null });
  const pkgLock = fs.existsSync(path.join(dir, "package-lock.json"));
  const installCmd = pkgLock ? "npm ci" : "npm install";
  addLog(projectId, `📦 Running ${installCmd}...`);
  const p = spawn(installCmd, [], { cwd: dir, env: { ...process.env, ...env }, shell: true });
  p.stdout?.on("data", d => d.toString().split("\n").filter(Boolean).forEach(l => addLog(projectId, l)));
  p.stderr?.on("data", d => d.toString().split("\n").filter(Boolean).forEach(l => addLog(projectId, l)));
  p.on("exit", code => {
    if (code === 0) {
      addLog(projectId, "✅ Dependencies installed successfully");
      if (thenStart && startCommand) startProcess(projectId, startCommand, env);
      else pool.query("UPDATE bp_projects SET status='stopped', updated_at=NOW() WHERE id=$1", [projectId]).catch(() => {});
    } else {
      addLog(projectId, `❌ npm install failed (exit code ${code})`);
      pool.query("UPDATE bp_projects SET status='error', updated_at=NOW() WHERE id=$1", [projectId]).catch(() => {});
    }
  });
}

function runDepsCommand(projectId, dir, env, cmd, label) {
  pool.query("UPDATE bp_projects SET status='installing', updated_at=NOW() WHERE id=$1", [projectId]).catch(() => {});
  if (!processes.has(projectId)) processes.set(projectId, { proc: null, logs: [], startedAt: null });
  addLog(projectId, `🔄 ${label}...`);
  const p = spawn(cmd, [], { cwd: dir, env: { ...process.env, ...env }, shell: true });
  p.stdout?.on("data", d => d.toString().split("\n").filter(Boolean).forEach(l => addLog(projectId, l)));
  p.stderr?.on("data", d => d.toString().split("\n").filter(Boolean).forEach(l => addLog(projectId, l)));
  p.on("exit", code => {
    if (code === 0) {
      addLog(projectId, `✅ ${label} completed`);
      pool.query("UPDATE bp_projects SET status='stopped', updated_at=NOW() WHERE id=$1", [projectId]).catch(() => {});
    } else {
      addLog(projectId, `❌ ${label} failed (exit code ${code})`);
      pool.query("UPDATE bp_projects SET status='error', updated_at=NOW() WHERE id=$1", [projectId]).catch(() => {});
    }
  });
}

function deployFromGitHub(projectId, githubUrl, startCommand, env, installDeps) {
  const dir = path.join(PROJECTS_DIR, projectId);
  if (!processes.has(projectId)) processes.set(projectId, { proc: null, logs: [], startedAt: null });
  pool.query("UPDATE bp_projects SET status='installing', github_url=$1, updated_at=NOW() WHERE id=$2", [githubUrl, projectId]).catch(() => {});
  addLog(projectId, `🔗 Cloning ${githubUrl}...`);
  const tmp = path.join(PROJECTS_DIR, `${projectId}_tmp`);
  if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
  const p = spawn("git", ["clone", "--depth=1", githubUrl, tmp], { env: process.env, shell: true });
  p.stdout?.on("data", d => d.toString().split("\n").filter(Boolean).forEach(l => addLog(projectId, l)));
  p.stderr?.on("data", d => d.toString().split("\n").filter(Boolean).forEach(l => addLog(projectId, l)));
  p.on("exit", code => {
    if (code !== 0) { addLog(projectId, "❌ Git clone failed"); pool.query("UPDATE bp_projects SET status='error', updated_at=NOW() WHERE id=$1", [projectId]).catch(() => {}); return; }
    addLog(projectId, "✅ Clone successful. Copying files...");
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(tmp, dir);
    if (installDeps && fs.existsSync(path.join(dir, "package.json"))) runInstall(projectId, dir, env, true, startCommand);
    else startProcess(projectId, startCommand, env);
  });
}

function formatProject(p) {
  const entry = processes.get(p.id);
  let uptime = "";
  if (entry?.startedAt) {
    const s = Math.floor((Date.now() - entry.startedAt.getTime()) / 1000);
    uptime = s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s/60)}m ${s%60}s` : `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
  }
  return { ...p, uptime };
}

// ─── Express app ────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// Auth
app.post("/api/brucepanel/auth/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });
  try {
    const existing = await pool.query("SELECT id FROM bp_users WHERE username=$1", [username]);
    if (existing.rows.length > 0) return res.status(400).json({ error: "Username already taken" });
    const id = uuidv4();
    const [user] = (await pool.query("INSERT INTO bp_users(id,username,password_hash) VALUES($1,$2,$3) RETURNING *", [id, username, await bcrypt.hash(password, 10)])).rows;
    res.json({ token: jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" }), user: { id: user.id, username: user.username, createdAt: user.created_at } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/brucepanel/auth/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = (await pool.query("SELECT * FROM bp_users WHERE username=$1", [username])).rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Invalid credentials" });
    res.json({ token: jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" }), user: { id: user.id, username: user.username, createdAt: user.created_at } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/brucepanel/auth/logout", (_req, res) => res.json({ message: "Logged out" }));
app.get("/api/brucepanel/auth/me", auth, async (req, res) => {
  const user = (await pool.query("SELECT * FROM bp_users WHERE id=$1", [req.userId])).rows[0];
  if (!user) return res.status(401).json({ error: "Not found" });
  res.json({ id: user.id, username: user.username, createdAt: user.created_at });
});

// Projects CRUD
app.get("/api/brucepanel/projects", auth, async (req, res) => {
  const rows = (await pool.query("SELECT * FROM bp_projects WHERE user_id=$1 ORDER BY created_at DESC", [req.userId])).rows;
  res.json(rows.map(formatProject));
});

app.post("/api/brucepanel/projects", auth, async (req, res) => {
  const { name, description, startCommand, githubUrl, autoUpdate } = req.body;
  if (!name || !startCommand) return res.status(400).json({ error: "name and startCommand required" });
  const id = uuidv4();
  const project = (await pool.query("INSERT INTO bp_projects(id,user_id,name,description,start_command,github_url,auto_update) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *", [id, req.userId, name, description||"", startCommand, githubUrl||"", autoUpdate||false])).rows[0];
  fs.mkdirSync(path.join(PROJECTS_DIR, id), { recursive: true });
  if (githubUrl) deployFromGitHub(id, githubUrl, startCommand, {}, true);
  res.json(formatProject(project));
});

app.get("/api/brucepanel/projects/:id", auth, async (req, res) => {
  const project = (await pool.query("SELECT * FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId])).rows[0];
  if (!project) return res.status(404).json({ error: "Not found" });
  res.json(formatProject(project));
});

app.delete("/api/brucepanel/projects/:id", auth, async (req, res) => {
  const project = (await pool.query("SELECT * FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId])).rows[0];
  if (!project) return res.status(404).json({ error: "Not found" });
  await stopProcess(project.id);
  const dir = path.join(PROJECTS_DIR, project.id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  await pool.query("DELETE FROM bp_projects WHERE id=$1", [project.id]);
  res.json({ message: "Deleted" });
});

// Process actions
app.post("/api/brucepanel/projects/:id/start", auth, async (req, res) => {
  const p = (await pool.query("SELECT * FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId])).rows[0];
  if (!p) return res.status(404).json({ error: "Not found" });
  await startProcess(p.id, p.start_command, JSON.parse(p.env||"{}"));
  res.json({ message: "Started" });
});

app.post("/api/brucepanel/projects/:id/stop", auth, async (req, res) => {
  const p = (await pool.query("SELECT * FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId])).rows[0];
  if (!p) return res.status(404).json({ error: "Not found" });
  addLog(p.id, "⏹ Stop requested");
  await stopProcess(p.id);
  await pool.query("UPDATE bp_projects SET status='stopped', updated_at=NOW() WHERE id=$1", [p.id]);
  res.json({ message: "Stopped" });
});

app.post("/api/brucepanel/projects/:id/restart", auth, async (req, res) => {
  const p = (await pool.query("SELECT * FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId])).rows[0];
  if (!p) return res.status(404).json({ error: "Not found" });
  addLog(p.id, "↺ Restart requested");
  await stopProcess(p.id);
  await startProcess(p.id, p.start_command, JSON.parse(p.env||"{}"));
  res.json({ message: "Restarted" });
});

app.post("/api/brucepanel/projects/:id/reinstall", auth, async (req, res) => {
  const p = (await pool.query("SELECT * FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId])).rows[0];
  if (!p) return res.status(404).json({ error: "Not found" });
  await stopProcess(p.id);
  const dir = path.join(PROJECTS_DIR, p.id);
  const nm = path.join(dir, "node_modules");
  if (fs.existsSync(nm)) { addLog(p.id, "🗑 Removing node_modules..."); fs.rmSync(nm, { recursive: true, force: true }); }
  runInstall(p.id, dir, JSON.parse(p.env||"{}"), false);
  res.json({ message: "Reinstalling dependencies" });
});

app.post("/api/brucepanel/projects/:id/deploy", auth, async (req, res) => {
  const p = (await pool.query("SELECT * FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId])).rows[0];
  if (!p) return res.status(404).json({ error: "Not found" });
  const url = req.body.githubUrl || p.github_url;
  if (!url) return res.status(400).json({ error: "No GitHub URL" });
  deployFromGitHub(p.id, url, p.start_command, JSON.parse(p.env||"{}"), req.body.updateDeps !== false);
  res.json({ message: "Deploy started" });
});

// npm update (within version ranges)
app.post("/api/brucepanel/projects/:id/update-deps", auth, async (req, res) => {
  const p = (await pool.query("SELECT * FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId])).rows[0];
  if (!p) return res.status(404).json({ error: "Not found" });
  const dir = path.join(PROJECTS_DIR, p.id);
  if (!fs.existsSync(path.join(dir, "package.json"))) return res.status(400).json({ error: "No package.json found" });
  await stopProcess(p.id);
  runDepsCommand(p.id, dir, JSON.parse(p.env||"{}"), "npm update", "npm update (within version ranges)");
  res.json({ message: "Update started — check logs" });
});

// npm-check-updates + npm install (upgrade to latest)
app.post("/api/brucepanel/projects/:id/upgrade-deps", auth, async (req, res) => {
  const p = (await pool.query("SELECT * FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId])).rows[0];
  if (!p) return res.status(404).json({ error: "Not found" });
  const dir = path.join(PROJECTS_DIR, p.id);
  if (!fs.existsSync(path.join(dir, "package.json"))) return res.status(400).json({ error: "No package.json found" });
  await stopProcess(p.id);
  runDepsCommand(p.id, dir, JSON.parse(p.env||"{}"), "npx --yes npm-check-updates -u && npm install", "Upgrading all dependencies to latest");
  res.json({ message: "Upgrade started — check logs" });
});

// git pull + reinstall
app.post("/api/brucepanel/projects/:id/pull", auth, async (req, res) => {
  const p = (await pool.query("SELECT * FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId])).rows[0];
  if (!p) return res.status(404).json({ error: "Not found" });
  const dir = path.join(PROJECTS_DIR, p.id);
  if (!fs.existsSync(path.join(dir, ".git"))) return res.status(400).json({ error: "No .git directory — deploy from GitHub first" });
  await stopProcess(p.id);
  pool.query("UPDATE bp_projects SET status='installing', updated_at=NOW() WHERE id=$1", [p.id]).catch(() => {});
  if (!processes.has(p.id)) processes.set(p.id, { proc: null, logs: [], startedAt: null });
  addLog(p.id, "⬆️ Pulling latest from GitHub...");
  const pull = spawn("git", ["pull"], { cwd: dir, env: process.env, shell: true });
  pull.stdout?.on("data", d => d.toString().split("\n").filter(Boolean).forEach(l => addLog(p.id, l)));
  pull.stderr?.on("data", d => d.toString().split("\n").filter(Boolean).forEach(l => addLog(p.id, l)));
  pull.on("exit", code => {
    if (code !== 0) { addLog(p.id, `❌ git pull failed`); pool.query("UPDATE bp_projects SET status='error', updated_at=NOW() WHERE id=$1", [p.id]).catch(() => {}); return; }
    addLog(p.id, "✅ Pull complete");
    if (req.body?.reinstall !== false && fs.existsSync(path.join(dir, "package.json")))
      runInstall(p.id, dir, JSON.parse(p.env||"{}"), true, p.start_command);
    else startProcess(p.id, p.start_command, JSON.parse(p.env||"{}"));
  });
  res.json({ message: "Pull started — check logs" });
});

// ─── Logs routes ──────────────────────────────────────────────────
app.get("/api/brucepanel/projects/:id/logs", auth, async (req, res) => {
  const p = (await pool.query("SELECT id FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId])).rows[0];
  if (!p) return res.status(404).json({ error: "Not found" });
  const lines = parseInt(req.query.lines) || 200;
  const fileLogs = readLogsFromFile(req.params.id, lines);
  const memLogs = processes.get(req.params.id)?.logs || [];
  const all = fileLogs.length > 0 ? fileLogs : memLogs;
  res.json({ logs: all.length > 0 ? all : ["No logs yet — start or deploy the project."] });
});

app.delete("/api/brucepanel/projects/:id/logs", auth, async (req, res) => {
  const p = (await pool.query("SELECT id FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId])).rows[0];
  if (!p) return res.status(404).json({ error: "Not found" });
  const file = logFilePath(req.params.id);
  if (fs.existsSync(file)) fs.writeFileSync(file, "");
  const entry = processes.get(req.params.id);
  if (entry) entry.logs = [];
  res.json({ message: "Logs cleared" });
});

// SSE live log stream
app.get("/api/brucepanel/projects/:id/logs/stream", auth, async (req, res) => {
  const p = (await pool.query("SELECT id FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId])).rows[0];
  if (!p) { res.status(404).end(); return; }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  const recent = readLogsFromFile(req.params.id, 50);
  res.write(`data: ${JSON.stringify({ history: recent })}\n\n`);
  if (!sseClients.has(req.params.id)) sseClients.set(req.params.id, new Set());
  sseClients.get(req.params.id).add(res);
  const hb = setInterval(() => { try { res.write(": ping\n\n"); } catch {} }, 15000);
  req.on("close", () => { clearInterval(hb); sseClients.get(req.params.id)?.delete(res); });
});

// ─── Env routes ───────────────────────────────────────────────────
app.get("/api/brucepanel/projects/:id/env", auth, async (req, res) => {
  const p = (await pool.query("SELECT env FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId])).rows[0];
  if (!p) return res.status(404).json({ error: "Not found" });
  res.json({ env: JSON.parse(p.env || "{}") });
});

app.put("/api/brucepanel/projects/:id/env", auth, async (req, res) => {
  const p = (await pool.query("SELECT id FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId])).rows[0];
  if (!p) return res.status(404).json({ error: "Not found" });
  await pool.query("UPDATE bp_projects SET env=$1, updated_at=NOW() WHERE id=$2", [JSON.stringify(req.body.env||{}), req.params.id]);
  res.json({ message: "Updated" });
});

// ─── Static client ────────────────────────────────────────────────
const clientDist = path.join(__dirname, "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
} else {
  app.get("/", (_req, res) => res.send("<h2>BrucePanel API running. Build client: cd client && npm install && npm run build</h2>"));
}

initDB().then(() => app.listen(PORT, () => console.log(`🚀 BrucePanel running on port ${PORT}`))).catch(e => { console.error("DB init failed:", e.message); process.exit(1); });
