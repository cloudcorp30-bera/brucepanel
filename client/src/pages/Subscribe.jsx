import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

const PLAN_ICONS = { weekly: "📅", monthly: "🗓️", yearly: "⭐" };

export default function Subscribe() {
  const [plans, setPlans] = useState([]);
  const [user, setUser] = useState(null);
  const [selected, setSelected] = useState(null);
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState("plans"); // plans | confirm | polling | done
  const [checkoutId, setCheckoutId] = useState("");
  const [pollResult, setPollResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([api.plans(), api.me()])
      .then(([p, u]) => { setPlans(p.plans || []); setUser(u); })
      .catch(() => {});
  }, []);

  async function initiatePay() {
    if (!selected || !phone) return;
    setLoading(true); setError("");
    try {
      const { checkoutRequestId } = await api.initiatePay(selected.id, phone);
      setCheckoutId(checkoutRequestId);
      setStep("polling");
      poll(checkoutRequestId);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  function poll(id, tries = 0) {
    if (tries > 24) { setPollResult("timeout"); setStep("done"); return; }
    setTimeout(async () => {
      try {
        const r = await api.payStatus(id);
        if (r.status === "success") { setPollResult("success"); setStep("done"); }
        else if (r.status === "failed") { setPollResult("failed"); setStep("done"); }
        else poll(id, tries + 1);
      } catch { poll(id, tries + 1); }
    }, 5000);
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <Link to="/" className="text-slate-400 hover:text-white text-sm transition mb-6 inline-block">← Back to Dashboard</Link>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Subscribe with M-Pesa</h1>
          <p className="text-slate-400 text-sm mt-1">Buy BB Coins to host more projects on BrucePanel.</p>
          {user && (
            <div className="mt-3 inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 px-3 py-1.5 rounded-lg text-sm">
              🪙 Current balance: <strong>{user.coins?.toLocaleString() || 0} BB Coins</strong>
            </div>
          )}
        </div>

        {/* Plans */}
        {step === "plans" && (
          <>
            <div className="grid gap-4 sm:grid-cols-3 mb-6">
              {plans.map(p => (
                <button key={p.id} onClick={() => { setSelected(p); setStep("confirm"); setError(""); }}
                  className={`bg-[#111118] border rounded-xl p-5 text-left hover:border-blue-500 transition ${selected?.id === p.id ? "border-blue-500" : "border-[#2d2d3e]"}`}>
                  <div className="text-2xl mb-2">{PLAN_ICONS[p.id] || "🪙"}</div>
                  <div className="text-white font-bold text-lg">{p.label}</div>
                  <div className="text-amber-400 font-bold text-xl mt-1">KSH {p.price}</div>
                  <div className="text-slate-400 text-sm mt-1">{p.description}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Confirm */}
        {step === "confirm" && selected && (
          <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Confirm Payment</h3>
              <button onClick={() => { setStep("plans"); setSelected(null); }} className="text-slate-500 hover:text-white">✕</button>
            </div>
            <div className="bg-[#1a1a24] rounded-lg p-4 mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-400">Plan</span>
                <span className="text-white font-medium">{selected.label}</span>
              </div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-400">Amount</span>
                <span className="text-amber-400 font-bold">KSH {selected.price}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">You get</span>
                <span className="text-green-400 font-bold">+{selected.coins} BB Coins</span>
              </div>
            </div>
            {error && <div className="bg-red-900/30 border border-red-700 text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}
            <div className="mb-4">
              <label className="text-slate-400 text-sm block mb-1">M-Pesa Phone Number</label>
              <input value={phone} onChange={e => setPhone(e.target.value)}
                className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500"
                placeholder="e.g. 0712345678" type="tel" />
              <p className="text-slate-600 text-xs mt-1">An STK push will be sent to this number.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={initiatePay} disabled={loading || !phone}
                className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium transition">
                {loading ? "Sending STK Push..." : `Pay KSH ${selected.price}`}
              </button>
              <button onClick={() => { setStep("plans"); setSelected(null); }}
                className="text-slate-400 hover:text-white px-4 transition">Back</button>
            </div>
          </div>
        )}

        {/* Polling */}
        {step === "polling" && (
          <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-8 text-center">
            <div className="text-4xl mb-4">📱</div>
            <h3 className="text-white font-semibold text-lg mb-2">Check your phone!</h3>
            <p className="text-slate-400 text-sm mb-4">An M-Pesa STK push has been sent to <strong className="text-white">{phone}</strong>. Enter your PIN to complete payment.</p>
            <div className="flex items-center justify-center gap-2 text-slate-500 text-sm">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              Waiting for payment confirmation...
            </div>
          </div>
        )}

        {/* Done */}
        {step === "done" && (
          <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-8 text-center">
            {pollResult === "success" ? (
              <>
                <div className="text-5xl mb-4">🎉</div>
                <h3 className="text-green-400 font-bold text-xl mb-2">Payment Successful!</h3>
                <p className="text-slate-400 text-sm mb-2">+{selected?.coins} BB Coins added to your account.</p>
                <Link to="/" className="inline-block mt-4 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg text-sm transition">Back to Dashboard</Link>
              </>
            ) : pollResult === "failed" ? (
              <>
                <div className="text-5xl mb-4">❌</div>
                <h3 className="text-red-400 font-bold text-xl mb-2">Payment Failed</h3>
                <p className="text-slate-400 text-sm mb-4">The payment was cancelled or failed.</p>
                <button onClick={() => { setStep("plans"); setPollResult(null); }}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg text-sm transition">Try Again</button>
              </>
            ) : (
              <>
                <div className="text-5xl mb-4">⏱️</div>
                <h3 className="text-yellow-400 font-bold text-xl mb-2">Payment Timed Out</h3>
                <p className="text-slate-400 text-sm mb-4">We couldn't confirm your payment. Check your M-Pesa messages.</p>
                <button onClick={() => { setStep("plans"); setPollResult(null); }}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg text-sm transition">Try Again</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
