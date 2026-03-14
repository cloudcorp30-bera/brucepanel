import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function Store() {
  const [items, setItems] = useState([]);
  const [coins, setCoins] = useState(0);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(null);
  const [msg, setMsg] = useState("");
  const [msgOk, setMsgOk] = useState(true);

  function flash(m, ok = true) { setMsg(m); setMsgOk(ok); setTimeout(() => setMsg(""), 4000); }

  useEffect(() => {
    Promise.all([api.getStore(), api.me()]).then(([s, u]) => {
      setItems(s.items || []); setCoins(u.coins || 0);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function buy(item) {
    if (coins < item.price) { flash(`Not enough BB Coins. Need ${item.price}, you have ${coins}.`, false); return; }
    if (!confirm(`Buy "${item.label}" for ${item.price} BB Coins?`)) return;
    setBuying(item.id);
    try {
      const r = await api.buyItem(item.id);
      flash(r.message); setCoins(c => c - item.price);
    } catch (e) { flash(e.message, false); }
    setBuying(null);
  }

  if (loading) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-slate-500">Loading store...</div>;

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="border-b border-[#2d2d3e] bg-[#111118] px-4 sm:px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">🪙 BB Coins Store</h1>
          <p className="text-xs text-slate-500 mt-0.5">Spend your coins on features & bonuses</p>
        </div>
        <div className="flex items-center gap-4">
          {msg && <span className={`text-sm ${msgOk ? "text-green-400" : "text-red-400"}`}>{msg}</span>}
          <div className="bg-amber-900/20 border border-amber-800/40 rounded-xl px-4 py-2 flex items-center gap-2">
            <span className="text-xl">🪙</span>
            <span className="text-amber-400 font-bold">{coins.toLocaleString()}</span>
            <span className="text-slate-500 text-xs">BB Coins</span>
          </div>
          <Link to="/" className="text-slate-400 hover:text-white text-sm transition">← Dashboard</Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="text-center mb-10">
          <p className="text-slate-400">Earn coins by subscribing, referring friends, or redeeming promo codes. Spend them below.</p>
          <div className="flex items-center justify-center gap-6 mt-4 text-sm text-slate-500">
            <span>📅 Weekly plan → +100 coins</span>
            <span>👥 Per referral → +25 coins</span>
            <span>🎟 Promo codes → varies</span>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {items.map(item => (
            <div key={item.id} className="bg-[#111118] border border-[#2d2d3e] rounded-2xl p-6 flex flex-col">
              <div className="text-4xl mb-3">{item.icon}</div>
              <h3 className="text-white font-bold text-lg mb-1">{item.label}</h3>
              <p className="text-slate-500 text-sm flex-1 mb-4">{item.desc}</p>
              <div className="flex items-center justify-between mt-auto">
                <div className="flex items-center gap-1.5">
                  <span className="text-amber-400 font-bold text-xl">{item.price}</span>
                  <span className="text-slate-500 text-sm">BB Coins</span>
                </div>
                <button onClick={() => buy(item)} disabled={buying === item.id}
                  className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition ${coins >= item.price ? "bg-amber-600 hover:bg-amber-500 text-white" : "bg-[#1a1a24] border border-[#2d2d3e] text-slate-500 cursor-not-allowed"}`}>
                  {buying === item.id ? "Buying..." : coins >= item.price ? "Buy Now" : "Not enough coins"}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 bg-[#111118] border border-[#2d2d3e] rounded-2xl p-6 text-center">
          <p className="text-slate-400 text-sm mb-3">Want more coins? Subscribe to a plan or share your referral link.</p>
          <div className="flex items-center justify-center gap-3">
            <Link to="/subscribe" className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition">Subscribe Now</Link>
            <Link to="/referral" className="bg-[#1a1a24] border border-[#2d2d3e] text-slate-300 hover:text-white px-5 py-2.5 rounded-xl text-sm font-medium transition">Referral Program</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
