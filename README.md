# BrucePanel 🚀

A lightweight Node.js project hosting panel — like Heroku/Railway, but yours to own and run.

Built by **Bruce Bera** / **Bera Tech Org**  
📲 WhatsApp: [wa.me/254787527753](https://wa.me/254787527753)

---

## Features

- 🔐 JWT authentication (register/login)
- 📦 Deploy projects from GitHub (auto-clones and installs)
- ▶️ Start / Stop / Restart / Reinstall running processes
- 📋 Real-time log streaming
- 🌍 Per-project environment variables
- 🗄️ PostgreSQL for persistent storage
- ⚡ Built with Express + React + Tailwind CSS

---

## Quick Deploy (Railway)

1. Fork this repo
2. Create a new Railway project → Connect GitHub repo
3. Add environment variables:
   - `DATABASE_URL` — your PostgreSQL connection string (Railway provides one)
   - `JWT_SECRET` — any long random string
4. Railway auto-detects `railway.toml` and builds + starts the app

---

## Local Development

### Prerequisites
- Node.js 18+
- PostgreSQL database (or use [Neon](https://neon.tech) free tier)

### Setup

```bash
# Clone the repo
git clone https://github.com/cloudcorp30-bera/brucepanel
cd brucepanel

# Install server deps
npm install

# Build frontend
cd client && npm install && npm run build && cd ..

# Set environment variables
export DATABASE_URL="postgresql://user:pass@host/dbname"
export JWT_SECRET="your-secret-key-here"

# Start the server
npm start
```

Open http://localhost:3000

### Frontend dev mode (hot reload)

```bash
# Terminal 1: Start backend
npm start

# Terminal 2: Start frontend dev server
cd client && npm run dev
```

---

## Project Structure

```
brucepanel/
├── server.js          # Express backend (API + static serving)
├── package.json       # Root package (server)
├── railway.toml       # Railway deployment config
├── bp_projects/       # Project files stored here (gitignored)
└── client/
    ├── src/
    │   ├── App.jsx
    │   ├── api.js
    │   ├── pages/
    │   │   ├── Login.jsx
    │   │   ├── Register.jsx
    │   │   ├── Dashboard.jsx
    │   │   └── ProjectDetail.jsx
    │   └── index.css
    ├── index.html
    ├── vite.config.js
    └── package.json
```

---

## API Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/brucepanel/auth/register` | No | Register user |
| POST | `/api/brucepanel/auth/login` | No | Login |
| GET | `/api/brucepanel/auth/me` | Yes | Current user |
| GET | `/api/brucepanel/projects` | Yes | List projects |
| POST | `/api/brucepanel/projects` | Yes | Create project |
| GET | `/api/brucepanel/projects/:id` | Yes | Get project |
| DELETE | `/api/brucepanel/projects/:id` | Yes | Delete project |
| POST | `/api/brucepanel/projects/:id/deploy` | Yes | Deploy from GitHub |
| POST | `/api/brucepanel/projects/:id/start` | Yes | Start process |
| POST | `/api/brucepanel/projects/:id/stop` | Yes | Stop process |
| POST | `/api/brucepanel/projects/:id/restart` | Yes | Restart process |
| POST | `/api/brucepanel/projects/:id/reinstall` | Yes | Reinstall deps |
| GET | `/api/brucepanel/projects/:id/logs` | Yes | Get logs |
| GET | `/api/brucepanel/projects/:id/env` | Yes | Get env vars |
| PUT | `/api/brucepanel/projects/:id/env` | Yes | Update env vars |

---

## Contact

- 📲 WhatsApp: [wa.me/254787527753](https://wa.me/254787527753)
- 🏢 Bera Tech Org
- 👤 Bruce Bera
