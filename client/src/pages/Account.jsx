import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

const ACTION_ICONS = { login:"🔑", password_change:"🔐", promo_redeem:"🎁", project_create:"📁", project_delete:"🗑️", default:"📋" };

export default function Account() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("profile");
  const [activity, setActivity] = useState([]);
  const [msg, setMsg] = useState({ text:"", ok:true });

  const [profile, setProfile] = useState({ email:"", bio:"" });
  const [passwords, setPasswords] = useState({ current:"", next:"", confirm:"" });
  const [promoCode, setPromoCode] = useState("");
  const [saving, setSaving] = useState(false);

  function flash(text, ok=true) { setMsg({ text, ok }); setTimeout(() => setMsg({ text:"", ok:true }), 4000); }

  useEffect(() => {
    api.me().then(u => { setUser(u); setProfile({ email: u.email || "", bio: u.bio || "" }); }).catch(()=>{});
    api.userActivity().then(r => setActivity(r.activity || [])).catch(()=>{});
  }, []);

  async function saveProfile(e) {
    e.preventDefault(); setSaving(true);
    try { await api.updateProfile(profile.email, profile.bio); flash("Profile updated!"); }
    catch (err) { flash(err.message, false); }
    setSaving(false);
  }

  async function changePassword(e) {
    e.preventDefault();
    if (passwords.next !== passwords.confirm) return flash("New passwords don't match", false);
    setSaving(true);
    try { await api.changePassword(passwords.current, passwords.next); flash("Password changed!"); setPasswords({ current:"", next:"", confirm:"" }); }
    catch (err) { flash(err.message, false); }
    setSaving(false);
  }

  async function redeemPromo(e) {
    e.preventDefault(); setSaving(true);
    try {
      const r = await api.redeemPromo(promoCode);
      flash(r.message); setPromoCode("");
      const u = await api.me(); setUser(u);
    } catch (err) { flash(err.message, false); }
    setSaving(false);
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <Link to="/" className="text-slate-400 hover:text-white text-sm transition mb-6 inline-block">← Dashboard</Link>

        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-xl">
            {user?.username?.[0]?.toUpperCase() || "?"}
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{user?.username || "Loading..."}</h1>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-slate-500 text-sm">{user?.role || "user"}</span>
              <span className="text-amber-400 text-sm font-medium">🪙 {user?.coins?.toLocaleString() || 0} BB Coins</span>
            </div>
          </div>
        </div>

        {msg.text && (
          <div className={`rounded-lg px-4 py-3 mb-4 text-sm ${msg.ok ? "bg-green-900/30 border border-green-700 text-green-400" : "bg-red-900/30 border border-red-700 text-red-400"}`}>
            {msg.text}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-[#2d2d3e] mb-6 gap-1">
          {[["profile","👤 Profile"],["security","🔐 Security"],["promo","🎁 Promo Code"],["activity","📋 Activity"]].map(([t,l]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition whitespace-nowrap ${tab === t ? "border-blue-500 text-blue-400" : "border-transparent text-slate-400 hover:text-white"}`}>
              {l}
            </button>
          ))}
        </div>

        {/* Profile */}
        {tab === "profile" && (
          <form onSubmit={saveProfile} className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-6 space-y-4">
            <h3 className="text-white font-semibold">Profile Settings</h3>
            <div>
              <label className="text-slate-400 text-sm block mb-1">Email</label>
              <input value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))}
                type="email" placeholder="you@example.com"
                className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-slate-400 text-sm block mb-1">Bio <span className="text-slate-600">(optional)</span></label>
              <textarea value={profile.bio} onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))}
                placeholder="Tell us a bit about yourself..."
                rows={3} className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 resize-none" />
            </div>
            <div className="bg-[#1a1a24] rounded-lg p-3 text-xs text-slate-500 space-y-1">
              <p>Username: <span className="text-slate-300 font-mono">{user?.username}</span></p>
              <p>User ID: <span className="text-slate-300 font-mono">{user?.id}</span></p>
              <p>Referral Code: <span className="text-amber-400 font-mono font-bold">{user?.referralCode || "N/A"}</span></p>
            </div>
            <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition">
              {saving ? "Saving..." : "Save Profile"}
            </button>
          </form>
        )}

        {/* Security */}
        {tab === "security" && (
          <form onSubmit={changePassword} className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-6 space-y-4">
            <h3 className="text-white font-semibold">Change Password</h3>
            {[
              ["current","Current Password", passwords.current, v => setPasswords(p => ({ ...p, current: v }))],
              ["next","New Password", passwords.next, v => setPasswords(p => ({ ...p, next: v }))],
              ["confirm","Confirm New Password", passwords.confirm, v => setPasswords(p => ({ ...p, confirm: v }))],
            ].map(([key, label, value, onChange]) => (
              <div key={key}>
                <label className="text-slate-400 text-sm block mb-1">{label}</label>
                <input type="password" value={value} onChange={e => onChange(e.target.value)} required minLength={6}
                  className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500"
                  placeholder="••••••••" />
              </div>
            ))}
            <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition">
              {saving ? "Updating..." : "Update Password"}
            </button>
          </form>
        )}

        {/* Promo Code */}
        {tab === "promo" && (
          <div className="space-y-4">
            <form onSubmit={redeemPromo} className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-6 space-y-4">
              <h3 className="text-white font-semibold">Redeem Promo Code</h3>
              <p className="text-slate-500 text-sm">Enter a promo code to get free BB Coins.</p>
              <div className="flex gap-3">
                <input value={promoCode} onChange={e => setPromoCode(e.target.value.toUpperCase())}
                  className="flex-1 bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white font-mono uppercase tracking-widest focus:outline-none focus:border-blue-500"
                  placeholder="ENTER CODE" required />
                <button type="submit" disabled={saving || !promoCode}
                  className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition">
                  {saving ? "..." : "Redeem"}
                </button>
              </div>
            </form>
            <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-5">
              <h3 className="text-white font-semibold mb-1">How to get promo codes?</h3>
              <ul className="text-slate-400 text-sm space-y-1.5 mt-2">
                <li>• Follow <strong className="text-blue-400">Bera Tech Org</strong> on social media for code drops</li>
                <li>• Contact support on <a href="https://wa.me/254787527753" target="_blank" rel="noreferrer" className="text-green-400 underline">WhatsApp</a></li>
                <li>• Refer friends — earn <strong className="text-amber-400">25 BB Coins</strong> per signup</li>
              </ul>
            </div>
          </div>
        )}

        {/* Activity */}
        {tab === "activity" && (
          <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl">
            <div className="px-5 py-4 border-b border-[#2d2d3e]">
              <h3 className="text-white font-semibold">Recent Activity</h3>
              <p className="text-slate-500 text-xs mt-0.5">Last 50 actions on your account</p>
            </div>
            {activity.length === 0 ? (
              <div className="text-center py-12 text-slate-600 text-sm">No activity yet</div>
            ) : (
              <div className="divide-y divide-[#2d2d3e]/50">
                {activity.map((a, i) => (
                  <div key={i} className="px-5 py-3 flex items-start gap-3">
                    <span className="text-lg mt-0.5">{ACTION_ICONS[a.action] || ACTION_ICONS.default}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300 text-sm font-medium">{a.action.replace(/_/g," ")}</span>
                        <span className="text-slate-600 text-xs">{new Date(a.created_at).toLocaleString()}</span>
                      </div>
                      {a.details && <p className="text-slate-500 text-xs mt-0.5 truncate">{a.details}</p>}
                      {a.ip && <p className="text-slate-700 text-[10px] mt-0.5">IP: {a.ip}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
