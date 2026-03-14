import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useUser } from "./UserContext";

// ─── Nav config ────────────────────────────────────────────────────────────
const NAV = [
  {
    category: "Overview",
    items: [
      { icon: "🏠", label: "Dashboard",  to: "/"         },
      { icon: "📊", label: "Status",     to: "/status",  external: true },
    ],
  },
  {
    category: "Finance",
    items: [
      { icon: "🪙", label: "BB Coins Store",  to: "/store"     },
      { icon: "💳", label: "Subscribe",       to: "/subscribe" },
      { icon: "👥", label: "Referral",        to: "/referral"  },
    ],
  },
  {
    category: "Help",
    items: [
      { icon: "💬", label: "Support Chat",    to: "/support"  },
      { icon: "📲", label: "Telegram Alerts", to: "/account", hash: "#telegram" },
    ],
  },
  {
    category: "Account",
    items: [
      { icon: "👤", label: "My Account",  to: "/account" },
    ],
  },
];

const ADMIN_ITEMS = { category: "Admin", items: [
  { icon: "👑", label: "Admin Panel",  to: "/admin",   accent: "text-red-400" },
]};

// Bottom tab bar items
const TABS = [
  { icon: "🏠", label: "Home",    to: "/"        },
  { icon: "🪙", label: "Store",   to: "/store"   },
  { icon: "💬", label: "Support", to: "/support" },
  { icon: "👤", label: "Account", to: "/account" },
];

export default function Layout({ children }) {
  const { user, notifications, markRead } = useUser();
  const [sidebarOpen, setSidebar]  = useState(false);
  const [showNotif, setShowNotif]  = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const notifRef = useRef(null);
  const sidebarRef = useRef(null);

  const isAdmin = user?.role === "admin" || user?.role === "moderator";
  const unread  = notifications.filter(n => !n.read).length;

  // Close sidebar on route change
  useEffect(() => { setSidebar(false); }, [location.pathname]);

  // Click outside to close notifications
  useEffect(() => {
    function handler(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotif(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Prevent body scroll when sidebar open on mobile
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen]);

  function logout() {
    localStorage.removeItem("bp_token");
    localStorage.removeItem("bp_user");
    navigate("/login");
  }

  function isActive(to) {
    if (to === "/") return location.pathname === "/";
    return location.pathname.startsWith(to);
  }

  // Build full nav (add admin section if applicable)
  const fullNav = isAdmin ? [...NAV, ADMIN_ITEMS] : NAV;

  // ─── Sidebar content ────────────────────────────────────────────────────
  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-[#2d2d3e]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-lg shrink-0">🦅</div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">BrucePanel</p>
            <p className="text-slate-600 text-[10px]">by Bera Tech Org</p>
          </div>
        </div>
      </div>

      {/* User card */}
      {user && (
        <div className="px-4 py-3 mx-3 mt-3 bg-[#1a1a24] border border-[#2d2d3e] rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
              {user.username?.[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold truncate">{user.username}</p>
              <p className="text-amber-400 text-[11px] font-medium">🪙 {user.coins?.toLocaleString() || 0} BB Coins</p>
            </div>
            {isAdmin && (
              <span className="shrink-0 text-[9px] bg-red-900/40 text-red-400 border border-red-800/60 px-1.5 py-0.5 rounded-full font-semibold">
                {user.role}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {fullNav.map(section => (
          <div key={section.category}>
            <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider px-2 mb-1.5">{section.category}</p>
            <div className="space-y-0.5">
              {section.items.map(item => (
                <Link
                  key={item.to + (item.label || "")}
                  to={item.to}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition active:scale-[.97]
                    ${isActive(item.to)
                      ? "bg-blue-600/20 text-blue-400 border border-blue-600/30"
                      : `${item.accent || "text-slate-300"} hover:bg-[#1a1a24] hover:text-white`}`}>
                  <span className="text-base w-5 text-center shrink-0">{item.icon}</span>
                  {item.label}
                  {item.to === "/support" && unread > 0 && (
                    <span className="ml-auto bg-blue-600 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">{unread}</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom: status + logout */}
      <div className="px-3 py-4 border-t border-[#2d2d3e] space-y-1">
        <a href="/status" target="_blank" rel="noreferrer"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-500 hover:text-white hover:bg-[#1a1a24] transition">
          <span className="w-5 text-center">🟢</span> System Status
        </a>
        <button onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-500 hover:text-red-400 hover:bg-red-900/10 transition">
          <span className="w-5 text-center">🚪</span> Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex">

      {/* ── Desktop sidebar (always visible ≥1024px) ──────────────────── */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0 bg-[#111118] border-r border-[#2d2d3e] sticky top-0 h-screen overflow-hidden">
        <SidebarContent />
      </aside>

      {/* ── Mobile sidebar overlay ──────────────────────────────────────── */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebar(false)} />
          {/* Drawer */}
          <div ref={sidebarRef}
            className="relative z-10 w-72 bg-[#111118] border-r border-[#2d2d3e] flex flex-col h-full shadow-2xl animate-slide-in-left">
            {/* Close button */}
            <button onClick={() => setSidebar(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-[#1a1a24] border border-[#2d2d3e] flex items-center justify-center text-slate-400 active:scale-95 z-10">
              ✕
            </button>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* ── Main content column ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* ── Top bar (mobile + desktop) ─────────────────────────────── */}
        <header className="sticky top-0 z-30 bg-[#111118] border-b border-[#2d2d3e] flex items-center gap-3 px-4 py-3">
          {/* Hamburger (mobile only) */}
          <button onClick={() => setSidebar(true)}
            className="lg:hidden w-9 h-9 flex flex-col items-center justify-center gap-1.5 rounded-xl bg-[#1a1a24] border border-[#2d2d3e] active:scale-95 shrink-0">
            <span className="w-4 h-0.5 bg-slate-300 rounded-full" />
            <span className="w-4 h-0.5 bg-slate-300 rounded-full" />
            <span className="w-4 h-0.5 bg-slate-300 rounded-full" />
          </button>

          {/* Logo (mobile only — hidden on desktop since sidebar has it) */}
          <div className="lg:hidden flex-1 min-w-0">
            <p className="text-white font-bold text-sm">🦅 BrucePanel</p>
          </div>

          {/* Spacer for desktop */}
          <div className="hidden lg:flex flex-1" />

          {/* Coins badge (desktop) */}
          {user && (
            <Link to="/store"
              className="hidden lg:flex items-center gap-2 bg-amber-900/20 border border-amber-800/40 rounded-xl px-3 py-1.5 hover:bg-amber-900/30 transition">
              <span>🪙</span>
              <span className="text-amber-400 font-bold text-sm">{user.coins?.toLocaleString() || 0}</span>
            </Link>
          )}

          {/* Notification bell */}
          <div className="relative" ref={notifRef}>
            <button onClick={() => setShowNotif(v => !v)}
              className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-[#1a1a24] border border-[#2d2d3e] text-slate-400 hover:text-white active:scale-95 transition">
              🔔
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 border-2 border-[#111118]">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>

            {/* Notification dropdown */}
            {showNotif && (
              <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-[#111118] border border-[#2d2d3e] rounded-2xl shadow-2xl z-50 max-h-96 overflow-y-auto">
                <div className="px-4 py-3 border-b border-[#2d2d3e] flex items-center justify-between sticky top-0 bg-[#111118]">
                  <span className="text-sm font-semibold text-white">Notifications</span>
                  {unread > 0 && <span className="text-xs text-slate-500">{unread} unread</span>}
                </div>
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-2xl mb-2">🔔</p>
                    <p className="text-slate-500 text-sm">No notifications</p>
                  </div>
                ) : notifications.slice(0, 20).map(n => (
                  <div key={n.id} onClick={() => markRead(n.id)}
                    className={`px-4 py-3 border-b border-[#2d2d3e]/50 last:border-0 cursor-pointer hover:bg-[#1a1a24] active:bg-[#1a1a24] transition
                      ${!n.read ? "border-l-2 border-l-blue-500" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className={`text-xs font-semibold ${!n.read ? "text-white" : "text-slate-400"}`}>{n.title}</span>
                      <span className="text-[10px] text-slate-600 shrink-0">{new Date(n.created_at).toLocaleDateString()}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{n.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* User avatar */}
          {user && (
            <Link to="/account"
              className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-sm shrink-0 border-2 border-transparent hover:border-blue-500 transition">
              {user.username?.[0]?.toUpperCase()}
            </Link>
          )}
        </header>

        {/* ── Page content ────────────────────────────────────────────── */}
        <main className="flex-1 pb-20 lg:pb-0">
          {children}
        </main>
      </div>

      {/* ── Mobile bottom tab bar ───────────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#111118] border-t border-[#2d2d3e] flex safe-bottom">
        {TABS.map(tab => {
          const active = isActive(tab.to);
          return (
            <Link key={tab.to} to={tab.to}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition active:scale-95
                ${active ? "text-blue-400" : "text-slate-500"}`}>
              <span className="text-xl leading-none">{tab.icon}</span>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
        {/* More → opens sidebar */}
        <button onClick={() => setSidebar(true)}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-slate-500 active:scale-95 active:text-white transition">
          <span className="text-xl leading-none">☰</span>
          <span className="text-[10px] font-medium">More</span>
        </button>
      </nav>

      <style>{`
        @keyframes slide-in-left {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0);     }
        }
        .animate-slide-in-left { animation: slide-in-left 0.22s ease-out; }
      `}</style>
    </div>
  );
}
