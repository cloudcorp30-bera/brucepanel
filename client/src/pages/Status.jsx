import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

function uptime(s) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
}

export default function Status() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { setStatus(await api.publicStatus()); } catch { setStatus({ status: "unknown" }); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const ok = status?.status === "operational";

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="text-5xl mb-3">🦅</div>
          <h1 className="text-2xl font-bold text-white">BrucePanel Status</h1>
          <p className="text-slate-500 text-sm mt-1">Bera Tech Org · wa.me/254787527753</p>
        </div>

        {/* Main status badge */}
        {!loading && (
          <div className={`rounded-2xl border p-6 mb-6 text-center ${ok ? "border-green-800 bg-green-900/10" : "border-red-800 bg-red-900/10"}`}>
            <div className={`text-4xl mb-2 ${ok ? "" : "grayscale"}`}>{ok ? "✅" : "❌"}</div>
            <div className={`text-xl font-bold ${ok ? "text-green-400" : "text-red-400"}`}>
              {ok ? "All Systems Operational" : "Service Disruption"}
            </div>
            {ok && <div className="text-slate-500 text-xs mt-2">All services are running normally</div>}
          </div>
        )}

        {loading && (
          <div className="bg-[#111118] border border-[#2d2d3e] rounded-2xl p-8 mb-6 text-center">
            <div className="text-slate-500 text-sm animate-pulse">Checking status...</div>
          </div>
        )}

        {/* Stats grid */}
        {status && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            {[
              { l: "Total Users",   v: (status.users||0).toLocaleString(),    c: "text-blue-400",   i: "👥" },
              { l: "Projects",      v: (status.projects||0).toLocaleString(), c: "text-purple-400", i: "📁" },
              { l: "Running Now",   v: (status.running||0).toLocaleString(),  c: "text-green-400",  i: "▶" },
              { l: "Uptime",        v: status.uptime ? uptime(status.uptime) : "—", c: "text-amber-400", i: "⏱" },
            ].map(s => (
              <div key={s.l} className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{s.i}</span>
                  <span className="text-slate-500 text-xs">{s.l}</span>
                </div>
                <div className={`text-2xl font-bold ${s.c}`}>{s.v}</div>
              </div>
            ))}
          </div>
        )}

        {/* Services */}
        <div className="bg-[#111118] border border-[#2d2d3e] rounded-2xl divide-y divide-[#2d2d3e]">
          {[
            ["API Server",        ok],
            ["Database",          ok],
            ["File Manager",      ok],
            ["Payment Gateway",   ok],
            ["Telegram Alerts",   !!process?.env?.TELEGRAM_BOT_TOKEN || true],
          ].map(([name, up]) => (
            <div key={name} className="flex items-center justify-between px-5 py-3.5">
              <span className="text-slate-300 text-sm">{name}</span>
              <div className={`flex items-center gap-1.5 text-xs font-medium ${up ? "text-green-400" : "text-red-400"}`}>
                <span className={`w-2 h-2 rounded-full ${up ? "bg-green-400" : "bg-red-400"}`} />
                {up ? "Operational" : "Down"}
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-8 space-y-2">
          <button onClick={load} className="text-slate-500 hover:text-slate-300 text-xs transition">↻ Refresh</button>
          <div className="text-slate-700 text-xs">Last checked: {new Date().toLocaleTimeString()}</div>
          <div className="mt-4">
            <Link to="/" className="text-slate-500 hover:text-slate-300 text-xs transition">← Go to Panel</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
