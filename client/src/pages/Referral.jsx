import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function Referral() {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    api.referralInfo()
      .then(setInfo)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function copy(text, key) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(""), 2000);
    });
  }

  const referralLink = info
    ? `${window.location.origin}/register?ref=${info.referralCode}`
    : "";

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="max-w-xl mx-auto px-4 py-10">
        <Link to="/" className="text-slate-400 hover:text-white text-sm transition mb-6 inline-block">← Back to Dashboard</Link>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Referral Program</h1>
          <p className="text-slate-400 text-sm mt-1">Invite friends and earn <strong className="text-amber-400">25 BB Coins</strong> for each signup.</p>
        </div>

        {loading ? (
          <div className="text-slate-500 text-center py-20">Loading...</div>
        ) : info ? (
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total Referrals", value: info.totalReferrals, color: "text-blue-400" },
                { label: "Coins Earned", value: info.totalCoinsEarned, color: "text-amber-400" },
                { label: "Current Coins", value: info.coins, color: "text-green-400" },
              ].map(s => (
                <div key={s.label} className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-4 text-center">
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value?.toLocaleString()}</div>
                  <div className="text-slate-500 text-xs mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Referral code */}
            <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-5">
              <label className="text-slate-400 text-sm block mb-2">Your Referral Code</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 font-mono text-xl font-bold text-white tracking-widest">
                  {info.referralCode}
                </div>
                <button onClick={() => copy(info.referralCode, "code")}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium border transition ${copied === "code" ? "bg-green-600 text-white border-green-600" : "bg-[#1a1a24] border-[#2d2d3e] text-slate-300 hover:text-white"}`}>
                  {copied === "code" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            {/* Referral link */}
            <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-5">
              <label className="text-slate-400 text-sm block mb-2">Share this Link</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-slate-300 text-xs font-mono truncate">
                  {referralLink}
                </div>
                <button onClick={() => copy(referralLink, "link")}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium border transition whitespace-nowrap ${copied === "link" ? "bg-green-600 text-white border-green-600" : "bg-[#1a1a24] border-[#2d2d3e] text-slate-300 hover:text-white"}`}>
                  {copied === "link" ? "Copied!" : "Copy Link"}
                </button>
              </div>
              <p className="text-slate-600 text-xs mt-2">Anyone who signs up with this link earns you 25 BB Coins.</p>
            </div>

            {/* Referrals list */}
            {info.referrals?.length > 0 && (
              <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-5">
                <h3 className="text-white font-semibold mb-3">Referred Users</h3>
                <div className="space-y-2">
                  {info.referrals.map((r, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-[#2d2d3e]/50 last:border-0">
                      <span className="text-slate-300 text-sm">{r.username}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-amber-400 text-sm font-medium">+{r.coinsAwarded} coins</span>
                        <span className="text-slate-600 text-xs">{new Date(r.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-500">Failed to load referral info.</div>
        )}
      </div>
    </div>
  );
}
