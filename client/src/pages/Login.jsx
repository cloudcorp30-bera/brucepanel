import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../api";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const { token } = await api.login(username, password);
      localStorage.setItem("bp_token", token);
      nav("/");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">BrucePanel</h1>
          <p className="text-slate-400 mt-1 text-sm">Node.js Project Hosting by Bera Tech Org</p>
        </div>
        <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-8">
          <h2 className="text-xl font-semibold text-white mb-6">Sign In</h2>
          {error && <div className="bg-red-900/30 border border-red-700 text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-slate-400 text-sm block mb-1">Username</label>
              <input value={username} onChange={e => setUsername(e.target.value)} className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition" placeholder="your username" required />
            </div>
            <div>
              <label className="text-slate-400 text-sm block mb-1">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition" placeholder="••••••••" required />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg py-2.5 font-medium transition">
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
          <p className="text-center text-slate-500 text-sm mt-4">No account? <Link to="/register" className="text-blue-400 hover:text-blue-300">Register</Link></p>
        </div>
        <p className="text-center text-slate-600 text-xs mt-6">
          <a href="https://wa.me/254787527753" target="_blank" rel="noreferrer" className="hover:text-slate-400 transition">WhatsApp: Bruce Bera / Bera Tech Org</a>
        </p>
      </div>
    </div>
  );
}
