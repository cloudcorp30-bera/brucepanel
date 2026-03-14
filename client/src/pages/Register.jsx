import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api } from "../api";

export default function Register() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    const ref = params.get("ref");
    if (ref) setReferralCode(ref.toUpperCase());
  }, [params]);

  async function submit(e) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const { token, user } = await api.register(username, password, email, referralCode);
      localStorage.setItem("bp_token", token);
      localStorage.setItem("bp_user", JSON.stringify(user));
      nav("/");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">BrucePanel</h1>
          <p className="text-slate-400 mt-1 text-sm">Node.js Hosting by Bera Tech Org</p>
        </div>
        <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-8">
          <h2 className="text-xl font-semibold text-white mb-6">Create Account</h2>
          {error && <div className="bg-red-900/30 border border-red-700 text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-slate-400 text-sm block mb-1">Username</label>
              <input value={username} onChange={e => setUsername(e.target.value)}
                className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition"
                placeholder="choose a username" required minLength={3} />
            </div>
            <div>
              <label className="text-slate-400 text-sm block mb-1">Email <span className="text-slate-600">(optional)</span></label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition"
                placeholder="you@example.com" />
            </div>
            <div>
              <label className="text-slate-400 text-sm block mb-1">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition"
                placeholder="at least 6 characters" required minLength={6} />
            </div>
            <div>
              <label className="text-slate-400 text-sm block mb-1">Referral Code <span className="text-slate-600">(optional)</span></label>
              <input value={referralCode} onChange={e => setReferralCode(e.target.value.toUpperCase())}
                className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white font-mono uppercase focus:outline-none focus:border-blue-500 transition"
                placeholder="e.g. BRUCEADMIN" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg py-2.5 font-medium transition">
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>
          <p className="text-slate-500 text-sm text-center mt-4">
            Already have an account? <Link to="/login" className="text-blue-400 hover:text-blue-300">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
