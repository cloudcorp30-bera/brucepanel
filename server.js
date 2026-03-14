import "dotenv/config";
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
import multer from "multer";
import AdmZip from "adm-zip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

// ─── Config ────────────────────────────────────────────────────────────────
const DB_URL = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!DB_URL) { console.error("DATABASE_URL is required"); process.exit(1); }

const pool = new Pool({
  connectionString: DB_URL,
  ssl: DB_URL.includes("neon.tech") ? { rejectUnauthorized: false } : false,
});

const JWT_SECRET      = process.env.JWT_SECRET || "brucepanel-secret-BeraTech2026-changeme";
const PROJECTS_DIR    = path.join(__dirname, "bp_projects");
const PORT            = process.env.PORT || 3000;
const PAYHERO_AUTH    = process.env.PAYHERO_AUTH || "Basic bjB4clNmY1V5aEFiS2dRcnhDZ2U6d1VrV01vMERoUko0akJ0OVZFTjVUc2VoQ0xkTGdab2tLRWFMRkMxbQ==";
const PAYHERO_CHANNEL = parseInt(process.env.PAYHERO_CHANNEL_ID || "3762");
const PAYHERO_BASE    = process.env.PAYHERO_BASE || "https://backend.payhero.co.ke/api/v2";
const MAX_LOG_BYTES   = 512 * 1024;

const PLANS = [
  { id: "weekly",  label: "Weekly",  price: 50,   coins: 100,  description: "100 BB Coins · 7 days" },
  { id: "monthly", label: "Monthly", price: 150,  coins: 400,  description: "400 BB Coins · 30 days" },
  { id: "yearly",  label: "Yearly",  price: 1000, coins: 3000, description: "3000 BB Coins · 365 days" },
];

if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });

const UPLOADS_DIR = path.join(__dirname, "bp_uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const upload = multer({ dest: UPLOADS_DIR, limits: { fileSize: 100 * 1024 * 1024 } });

function listProjectFiles(dir, base = "", depth = 0) {
  if (depth > 6) return [];
  const IGNORE = new Set(["node_modules", ".git", "brucepanel.log", "bp_uploads", ".npm", ".cache"]);
  const entries = [];
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (IGNORE.has(item.name)) continue;
      const relPath = base ? `${base}/${item.name}` : item.name;
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        entries.push({ name: item.name, path: relPath, type: "dir", children: listProjectFiles(fullPath, relPath, depth + 1) });
      } else {
        const stat = fs.statSync(fullPath);
        entries.push({ name: item.name, path: relPath, type: "file", size: stat.size });
      }
    }
  } catch {}
  return entries.sort((a, b) => (a.type === "dir" ? -1 : 1) - (b.type === "dir" ? -1 : 1) || a.name.localeCompare(b.name));
}


const processes  = new Map(); // projectId → { proc, logs }
const sseClients = new Map(); // projectId → Set<res>

// ─── Log helpers ──────────────────────────────────────────────────────────
function logFilePath(projectId) {
  const dir = path.join(PROJECTS_DIR, projectId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "brucepanel.log");
}
function appendLog(projectId, line) {
  try {
    const file = logFilePath(projectId);
    fs.appendFileSync(file, line + "\n");
    const stat = fs.statSync(file);
    if (stat.size > MAX_LOG_BYTES) {
      const content = fs.readFileSync(file, "utf8");
      const half = content.slice(content.length / 2);
      fs.writeFileSync(file, "--- log rotated ---\n" + half.slice(half.indexOf("\n") + 1));
    }
  } catch {}
}
function readLogs(projectId, lines = 200) {
  try {
    const file = logFilePath(projectId);
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).slice(-lines);
  } catch { return []; }
}
function addLog(projectId, line) {
  const ts = `[${new Date().toISOString()}] ${line}`;
  const entry = processes.get(projectId);
  if (entry) { entry.logs.push(ts); if (entry.logs.length > 500) entry.logs.shift(); }
  appendLog(projectId, ts);
  const clients = sseClients.get(projectId);
  if (clients) {
    const payload = `data: ${JSON.stringify({ log: ts })}\n\n`;
    for (const res of clients) { try { res.write(payload); } catch {} }
  }
}

// ─── DB init ─────────────────────────────────────────────────────────────
async function initDB() {
  // Create all tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bp_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT DEFAULT '',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      coins INTEGER NOT NULL DEFAULT 0,
      is_banned BOOLEAN NOT NULL DEFAULT false,
      referral_code TEXT UNIQUE,
      referred_by TEXT,
      free_apps_used INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bp_projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES bp_users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      start_command TEXT NOT NULL DEFAULT 'npm start',
      github_url TEXT DEFAULT '',
      auto_update BOOLEAN DEFAULT false,
      status TEXT NOT NULL DEFAULT 'idle',
      port INTEGER,
      env TEXT NOT NULL DEFAULT '{}',
      is_free_slot BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bp_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES bp_users(id) ON DELETE CASCADE,
      plan TEXT NOT NULL,
      amount INTEGER NOT NULL DEFAULT 0,
      coins INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      phone_number TEXT DEFAULT '',
      payment_ref TEXT DEFAULT '',
      checkout_request_id TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bp_notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'info',
      read BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bp_referrals (
      id TEXT PRIMARY KEY,
      referrer_id TEXT NOT NULL REFERENCES bp_users(id) ON DELETE CASCADE,
      referee_id TEXT NOT NULL UNIQUE REFERENCES bp_users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'completed',
      coins_awarded INTEGER NOT NULL DEFAULT 25,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`);

  // Add missing columns for older deployments
  const alters = [
    `ALTER TABLE bp_users ADD COLUMN IF NOT EXISTS email TEXT DEFAULT ''`,
    `ALTER TABLE bp_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'`,
    `ALTER TABLE bp_users ADD COLUMN IF NOT EXISTS coins INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE bp_users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE bp_users ADD COLUMN IF NOT EXISTS referral_code TEXT`,
    `ALTER TABLE bp_users ADD COLUMN IF NOT EXISTS referred_by TEXT`,
    `ALTER TABLE bp_users ADD COLUMN IF NOT EXISTS free_apps_used INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE bp_projects ADD COLUMN IF NOT EXISTS is_free_slot BOOLEAN NOT NULL DEFAULT false`,
  ];
  for (const sql of alters) {
    try { await pool.query(sql); } catch {}
  }

  // Seed default admin
  try {
    const adminHash = await bcrypt.hash("BeraPanelAdmin2026!", 10);
    await pool.query(`
      INSERT INTO bp_users (id, username, email, password_hash, role, coins, referral_code, free_apps_used)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (username) DO NOTHING
    `, ["admin-001", "admin", "admin@beratech.co.ke", adminHash, "admin", 99999, "BRUCEADMIN", 0]);
  } catch {}

  console.log("✅ Database initialized");
}

// ─── Helpers ─────────────────────────────────────────────────────────────
function makeRef() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
async function notify(userId, title, message, type = "info") {
  try {
    await pool.query(
      `INSERT INTO bp_notifications (id, user_id, title, message, type) VALUES ($1,$2,$3,$4,$5)`,
      [uuidv4(), userId || null, title, message, type]
    );
  } catch {}
}

// ─── Auth middleware ──────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { userId } = jwt.verify(token, JWT_SECRET);
    req.userId = userId;
    next();
  } catch { res.status(401).json({ error: "Invalid token" }); }
}
async function adminOnly(req, res, next) {
  const u = await pool.query("SELECT role FROM bp_users WHERE id=$1", [req.userId]);
  if (!u.rows[0] || !["admin","moderator"].includes(u.rows[0].role))
    return res.status(403).json({ error: "Admin only" });
  req.userRole = u.rows[0].role;
  next();
}

// ─── Process management ───────────────────────────────────────────────────
function stopProcess(projectId) {
  const entry = processes.get(projectId);
  if (!entry?.proc) return Promise.resolve();
  processes.delete(projectId);
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    entry.proc.once("exit", finish);
    entry.proc.kill("SIGTERM");
    setTimeout(() => { try { entry.proc.kill("SIGKILL"); } catch {} finish(); }, 5000);
  });
}

async function startProcess(projectId, dir, command, envVars = {}) {
  await stopProcess(projectId);
  const parts = command.split(" ");
  const proc = spawn(parts[0], parts.slice(1), {
    cwd: dir, env: { ...process.env, ...envVars },
    stdio: ["ignore", "pipe", "pipe"],
  });
  processes.set(projectId, { proc, logs: [] });
  const onData = (data) => addLog(projectId, data.toString().trim());
  proc.stdout.on("data", onData);
  proc.stderr.on("data", onData);
  proc.on("exit", async (code) => {
    addLog(projectId, `Process exited with code ${code}`);
    processes.delete(projectId);
    await pool.query("UPDATE bp_projects SET status='stopped', updated_at=NOW() WHERE id=$1", [projectId]);
  });
  proc.on("error", async (err) => {
    addLog(projectId, `Process error: ${err.message}`);
    processes.delete(projectId);
    await pool.query("UPDATE bp_projects SET status='error', updated_at=NOW() WHERE id=$1", [projectId]);
  });
}

// ─── App ──────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ─── Auth routes ──────────────────────────────────────────────────────────

app.post("/api/brucepanel/auth/register", async (req, res) => {
  try {
    const { username, password, email = "", referralCode = "" } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username and password required" });
    if (username.length < 3) return res.status(400).json({ error: "Username must be at least 3 characters" });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

    const existing = await pool.query("SELECT id FROM bp_users WHERE username=$1", [username]);
    if (existing.rows.length) return res.status(400).json({ error: "Username already taken" });

    const hash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    const myRef = makeRef();
    let referredBy = null;

    await pool.query(
      `INSERT INTO bp_users (id, username, email, password_hash, role, coins, referral_code, referred_by, free_apps_used)
       VALUES ($1,$2,$3,$4,'user',0,$5,$6,0)`,
      [id, username, email, hash, myRef, null]
    );

    // Handle referral
    if (referralCode) {
      const referrer = await pool.query(
        "SELECT id FROM bp_users WHERE referral_code=$1 AND id != $2",
        [referralCode.toUpperCase(), id]
      );
      if (referrer.rows.length) {
        referredBy = referrer.rows[0].id;
        await pool.query("UPDATE bp_users SET referred_by=$1 WHERE id=$2", [referredBy, id]);
        await pool.query("UPDATE bp_users SET coins=coins+25 WHERE id=$1", [referredBy]);
        await pool.query(
          "INSERT INTO bp_referrals (id,referrer_id,referee_id,coins_awarded) VALUES ($1,$2,$3,25)",
          [uuidv4(), referredBy, id]
        );
        await notify(referredBy, "Referral Bonus!", `${username} used your referral code. +25 BB Coins added!`, "success");
      }
    }

    const token = jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: "30d" });
    const user = { id, username, email, role: "user", coins: 0, isBanned: false, referralCode: myRef, freeAppsUsed: 0 };
    res.json({ token, user });
  } catch (e) { console.error(e); res.status(500).json({ error: "Registration failed" }); }
});

app.post("/api/brucepanel/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const r = await pool.query(
      "SELECT id, username, email, password_hash, role, coins, is_banned, referral_code, free_apps_used FROM bp_users WHERE username=$1",
      [username]
    );
    const u = r.rows[0];
    if (!u || !(await bcrypt.compare(password, u.password_hash)))
      return res.status(401).json({ error: "Invalid credentials" });
    if (u.is_banned) return res.status(403).json({ error: "Account banned" });
    const token = jwt.sign({ userId: u.id }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ token, user: { id: u.id, username: u.username, email: u.email, role: u.role, coins: u.coins, isBanned: u.is_banned, referralCode: u.referral_code, freeAppsUsed: u.free_apps_used } });
  } catch (e) { console.error(e); res.status(500).json({ error: "Login failed" }); }
});

app.get("/api/brucepanel/auth/me", auth, async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT id, username, email, role, coins, is_banned, referral_code, free_apps_used FROM bp_users WHERE id=$1",
      [req.userId]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "User not found" });
    const u = r.rows[0];
    if (u.is_banned) return res.status(403).json({ error: "Account banned" });
    res.json({ id: u.id, username: u.username, email: u.email, role: u.role, coins: u.coins, isBanned: u.is_banned, referralCode: u.referral_code, freeAppsUsed: u.free_apps_used });
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

// ─── Notification routes ──────────────────────────────────────────────────

app.get("/api/brucepanel/notifications", auth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM bp_notifications WHERE user_id=$1 OR user_id IS NULL ORDER BY created_at DESC LIMIT 50`,
      [req.userId]
    );
    res.json({ notifications: r.rows.map(n => ({ ...n, isRead: n.read })) });
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

app.put("/api/brucepanel/notifications/:id/read", auth, async (req, res) => {
  try {
    await pool.query("UPDATE bp_notifications SET read=true WHERE id=$1", [req.params.id]);
    res.json({ message: "Marked read" });
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

// ─── Project routes ───────────────────────────────────────────────────────

app.get("/api/brucepanel/projects", auth, async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM bp_projects WHERE user_id=$1 ORDER BY created_at DESC",
      [req.userId]
    );
    const projects = r.rows.map(p => ({
      ...p, startCommand: p.start_command, githubUrl: p.github_url,
      isFreeSlot: p.is_free_slot, userId: p.user_id,
      status: processes.has(p.id) ? "running" : p.status,
    }));
    res.json({ projects });
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

app.post("/api/brucepanel/projects", auth, async (req, res) => {
  try {
    const { name, description = "", startCommand = "npm start", githubUrl = "", env = {} } = req.body;
    if (!name) return res.status(400).json({ error: "Project name required" });

    const userR = await pool.query("SELECT coins, free_apps_used FROM bp_users WHERE id=$1", [req.userId]);
    const user = userR.rows[0];
    if (!user) return res.status(404).json({ error: "User not found" });

    const FREE_LIMIT = 2;
    const COST = 50;
    let isFreeSlot = false;

    if (user.free_apps_used < FREE_LIMIT) {
      isFreeSlot = true;
      await pool.query("UPDATE bp_users SET free_apps_used=free_apps_used+1 WHERE id=$1", [req.userId]);
    } else {
      if (user.coins < COST) return res.status(402).json({ error: "INSUFFICIENT_COINS", required: COST, current: user.coins });
      await pool.query("UPDATE bp_users SET coins=coins-$1 WHERE id=$2", [COST, req.userId]);
    }

    const id = uuidv4();
    await pool.query(
      `INSERT INTO bp_projects (id, user_id, name, description, start_command, github_url, env, is_free_slot, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'idle')`,
      [id, req.userId, name, description, startCommand, githubUrl, JSON.stringify(env), isFreeSlot]
    );
    res.json({ project: { id, name, description, startCommand, githubUrl, env, isFreeSlot, status: "idle" } });
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed to create project" }); }
});

app.get("/api/brucepanel/projects/:id", auth, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
    const p = r.rows[0];
    res.json({ ...p, startCommand: p.start_command, githubUrl: p.github_url, isFreeSlot: p.is_free_slot, status: processes.has(p.id) ? "running" : p.status });
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

app.delete("/api/brucepanel/projects/:id", auth, async (req, res) => {
  try {
    const r = await pool.query("SELECT id FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
    await stopProcess(req.params.id);
    const dir = path.join(PROJECTS_DIR, req.params.id);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    await pool.query("DELETE FROM bp_projects WHERE id=$1", [req.params.id]);
    res.json({ message: "Project deleted" });
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

// ─── Project control routes ───────────────────────────────────────────────

app.post("/api/brucepanel/projects/:id/start", auth, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    const p = r.rows[0];
    if (!p) return res.status(404).json({ error: "Not found" });

    const dir = path.join(PROJECTS_DIR, req.params.id);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Clone if github_url provided and no code yet
    if (p.github_url && !fs.existsSync(path.join(dir, ".git"))) {
      await pool.query("UPDATE bp_projects SET status='installing', updated_at=NOW() WHERE id=$1", [req.params.id]);
      await new Promise((resolve, reject) => {
        const git = spawn("git", ["clone", p.github_url, "."], { cwd: dir });
        git.stdout.on("data", d => addLog(req.params.id, d.toString().trim()));
        git.stderr.on("data", d => addLog(req.params.id, d.toString().trim()));
        git.on("exit", code => code === 0 ? resolve() : reject(new Error("Clone failed")));
      });
      // npm install if package.json exists
      if (fs.existsSync(path.join(dir, "package.json"))) {
        await new Promise((resolve) => {
          const npm = spawn("npm", ["install"], { cwd: dir });
          npm.stdout.on("data", d => addLog(req.params.id, d.toString().trim()));
          npm.stderr.on("data", d => addLog(req.params.id, d.toString().trim()));
          npm.on("exit", resolve);
        });
      }
    }

    const envVars = JSON.parse(p.env || "{}");
    await startProcess(req.params.id, dir, p.start_command, envVars);
    await pool.query("UPDATE bp_projects SET status='running', updated_at=NOW() WHERE id=$1", [req.params.id]);
    res.json({ message: "Started" });
  } catch (e) {
    await pool.query("UPDATE bp_projects SET status='error', updated_at=NOW() WHERE id=$1", [req.params.id]);
    res.status(500).json({ error: e.message || "Failed to start" });
  }
});

app.post("/api/brucepanel/projects/:id/stop", auth, async (req, res) => {
  try {
    const r = await pool.query("SELECT id FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
    await stopProcess(req.params.id);
    await pool.query("UPDATE bp_projects SET status='stopped', updated_at=NOW() WHERE id=$1", [req.params.id]);
    res.json({ message: "Stopped" });
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

app.get("/api/brucepanel/projects/:id/logs", auth, async (req, res) => {
  try {
    const r = await pool.query("SELECT id FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
    const entry = processes.get(req.params.id);
    const live = entry?.logs || [];
    const file = readLogs(req.params.id, 200);
    const all = [...new Set([...file, ...live])].slice(-200);
    res.json({ logs: all });
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

app.get("/api/brucepanel/projects/:id/stream", auth, async (req, res) => {
  const r = await pool.query("SELECT id FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
  if (!r.rows[0]) return res.status(404).end();
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  if (!sseClients.has(req.params.id)) sseClients.set(req.params.id, new Set());
  sseClients.get(req.params.id).add(res);
  const hb = setInterval(() => { try { res.write(":heartbeat\n\n"); } catch {} }, 15000);
  req.on("close", () => { clearInterval(hb); sseClients.get(req.params.id)?.delete(res); });
});

app.get("/api/brucepanel/projects/:id/env", auth, async (req, res) => {
  const r = await pool.query("SELECT env FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
  if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
  res.json({ env: JSON.parse(r.rows[0].env || "{}") });
});

app.put("/api/brucepanel/projects/:id/env", auth, async (req, res) => {
  const r = await pool.query("SELECT id FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
  if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
  await pool.query("UPDATE bp_projects SET env=$1, updated_at=NOW() WHERE id=$2", [JSON.stringify(req.body.env || {}), req.params.id]);
  res.json({ message: "Updated" });
});


// ─── File manager routes ──────────────────────────────────────────────────
// Deploy from GitHub (force re-clone)
app.post("/api/brucepanel/projects/:id/deploy", auth, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    const p = r.rows[0];
    if (!p) return res.status(404).json({ error: "Not found" });
    const githubUrl = req.body.githubUrl || p.github_url;
    if (!githubUrl) return res.status(400).json({ error: "No GitHub URL provided" });
    // Update URL in DB
    await pool.query("UPDATE bp_projects SET github_url=$1, status='installing', updated_at=NOW() WHERE id=$2", [githubUrl, req.params.id]);
    // Stop existing process
    await stopProcess(req.params.id);
    const dir = path.join(PROJECTS_DIR, req.params.id);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Remove .git to force fresh clone
    const gitDir = path.join(dir, ".git");
    if (fs.existsSync(gitDir)) fs.rmSync(gitDir, { recursive: true, force: true });
    appendLog(req.params.id, "[BrucePanel] Starting deploy from " + githubUrl);
    res.json({ message: "Deploy started" });
    // Clone in background
    setImmediate(async () => {
      try {
        await new Promise((resolve, reject) => {
          const git = spawn("git", ["clone", githubUrl, "."], { cwd: dir });
          git.stdout.on("data", d => appendLog(req.params.id, d.toString().trim()));
          git.stderr.on("data", d => appendLog(req.params.id, d.toString().trim()));
          git.on("exit", code => code === 0 ? resolve() : reject(new Error("Clone failed")));
        });
        if (fs.existsSync(path.join(dir, "package.json"))) {
          appendLog(req.params.id, "[BrucePanel] Running npm install...");
          await new Promise((resolve) => {
            const npm = spawn("npm", ["install"], { cwd: dir });
            npm.stdout.on("data", d => appendLog(req.params.id, d.toString().trim()));
            npm.stderr.on("data", d => appendLog(req.params.id, d.toString().trim()));
            npm.on("exit", resolve);
          });
        }
        const envVars = JSON.parse(p.env || "{}");
        await startProcess(req.params.id, dir, p.start_command, envVars);
        await pool.query("UPDATE bp_projects SET status='running', updated_at=NOW() WHERE id=$1", [req.params.id]);
        appendLog(req.params.id, "[BrucePanel] Deploy complete!");
      } catch (e) {
        await pool.query("UPDATE bp_projects SET status='error', updated_at=NOW() WHERE id=$1", [req.params.id]);
        appendLog(req.params.id, "[BrucePanel] Deploy failed: " + e.message);
      }
    });
  } catch (e) { res.status(500).json({ error: e.message || "Failed" }); }
});


// Upload ZIP or single file
app.post("/api/brucepanel/projects/:id/upload", auth, upload.single("file"), async (req, res) => {
  const cleanup = () => { try { if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch {} };
  try {
    const r = await pool.query("SELECT id FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    if (!r.rows[0]) { cleanup(); return res.status(404).json({ error: "Not found" }); }
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const projectDir = path.join(PROJECTS_DIR, req.params.id);
    if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

    const origName = req.file.originalname || "upload";
    if (origName.toLowerCase().endsWith(".zip")) {
      const zip = new AdmZip(req.file.path);
      const entries = zip.getEntries();
      // If all entries share one top-level dir, extract contents directly
      const tops = new Set(entries.map(e => e.entryName.split("/")[0]).filter(Boolean));
      if (tops.size === 1) {
        const topDir = [...tops][0];
        for (const entry of entries) {
          if (entry.isDirectory) continue;
          const rel = entry.entryName.slice(topDir.length + 1);
          if (!rel) continue;
          const dest = path.join(projectDir, rel);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, entry.getData());
        }
      } else {
        zip.extractAllTo(projectDir, true);
      }
    } else {
      const dest = path.join(projectDir, origName);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(req.file.path, dest);
    }
    cleanup();
    res.json({ message: "Uploaded successfully" });
  } catch (e) { cleanup(); res.status(500).json({ error: e.message || "Upload failed" }); }
});

// List project files
app.get("/api/brucepanel/projects/:id/files", auth, async (req, res) => {
  try {
    const r = await pool.query("SELECT id FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
    const projectDir = path.join(PROJECTS_DIR, req.params.id);
    res.json({ files: fs.existsSync(projectDir) ? listProjectFiles(projectDir) : [] });
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

// Get file content
app.get("/api/brucepanel/projects/:id/files/content", auth, async (req, res) => {
  try {
    const r = await pool.query("SELECT id FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
    const filePath = req.query.path || "";
    if (!filePath || filePath.includes("..")) return res.status(400).json({ error: "Invalid path" });
    const full = path.resolve(path.join(PROJECTS_DIR, req.params.id, filePath));
    if (!full.startsWith(path.resolve(path.join(PROJECTS_DIR, req.params.id)))) return res.status(403).json({ error: "Access denied" });
    if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) return res.status(404).json({ error: "Not found" });
    const stat = fs.statSync(full);
    if (stat.size > 2 * 1024 * 1024) return res.status(400).json({ error: "File too large to edit (>2MB)" });
    res.json({ content: fs.readFileSync(full, "utf8") });
  } catch (e) { res.status(500).json({ error: "Failed to read file" }); }
});

// Save file content
app.put("/api/brucepanel/projects/:id/files/content", auth, async (req, res) => {
  try {
    const r = await pool.query("SELECT id FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
    const filePath = req.body.path || "";
    if (!filePath || filePath.includes("..")) return res.status(400).json({ error: "Invalid path" });
    const full = path.resolve(path.join(PROJECTS_DIR, req.params.id, filePath));
    if (!full.startsWith(path.resolve(path.join(PROJECTS_DIR, req.params.id)))) return res.status(403).json({ error: "Access denied" });
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, req.body.content ?? "");
    res.json({ message: "Saved" });
  } catch (e) { res.status(500).json({ error: "Failed to save" }); }
});

// Delete file or folder
app.delete("/api/brucepanel/projects/:id/files", auth, async (req, res) => {
  try {
    const r = await pool.query("SELECT id FROM bp_projects WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
    const filePath = req.query.path || "";
    if (!filePath || filePath.includes("..")) return res.status(400).json({ error: "Invalid path" });
    const full = path.resolve(path.join(PROJECTS_DIR, req.params.id, filePath));
    if (!full.startsWith(path.resolve(path.join(PROJECTS_DIR, req.params.id)))) return res.status(403).json({ error: "Access denied" });
    if (!fs.existsSync(full)) return res.status(404).json({ error: "Not found" });
    fs.statSync(full).isDirectory() ? fs.rmSync(full, { recursive: true, force: true }) : fs.unlinkSync(full);
    res.json({ message: "Deleted" });
  } catch (e) { res.status(500).json({ error: "Failed to delete" }); }
});

// ─── Subscribe routes ─────────────────────────────────────────────────────

app.get("/api/brucepanel/subscribe/plans", (req, res) => {
  res.json({ plans: PLANS });
});

app.post("/api/brucepanel/subscribe/initiate", auth, async (req, res) => {
  try {
    const { planId, phone } = req.body;
    const plan = PLANS.find(p => p.id === planId);
    if (!plan) return res.status(400).json({ error: "Invalid plan" });
    if (!phone) return res.status(400).json({ error: "Phone number required" });

    const txId = uuidv4();
    await pool.query(
      `INSERT INTO bp_transactions (id, user_id, plan, amount, coins, status, phone_number) VALUES ($1,$2,$3,$4,$5,'pending',$6)`,
      [txId, req.userId, planId, plan.price, plan.coins, phone]
    );

    const payload = {
      amount: plan.price,
      phone_number: phone,
      channel_id: PAYHERO_CHANNEL,
      payment_service: "M-PESA",
      provider: "m-pesa",
      external_reference: txId,
      callback_url: process.env.RENDER_EXTERNAL_URL
        ? `${process.env.RENDER_EXTERNAL_URL}/api/brucepanel/subscribe/callback`
        : "https://brucepanel.beratech.co.ke/api/brucepanel/subscribe/callback",
    };

    const phRes = await fetch(`${PAYHERO_BASE}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": PAYHERO_AUTH },
      body: JSON.stringify(payload),
    });
    const phData = await phRes.json();
    if (!phRes.ok) return res.status(500).json({ error: phData.message || "Payment initiation failed" });

    const checkoutId = phData.CheckoutRequestID || phData.checkout_request_id || "";
    await pool.query("UPDATE bp_transactions SET checkout_request_id=$1 WHERE id=$2", [checkoutId, txId]);

    res.json({ message: "STK push sent. Enter M-Pesa PIN.", txId, checkoutRequestId: checkoutId });
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed to initiate payment" }); }
});

app.get("/api/brucepanel/subscribe/status/:checkoutRequestId", auth, async (req, res) => {
  try {
    const tx = await pool.query(
      "SELECT * FROM bp_transactions WHERE checkout_request_id=$1 AND user_id=$2",
      [req.params.checkoutRequestId, req.userId]
    );
    if (!tx.rows[0]) return res.status(404).json({ error: "Transaction not found" });
    const t = tx.rows[0];
    if (t.status === "success") return res.json({ status: "success", coins: t.coins });
    if (t.status === "failed") return res.json({ status: "failed" });

    // Poll PayHero
    const phRes = await fetch(`${PAYHERO_BASE}/transaction-status?reference=${t.checkout_request_id}`, {
      headers: { "Authorization": PAYHERO_AUTH },
    });
    if (phRes.ok) {
      const phData = await phRes.json();
      const s = phData.status?.toLowerCase() || phData.Status?.toLowerCase() || "";
      if (s === "success" || s === "completed") {
        await pool.query("UPDATE bp_transactions SET status='success', payment_ref=$1 WHERE id=$2", [phData.MpesaReceiptNumber || "", t.id]);
        await pool.query("UPDATE bp_users SET coins=coins+$1 WHERE id=$2", [t.coins, req.userId]);
        await notify(req.userId, "Payment Successful! 🎉", `You received ${t.coins} BB Coins for the ${t.plan} plan.`, "success");
        return res.json({ status: "success", coins: t.coins });
      } else if (s === "failed" || s === "cancelled") {
        await pool.query("UPDATE bp_transactions SET status='failed' WHERE id=$1", [t.id]);
        return res.json({ status: "failed" });
      }
    }
    res.json({ status: "pending" });
  } catch (e) { res.status(500).json({ error: "Status check failed" }); }
});

app.post("/api/brucepanel/subscribe/callback", async (req, res) => {
  try {
    const body = req.body;
    const checkoutId = body.CheckoutRequestID || body.checkout_request_id;
    const status = (body.ResultCode === 0 || body.status === "success") ? "success" : "failed";
    if (checkoutId) {
      const tx = await pool.query("SELECT * FROM bp_transactions WHERE checkout_request_id=$1", [checkoutId]);
      if (tx.rows[0] && tx.rows[0].status === "pending") {
        await pool.query("UPDATE bp_transactions SET status=$1 WHERE id=$2", [status, tx.rows[0].id]);
        if (status === "success") {
          await pool.query("UPDATE bp_users SET coins=coins+$1 WHERE id=$2", [tx.rows[0].coins, tx.rows[0].user_id]);
          await notify(tx.rows[0].user_id, "Payment Successful! 🎉", `You received ${tx.rows[0].coins} BB Coins.`, "success");
        }
      }
    }
    res.json({ message: "OK" });
  } catch { res.json({ message: "OK" }); }
});

// ─── Referral routes ──────────────────────────────────────────────────────

app.get("/api/brucepanel/referral/info", auth, async (req, res) => {
  try {
    const u = await pool.query("SELECT referral_code, coins FROM bp_users WHERE id=$1", [req.userId]);
    if (!u.rows[0]) return res.status(404).json({ error: "Not found" });
    const refs = await pool.query(
      `SELECT r.*, u.username FROM bp_referrals r JOIN bp_users u ON u.id=r.referee_id WHERE r.referrer_id=$1 ORDER BY r.created_at DESC`,
      [req.userId]
    );
    res.json({
      referralCode: u.rows[0].referral_code,
      coins: u.rows[0].coins,
      totalReferrals: refs.rows.length,
      totalCoinsEarned: refs.rows.reduce((s, r) => s + r.coins_awarded, 0),
      referrals: refs.rows.map(r => ({ username: r.username, coinsAwarded: r.coins_awarded, createdAt: r.created_at })),
    });
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

// ─── Admin routes ─────────────────────────────────────────────────────────

app.get("/api/brucepanel/admin/stats", auth, adminOnly, async (req, res) => {
  try {
    const [users, projects, runningR, payments, pending, banned, refs, coins, revenue] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM bp_users"),
      pool.query("SELECT COUNT(*) FROM bp_projects"),
      pool.query("SELECT COUNT(*) FROM bp_projects WHERE status='running'"),
      pool.query("SELECT COUNT(*) FROM bp_transactions WHERE status='success'"),
      pool.query("SELECT COUNT(*) FROM bp_transactions WHERE status='pending'"),
      pool.query("SELECT COUNT(*) FROM bp_users WHERE is_banned=true"),
      pool.query("SELECT COUNT(*) FROM bp_referrals"),
      pool.query("SELECT COALESCE(SUM(coins),0) FROM bp_users"),
      pool.query("SELECT plan, COALESCE(SUM(amount),0) as total FROM bp_transactions WHERE status='success' GROUP BY plan"),
    ]);
    const planBreakdown = {};
    revenue.rows.forEach(r => { planBreakdown[r.plan] = parseInt(r.total); });
    const totalRevenue = Object.values(planBreakdown).reduce((s, v) => s + v, 0);
    res.json({
      users: parseInt(users.rows[0].count),
      projects: parseInt(projects.rows[0].count),
      runningProjects: parseInt(runningR.rows[0].count),
      successfulPayments: parseInt(payments.rows[0].count),
      pendingPayments: parseInt(pending.rows[0].count),
      bannedUsers: parseInt(banned.rows[0].count),
      totalReferrals: parseInt(refs.rows[0].count),
      totalCoinsInCirculation: parseInt(coins.rows[0].coalesce),
      totalRevenue, planBreakdown,
    });
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

app.get("/api/brucepanel/admin/users", auth, adminOnly, async (req, res) => {
  try {
    const r = await pool.query("SELECT id,username,email,role,coins,is_banned,referral_code,free_apps_used,created_at FROM bp_users ORDER BY created_at DESC");
    res.json({ users: r.rows.map(u => ({ ...u, isBanned: u.is_banned, referralCode: u.referral_code, freeAppsUsed: u.free_apps_used })) });
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

app.post("/api/brucepanel/admin/users/:id/coins", auth, adminOnly, async (req, res) => {
  try {
    const { amount, reason = "" } = req.body;
    await pool.query("UPDATE bp_users SET coins=coins+$1 WHERE id=$2", [amount, req.params.id]);
    const u = await pool.query("SELECT username FROM bp_users WHERE id=$1", [req.params.id]);
    if (amount > 0) await notify(req.params.id, `+${amount} BB Coins`, reason || `An admin added ${amount} coins to your account.`, "success");
    else await notify(req.params.id, `${amount} BB Coins`, reason || `An admin adjusted your coins by ${amount}.`, "warning");
    res.json({ message: "Coins updated" });
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

app.post("/api/brucepanel/admin/users/:id/ban", auth, adminOnly, async (req, res) => {
  try {
    const { banned } = req.body;
    await pool.query("UPDATE bp_users SET is_banned=$1 WHERE id=$2", [!!banned, req.params.id]);
    if (banned) await notify(req.params.id, "Account Banned", "Your account has been banned. Contact support.", "danger");
    else await notify(req.params.id, "Account Unbanned", "Your account has been reinstated.", "success");
    res.json({ message: banned ? "User banned" : "User unbanned" });
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

app.post("/api/brucepanel/admin/users/:id/role", auth, adminOnly, async (req, res) => {
  try {
    if (req.userRole !== "admin") return res.status(403).json({ error: "Super admin only" });
    const { role } = req.body;
    if (!["user","moderator","admin"].includes(role)) return res.status(400).json({ error: "Invalid role" });
    await pool.query("UPDATE bp_users SET role=$1 WHERE id=$2", [role, req.params.id]);
    res.json({ message: "Role updated" });
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

app.post("/api/brucepanel/admin/users/:id/email", auth, adminOnly, async (req, res) => {
  try {
    const { email } = req.body;
    await pool.query("UPDATE bp_users SET email=$1 WHERE id=$2", [email, req.params.id]);
    res.json({ message: "Email updated" });
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

app.delete("/api/brucepanel/admin/users/:id", auth, adminOnly, async (req, res) => {
  try {
    if (req.userRole !== "admin") return res.status(403).json({ error: "Super admin only" });
    const u = await pool.query("SELECT username,role FROM bp_users WHERE id=$1", [req.params.id]);
    if (!u.rows[0]) return res.status(404).json({ error: "User not found" });
    if (u.rows[0].role === "admin") return res.status(403).json({ error: "Cannot delete admin" });
    const projs = await pool.query("SELECT id FROM bp_projects WHERE user_id=$1", [req.params.id]);
    for (const p of projs.rows) {
      await stopProcess(p.id);
      const dir = path.join(PROJECTS_DIR, p.id);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }
    await pool.query("DELETE FROM bp_users WHERE id=$1", [req.params.id]);
    res.json({ message: `User ${u.rows[0].username} deleted` });
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

app.get("/api/brucepanel/admin/projects", auth, adminOnly, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT p.*, u.username FROM bp_projects p JOIN bp_users u ON u.id=p.user_id ORDER BY p.created_at DESC`
    );
    res.json({ projects: r.rows.map(p => ({ ...p, startCommand: p.start_command, githubUrl: p.github_url, isFreeSlot: p.is_free_slot, userId: p.user_id, status: processes.has(p.id) ? "running" : p.status })), total: r.rows.length });
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

app.delete("/api/brucepanel/admin/projects/:id", auth, adminOnly, async (req, res) => {
  try {
    const r = await pool.query("SELECT id,name FROM bp_projects WHERE id=$1", [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: "Not found" });
    await stopProcess(req.params.id);
    const dir = path.join(PROJECTS_DIR, req.params.id);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    await pool.query("DELETE FROM bp_projects WHERE id=$1", [req.params.id]);
    res.json({ message: `Project "${r.rows[0].name}" deleted` });
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

app.get("/api/brucepanel/admin/transactions", auth, adminOnly, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT t.*, u.username FROM bp_transactions t JOIN bp_users u ON u.id=t.user_id ORDER BY t.created_at DESC LIMIT 200`
    );
    res.json({ transactions: r.rows.map(t => ({ ...t, phoneNumber: t.phone_number, paymentRef: t.payment_ref })) });
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

app.post("/api/brucepanel/admin/notifications", auth, adminOnly, async (req, res) => {
  try {
    const { title, message, type = "info", userId } = req.body;
    if (!title || !message) return res.status(400).json({ error: "Title and message required" });
    if (userId) {
      await notify(userId, title, message, type);
      res.json({ message: "Notification sent" });
    } else {
      await pool.query(
        "INSERT INTO bp_notifications (id, user_id, title, message, type) VALUES ($1, NULL, $2, $3, $4)",
        [uuidv4(), title, message, type]
      );
      res.json({ message: `Broadcast sent to all users` });
    }
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

app.post("/api/brucepanel/admin/notifications/purge", auth, adminOnly, async (req, res) => {
  try {
    const { olderThanDays = 30 } = req.body;
    const r = await pool.query(
      "DELETE FROM bp_notifications WHERE read=true AND created_at < NOW() - make_interval(days => $1::int)",
      [olderThanDays]
    );
    res.json({ message: `Purged old notifications`, deleted: r.rowCount });
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

app.post("/api/brucepanel/admin/bulk/coins", auth, adminOnly, async (req, res) => {
  try {
    const { amount, reason = "", excludeAdmin = true } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: "Amount must be positive" });
    let query = "UPDATE bp_users SET coins=coins+$1";
    const params = [amount];
    if (excludeAdmin) { query += " WHERE role='user'"; }
    await pool.query(query, params);
    await pool.query(
      "INSERT INTO bp_notifications (id, user_id, title, message, type) VALUES ($1, NULL, $2, $3, $4)",
      [uuidv4(), `🪙 ${amount} BB Coins Airdrop!`, reason || `You received ${amount} free BB Coins from Bera Tech!`, "success"]
    );
    res.json({ message: `Airdropped ${amount} coins to ${excludeAdmin ? "all regular users" : "everyone"}` });
  } catch (e) { res.status(500).json({ error: "Failed" }); }
});

// ─── Static client ────────────────────────────────────────────────────────
const clientDist = path.join(__dirname, "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
} else {
  app.get("/", (_req, res) => res.send("<h2>BrucePanel API is running! Build the client: cd client && npm install && npm run build</h2>"));
}

// ─── Start ────────────────────────────────────────────────────────────────
initDB()
  .then(() => app.listen(PORT, () => console.log(`🚀 BrucePanel running on port ${PORT}`)))
  .catch(e => { console.error("DB init failed:", e.message || e); process.exit(1); });
