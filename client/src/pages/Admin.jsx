import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";

const TABS = ["Overview", "Users", "Projects", "Transactions", "Notifications"];

export default function Admin() {
  const [tab, setTab] = useState("Overview");
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedUser, setExpandedUser] = useState(null);
  const [notifForm, setNotifForm] = useState({ title:"", message:"", type:"info", userId:"" });
  const [bulkCoins, setBulkCoins] = useState({ amount:"", reason:"" });
  const [msg, setMsg] = useState("");
  const nav = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [s, u, p, t] = await Promise.all([
        api.adminStats(), api.adminUsers(), api.adminProjects(), api.adminTransactions()
      ]);
      setStats(s);
      setUsers(u.users || []);
      setProjects(p.projects || []);
      setTransactions(t.transactions || []);
    } catch (e) {
      if (e.message === "Forbidden" || e.message === "Unauthorized") nav("/");
      setError(e.message);
    }
    setLoading(false);
  }

  function flash(m) { setMsg(m); setTimeout(() => setMsg(""), 3000); }

  async function doUserAction(fn, successMsg) {
    try { await fn(); await loadData(); flash(successMsg); }
    catch (e) { alert(e.message); }
  }

  async function sendNotif(e) {
    e.preventDefault();
    try {
      await api.adminNotify({
        ...notifForm,
        userId: notifForm.userId ? parseInt(notifForm.userId) : undefined
      });
      flash("Notification sent!");
      setNotifForm({ title:"", message:"", type:"info", userId:"" });
    } catch (e) { alert(e.message); }
  }

  async function doBulkCoins(e) {
    e.preventDefault();
    if (!confirm(`Give ${bulkCoins.amount} coins to all users?`)) return;
    try {
      const r = await api.adminBulkCoins(parseInt(bulkCoins.amount), bulkCoins.reason);
      flash(`Sent ${bulkCoins.amount} coins to ${r.affectedUsers} users`);
      setBulkCoins({ amount:"", reason:"" });
      await loadData();
    } catch (e) { alert(e.message); }
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="text-slate-500">Loading admin panel...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Header */}
      <div className="border-b border-[#2d2d3e] bg-[#111118] px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Admin Panel</h1>
          <p className="text-xs text-slate-500">BrucePanel by Bera Tech Org</p>
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className="text-green-400 text-sm">{msg}</span>}
          {error && <span className="text-red-400 text-sm">{error}</span>}
          <Link to="/" className="text-slate-400 hover:text-white text-sm transition">← Dashboard</Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[#2d2d3e] bg-[#111118] px-6 flex gap-1 overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${tab === t ? "border-red-400 text-red-400" : "border-transparent text-slate-400 hover:text-white"}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Overview */}
        {tab === "Overview" && stats && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Total Users", value: stats.totalUsers, icon:"👥", color:"text-blue-400" },
                { label: "Total Projects", value: stats.totalProjects, icon:"📁", color:"text-green-400" },
                { label: "Total Revenue", value: `KSH ${stats.totalRevenue?.toLocaleString() || 0}`, icon:"💰", color:"text-amber-400" },
                { label: "Total Coins", value: stats.totalCoinsInCirculation?.toLocaleString() || 0, icon:"🪙", color:"text-purple-400" },
              ].map(s => (
                <div key={s.label} className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-4">
                  <div className="text-2xl mb-1">{s.icon}</div>
                  <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-slate-500 text-xs mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Airdrop */}
            <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-6">
              <h3 className="text-white font-semibold mb-4">Airdrop BB Coins to All Users</h3>
              <form onSubmit={doBulkCoins} className="flex flex-col sm:flex-row gap-3">
                <input value={bulkCoins.amount} onChange={e => setBulkCoins(f => ({ ...f, amount: e.target.value }))}
                  className="bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 w-32"
                  placeholder="Coins" type="number" required />
                <input value={bulkCoins.reason} onChange={e => setBulkCoins(f => ({ ...f, reason: e.target.value }))}
                  className="flex-1 bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500"
                  placeholder="Reason (e.g. Holiday Airdrop)" required />
                <button type="submit" className="bg-amber-600 hover:bg-amber-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition">
                  Send Airdrop
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Users */}
        {tab === "Users" && (
          <div className="space-y-3">
            <div className="text-slate-400 text-sm">{users.length} users total</div>
            {users.map(u => (
              <div key={u.id} className="bg-[#111118] border border-[#2d2d3e] rounded-xl">
                <div className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-[#1a1a24] transition rounded-xl"
                  onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#2d2d3e] flex items-center justify-center text-slate-300 font-bold text-sm">
                      {u.username[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">{u.username}</div>
                      <div className="text-slate-500 text-xs">{u.email || "no email"} · {u.role}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-amber-400 font-medium">🪙 {u.coins?.toLocaleString()}</span>
                    {u.isBanned && <span className="text-red-400 text-xs bg-red-900/30 px-2 py-0.5 rounded">Banned</span>}
                    <span className={`text-slate-400 transition ${expandedUser === u.id ? "rotate-180" : ""}`}>▼</span>
                  </div>
                </div>

                {expandedUser === u.id && (
                  <div className="px-5 pb-5 border-t border-[#2d2d3e] pt-4">
                    <div className="text-slate-500 text-xs mb-3">
                      Joined: {new Date(u.createdAt).toLocaleDateString()} · Projects: {u.projectCount || 0} · Referrals: {u.referralCount || 0}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {["admin","moderator","user"].map(role => (
                        <button key={role} onClick={() => doUserAction(() => api.adminSetRole(u.id, role), `Role set to ${role}`)}
                          className={`text-xs px-3 py-1.5 rounded-lg border transition ${u.role === role ? "bg-blue-600 border-blue-500 text-white" : "bg-[#1a1a24] border-[#2d2d3e] text-slate-300 hover:border-blue-500"}`}>
                          {role}
                        </button>
                      ))}
                      <button onClick={() => doUserAction(() => api.adminBan(u.id, !u.isBanned), u.isBanned ? "User unbanned" : "User banned")}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition ${u.isBanned ? "bg-green-900/30 border-green-700 text-green-400" : "bg-red-900/30 border-red-700 text-red-400"}`}>
                        {u.isBanned ? "Unban" : "Ban"}
                      </button>
                      <button onClick={async () => {
                        const amt = prompt("Coins to add (+) or remove (-):"); if (!amt) return;
                        const reason = prompt("Reason:") || "Admin adjustment";
                        doUserAction(() => api.adminUpdateCoins(u.id, parseInt(amt), reason), `Coins updated`);
                      }} className="text-xs px-3 py-1.5 rounded-lg border border-[#2d2d3e] bg-[#1a1a24] text-amber-400 hover:border-amber-500 transition">
                        ± Coins
                      </button>
                      <button onClick={() => {
                        if (confirm(`Delete user ${u.username}? This cannot be undone.`))
                          doUserAction(() => api.adminDeleteUser(u.id), "User deleted");
                      }} className="text-xs px-3 py-1.5 rounded-lg border border-red-900 bg-red-900/10 text-red-400 hover:bg-red-900/30 transition">
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Projects */}
        {tab === "Projects" && (
          <div className="space-y-3">
            <div className="text-slate-400 text-sm">{projects.length} projects total</div>
            {projects.map(p => (
              <div key={p.id} className="bg-[#111118] border border-[#2d2d3e] rounded-xl px-5 py-4 flex items-center justify-between">
                <div>
                  <div className="text-white font-medium text-sm">{p.name}</div>
                  <div className="text-slate-500 text-xs mt-0.5">
                    owner: {p.username || p.userId} · {p.status}
                    {p.isFreeSlot && <span className="text-green-400 ml-2">· free slot</span>}
                  </div>
                </div>
                <button onClick={() => {
                  if (confirm(`Delete project "${p.name}"?`))
                    doUserAction(() => api.adminDeleteProject(p.id), "Project deleted");
                }} className="text-xs px-3 py-1.5 bg-red-900/20 border border-red-900 text-red-400 hover:bg-red-900/40 rounded-lg transition">
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Transactions */}
        {tab === "Transactions" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2d2d3e] text-slate-400 text-xs">
                  <th className="text-left py-3 pr-4">ID</th>
                  <th className="text-left py-3 pr-4">User</th>
                  <th className="text-left py-3 pr-4">Plan</th>
                  <th className="text-left py-3 pr-4">Amount</th>
                  <th className="text-left py-3 pr-4">Status</th>
                  <th className="text-left py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(t => (
                  <tr key={t.id} className="border-b border-[#2d2d3e]/40 hover:bg-[#111118] transition">
                    <td className="py-3 pr-4 text-slate-600 text-xs font-mono">#{t.id}</td>
                    <td className="py-3 pr-4 text-slate-300">{t.username || t.userId}</td>
                    <td className="py-3 pr-4 text-slate-300 capitalize">{t.planId}</td>
                    <td className="py-3 pr-4 text-amber-400 font-medium">KSH {t.amount?.toLocaleString()}</td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${t.status === "completed" ? "bg-green-900/30 text-green-400" : t.status === "failed" ? "bg-red-900/30 text-red-400" : "bg-yellow-900/30 text-yellow-400"}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="py-3 text-slate-500 text-xs">{new Date(t.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {transactions.length === 0 && <div className="text-slate-500 text-center py-12">No transactions yet</div>}
          </div>
        )}

        {/* Notifications */}
        {tab === "Notifications" && (
          <div className="space-y-6">
            <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-6">
              <h3 className="text-white font-semibold mb-4">Send Notification</h3>
              <form onSubmit={sendNotif} className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 text-xs block mb-1">Title *</label>
                    <input value={notifForm.title} onChange={e => setNotifForm(f => ({ ...f, title: e.target.value }))}
                      className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 text-sm"
                      placeholder="Announcement" required />
                  </div>
                  <div>
                    <label className="text-slate-400 text-xs block mb-1">Type</label>
                    <select value={notifForm.type} onChange={e => setNotifForm(f => ({ ...f, type: e.target.value }))}
                      className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 text-sm">
                      <option value="info">Info</option>
                      <option value="success">Success</option>
                      <option value="warning">Warning</option>
                      <option value="error">Error</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Message *</label>
                  <textarea value={notifForm.message} onChange={e => setNotifForm(f => ({ ...f, message: e.target.value }))}
                    className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 text-sm resize-none"
                    rows={3} placeholder="Notification message..." required />
                </div>
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Target User ID <span className="text-slate-600">(leave blank to send to all)</span></label>
                  <input value={notifForm.userId} onChange={e => setNotifForm(f => ({ ...f, userId: e.target.value }))}
                    className="w-full bg-[#1a1a24] border border-[#2d2d3e] rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 text-sm"
                    placeholder="e.g. 42 (optional)" type="number" />
                </div>
                <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition">
                  {notifForm.userId ? "Send to User" : "Broadcast to All"}
                </button>
              </form>
            </div>

            <div className="bg-[#111118] border border-[#2d2d3e] rounded-xl p-6">
              <h3 className="text-white font-semibold mb-2">Purge Old Notifications</h3>
              <p className="text-slate-500 text-sm mb-4">Delete notifications older than 30 days.</p>
              <button onClick={() => {
                if (confirm("Purge notifications older than 30 days?"))
                  doUserAction(() => api.adminPurge(30), "Old notifications purged");
              }} className="bg-red-900/30 hover:bg-red-900/50 border border-red-700 text-red-400 px-5 py-2.5 rounded-lg text-sm transition">
                Purge Old Notifications
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
