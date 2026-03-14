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

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes("neon") ? { rejectUnauthorized: false } : false });

const JWT_SECRET = process.env.JWT_SECRET || "brucepanel-secret-change-me";
const PROJECTS_DIR = path.join(__dirname, "bp_projects");
const PORT = process.env.PORT || 3000;

if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });

const processes = new Map();

async function initDB() {
  await pool.query(`CREATE TABLE IF NOT EXISTS bp_users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS bp_projects (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES bp_users(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT DEFAULT '', start_command TEXT NOT NULL DEFAULT 'npm start', github_url TEXT DEFAULT '', auto_update BOOLEAN DEFAULT false, status TEXT NOT NULL DEFAULT 'idle', port INTEGER, env TEXT NOT NULL DEFAULT '{}', created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`);
  console.log("✅ Database initialized");
}

function addLog(projectId, line) {
  const entry = processes.get(projectId);
  if (entry) {
    entry.logs.push(`[${new Date().toISOString()}] ${line}`);
    if (entry.logs.length > 500) entry.logs.shift();
  }
}

function auth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { userId } = jwt.verify(token, JWT_SECRET);
    req.userId = userId;
    next();
  } catch { res.status(401).json({ error: "Invalid token" }); }
}

async function startProcess(projectId, startCommand, env) {
  await stopProcess(projectId);  // await ensures old process is dead before starting new one
  const dir = path.join(PROJECTS_DIR, projectId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await pool.query("UPDATE bp_projects SET status=$1, updated_at=NOW() WHERE id=$2", ["running", projectId]);
  const [cmd, ...args] = startCommand.split(" ");
  const proc = spawn(cmd, args, { cwd: dir, env: { ...process.env, ...env }, shell: true });
  processes.set(projectId, { proc, logs: [], startedAt: new Date() });
  addLog(projectId, `Starting: ${startCommand}`);
  proc.stdout?.on("data", d => addLog(projectId, d.toString().trim()));
  proc.stderr?.on("data", d => addLog(projectId, `[ERR] ${d.toString().trim()}`));
  proc.on("exit", code => {
    // If removed from map, process was intentionally stopped — don't overwrite status
    if (!processes.has(projectId)) return;
    addLog(projectId, `Process exited with code ${code}`);
    pool.query("UPDATE bp_projects SET status=$1, updated_at=NOW() WHERE id=$2", [code === 0 ? "stopped" : "error", projectId]).catch(() => {});
  });
}

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
    // Force SIGKILL after 3s if process refuses to die
    const killer = setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, 3000);
    proc.once("exit", () => clearTimeout(killer));
    setTimeout(done, 3500);
  });
}

function runInstall(projectId, dir, env, thenStart, startCommand) {
  pool.query("UPDATE bp_projects SET status=$1, updated_at=NOW() WHERE id=$2", ["installing", projectId]).catch(() => {});
  if (!processes.has(projectId)) processes.set(projectId, { proc: null, logs: [], startedAt: null });
  const pkgLock = fs.existsSync(path.join(dir, "package-lock.json"));
  const installCmd = pkgLock ? "npm ci" : "npm install";
  addLog(projectId, `Running ${installCmd}...`);
  const p = spawn(installCmd, [], { cwd: dir, env: { ...process.env, ...env }, shell: true });
  p.stdout?.on("data", d => addLog(projectId, d.toString().trim()));
  p.stderr?.on("data", d => addLog(projectId, d.toString().trim()));
  p.on("exit", code => {
    if (code === 0) {
      addLog(projectId, "✅ Dependencies installed");
      if (thenStart && startCommand) startProcess(projectId, startCommand, env);
      else pool.query("UPDATE bp_projects SET status=$1, updated_at=NOW() WHERE id=$2", ["stopped", projectId]).catch(() => {});
    } else {
      addLog(projectId, `❌ npm install failed (code ${code})`);
      pool.query("UPDATE bp_projects SET status=$1, updated_at=NOW() WHERE id=$2", ["error", projectId]).catch(() => {});
    }
  });
}

function deployFromGitHub(projectId, githubUrl, startCommand, env, install) {
  pool.query("UPDATE bp_projects SET status=$1, github_url=$2, updated_at=NOW() WHERE id=$3", ["installing", githubUrl, projectId]).catch(() => {});
  if (!processes.has(projectId)) processes.set(projectId, { proc: null, logs: [], startedAt: null });
  addLog(projectId, `Cloning ${githubUrl}...`);
  const dir = path.join(PROJECTS_DIR, projectId);
  const tmp = `${dir}_tmp`;
  if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
  const p = spawn("git", ["clone", "--depth=1", githubUrl, tmp], { env: process.env, shell: true });
  p.stdout?.on("data", d => addLog(projectId, d.toString().trim()));
  p.stderr?.on("data", d => addLog(projectId, d.toString().trim()));
  p.on("exit", code => {
    if (code !== 0) { addLog(projectId, "❌ Clone failed"); pool.query("UPDATE bp_projects SET status='error', updated_at=NOW() WHERE id=$1", [projectId]).catch(() => {}); return; }
    addLog(projectId, "✅ Clone done. Copying files...");
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(tmp, dir);
    if (install && fs.existsSync(path.join(dir, "package.json"))) runInstall(projectId, dir, env, true, startCommand);
    else startProcess(projectId, startCommand, env);
  });
}

function formatProject(p) {
  const entry = processes.get(p.id);
  let uptime = "";
  if (entry?.startedAt) {
    const s = Math.floor((Date.now() - entry.startedAt.getTime()) / 1000);
    uptime = s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s/60)}m` : `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
  }
  return { ...p, uptime, status: p.status };
}

const app = express();
app.use(cors());
app.use(express.json());

app.post("/api/brucepanel/auth/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });
  try {
    const existing = await pool.query("SELECT id FROM bp_users WHERE username=$1", [username]);
    if (existing.rows.length > 0) return res.status(400).json({ error: "Username already taken" });
    const passwordHash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    const result = await pool.query("INSERT INTO bp_users(id,username,password_hash) VALUES($1,$2,$3) RETURNING *", [id, username, passwordHash]);
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user.id, username: user.username, createdAt: user.created_at } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/brucepanel/auth/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM bp_users WHERE username=$1", [username]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user.id, username: user.username, createdAt: user.created_at } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/brucepanel/auth/logout", (_req, res) => res.json({ message: "Logged out" }));

app.get("/api/brucepanel/auth/me", auth, async (req, res) => {
  const r = await pool.query("SELECT * FROM bp_users WHERE id=$1", [req.userId]);
  if (!r.rows[0]) return res.status(401).json({ error: "Not found" });
  const u = r.rows[0];
  res.json({ id: u.id, username: u.username, createdAt: u.created_at });
});

app.get("/api/brucepanel/projects", auth, async (req, res) => {
  const r = await pool.query("SELECT * FROM bp_projects WHERE user_id=$1 ORDER BY created_at DESC", [req.userId]);
  res.json(r.rows.map(formatProject));
});

app.post("/api/brucepanel/projects", auth, async (req, res) => {
  const { name, description, startCommand, githubUrl, autoUpdate } = req.body;
  if (!name || !startCommand) return res.status(400).json({ error: "name and startCommand required" });
  const id = uuidv4();
  const r = await pool.query("INSERT INTO bp_projects(id,user_id,name,description,start_command,github_url,auto_update) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *", [id, req.userId, name, description||"", startCommand, githubUrl||"", autoUpdate||false]);
  const project = r.rows[0];
  fs.mkdirSync(path.join(PROJECTS_DIR, id), { recursive: true });
  if (githubUrl) deployFromGitHub(id, githubUrl, startCommand, {}, true);
  res.json(formatProject(project));
});

app.get("/api/brucepanel/projects/:id", auth, async (req, res) => {
  const r = await pool.query("SELECT * FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
  if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(formatProject(r.rows[0]));
});

app.delete("/api/brucepanel/projects/:id", auth, async (req, res) => {
  const r = await pool.query("SELECT * FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
  if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
  await stopProcess(req.params.id);
  const dir = path.join(PROJECTS_DIR, req.params.id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  await pool.query("DELETE FROM bp_projects WHERE id=$1", [req.params.id]);
  res.json({ message: "Deleted" });
});

app.post("/api/brucepanel/projects/:id/deploy", auth, async (req, res) => {
  const r = await pool.query("SELECT * FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
  if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
  const p = r.rows[0];
  const url = req.body.githubUrl || p.github_url;
  if (!url) return res.status(400).json({ error: "No GitHub URL" });
  deployFromGitHub(p.id, url, p.start_command, JSON.parse(p.env||"{}"), req.body.updateDeps !== false);
  res.json({ message: "Deploy started" });
});

app.post("/api/brucepanel/projects/:id/start", auth, async (req, res) => {
  const r = await pool.query("SELECT * FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
  if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
  const p = r.rows[0];
  await startProcess(p.id, p.start_command, JSON.parse(p.env||"{}"));
  res.json({ message: "Started" });
});

app.post("/api/brucepanel/projects/:id/stop", auth, async (req, res) => {
  const r = await pool.query("SELECT * FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
  if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
  await stopProcess(req.params.id);
  await pool.query("UPDATE bp_projects SET status='stopped', updated_at=NOW() WHERE id=$1", [req.params.id]);
  res.json({ message: "Stopped" });
});

app.post("/api/brucepanel/projects/:id/restart", auth, async (req, res) => {
  const r = await pool.query("SELECT * FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
  if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
  const p = r.rows[0];
  await stopProcess(p.id);
  await startProcess(p.id, p.start_command, JSON.parse(p.env||"{}"));
  res.json({ message: "Restarted" });
});

app.post("/api/brucepanel/projects/:id/reinstall", auth, async (req, res) => {
  const r = await pool.query("SELECT * FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
  if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
  const p = r.rows[0];
  await stopProcess(p.id);
  const dir = path.join(PROJECTS_DIR, p.id);
  const nm = path.join(dir, "node_modules");
  if (fs.existsSync(nm)) fs.rmSync(nm, { recursive: true, force: true });
  runInstall(p.id, dir, JSON.parse(p.env||"{}"), false, null);
  res.json({ message: "Reinstalling" });
});

app.get("/api/brucepanel/projects/:id/logs", auth, async (req, res) => {
  const r = await pool.query("SELECT id FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
  if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
  const lines = parseInt(req.query.lines) || 100;
  const entry = processes.get(req.params.id);
  res.json({ logs: entry ? entry.logs.slice(-lines) : ["No logs yet — start or deploy the project first."] });
});

app.get("/api/brucepanel/projects/:id/env", auth, async (req, res) => {
  const r = await pool.query("SELECT env FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
  if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
  res.json({ env: JSON.parse(r.rows[0].env || "{}") });
});

app.put("/api/brucepanel/projects/:id/env", auth, async (req, res) => {
  const r = await pool.query("SELECT id FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
  if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
  await pool.query("UPDATE bp_projects SET env=$1, updated_at=NOW() WHERE id=$2", [JSON.stringify(req.body.env||{}), req.params.id]);
  res.json({ message: "Updated" });
});

const clientDist = path.join(__dirname, "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
} else {
  app.get("/", (_req, res) => res.send("<h2>BrucePanel API running. Build the client with: cd client && npm install && npm run build</h2>"));
}

initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 BrucePanel running on port ${PORT}`));
}).catch(e => { console.error("DB init failed:", e.message); process.exit(1); });
