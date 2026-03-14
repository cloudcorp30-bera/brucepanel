const BASE = "/api/brucepanel";

function getToken() { return localStorage.getItem("bp_token"); }

async function req(method, path, body) {
  const token = getToken();
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || "Request failed"), { code: data.error });
  return data;
}

export const api = {
  // Auth
  register: (username, password, email = "", referralCode = "") =>
    req("POST", "/auth/register", { username, password, email, referralCode }),
  login: (username, password) => req("POST", "/auth/login", { username, password }),
  me: () => req("GET", "/auth/me"),

  // Account
  updateProfile: (email, bio) => req("PUT", "/account/profile", { email, bio }),
  changePassword: (currentPassword, newPassword) => req("PUT", "/account/password", { currentPassword, newPassword }),
  userActivity: () => req("GET", "/account/activity"),
  getTelegram: () => req("GET", "/account/telegram"),
  saveTelegram: (chatId, enabled) => req("PUT", "/account/telegram", { chatId, enabled }),

  // Notifications
  notifications: () => req("GET", "/notifications"),
  markRead: (id) => req("PUT", `/notifications/${id}/read`),

  // Templates
  templates: () => req("GET", "/templates"),

  // Promo codes
  redeemPromo: (code) => req("POST", "/promo/redeem", { code }),

  // Projects
  projects: () => req("GET", "/projects"),
  getProject: (id) => req("GET", `/projects/${id}`),
  createProject: (data) => req("POST", "/projects", data),
  deleteProject: (id) => req("DELETE", `/projects/${id}`),
  startProject: (id) => req("POST", `/projects/${id}/start`),
  stopProject: (id) => req("POST", `/projects/${id}/stop`),
  getLogs: (id) => req("GET", `/projects/${id}/logs`),
  getEnv: (id) => req("GET", `/projects/${id}/env`),
  updateEnv: (id, env) => req("PUT", `/projects/${id}/env`, { env }),
  updateProjectSettings: (id, data) => req("PUT", `/projects/${id}/settings`, data),
  deployProject: (id, data) => req("POST", `/projects/${id}/deploy`, data),
  backupProject: (id) => `${BASE}/projects/${id}/backup`,
  logsDownloadUrl: (id) => `${BASE}/projects/${id}/logs/download`,
  cloneProject: (id, name) => req("POST", `/projects/${id}/clone`, { name }),

  // Webhook
  getWebhook: (id) => req("GET", `/projects/${id}/webhook`),
  regenWebhook: (id) => req("POST", `/projects/${id}/webhook/regenerate`),

  // npm package manager
  npmPackages: (id) => req("GET", `/projects/${id}/npm/packages`),
  npmInstall: (id, packages, dev = false) => req("POST", `/projects/${id}/npm/install`, { packages, dev }),
  npmUninstall: (id, packages) => req("DELETE", `/projects/${id}/npm/uninstall`, { packages }),

  // File manager
  uploadFile: (projectId, file) => {
    const token = localStorage.getItem("bp_token");
    const form = new FormData();
    form.append("file", file, file.name);
    return fetch(`${BASE}/projects/${projectId}/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Upload failed"); return d; });
  },
  listFiles: (id) => req("GET", `/projects/${id}/files`),
  getFileContent: (id, p) => req("GET", `/projects/${id}/files/content?path=${encodeURIComponent(p)}`),
  saveFileContent: (id, p, content) => req("PUT", `/projects/${id}/files/content`, { path: p, content }),
  deleteFile: (id, p) => req("DELETE", `/projects/${id}/files?path=${encodeURIComponent(p)}`),

  // Subscribe
  plans: () => req("GET", "/subscribe/plans"),
  initiatePay: (planId, phone) => req("POST", "/subscribe/initiate", { planId, phone }),
  payStatus: (checkoutRequestId) => req("GET", `/subscribe/status/${checkoutRequestId}`),

  // Referral
  referralInfo: () => req("GET", "/referral/info"),

  // Store
  getStore: () => req("GET", "/store"),
  buyItem: (itemId) => req("POST", "/store/buy", { itemId }),

  // Public status (no auth needed)
  publicStatus: async () => { const r = await fetch(BASE + "/status"); return r.json(); },

  // Admin
  adminStats: () => req("GET", "/admin/stats"),
  adminSystem: () => req("GET", "/admin/system"),
  adminUsers: () => req("GET", "/admin/users"),
  adminUpdateCoins: (id, amount, reason) => req("POST", `/admin/users/${id}/coins`, { amount, reason }),
  adminBan: (id, banned) => req("POST", `/admin/users/${id}/ban`, { banned }),
  adminSetRole: (id, role) => req("POST", `/admin/users/${id}/role`, { role }),
  adminDeleteUser: (id) => req("DELETE", `/admin/users/${id}`),
  adminMessageUser: (id, title, message, type) => req("POST", `/admin/users/${id}/message`, { title, message, type }),
  adminImpersonate: (id) => req("POST", `/admin/users/${id}/impersonate`),
  adminProjects: () => req("GET", "/admin/projects"),
  adminDeleteProject: (id) => req("DELETE", `/admin/projects/${id}`),
  adminProjectLogs: (id) => req("GET", `/admin/projects/${id}/logs`),
  adminForceStop: (id) => req("POST", `/admin/projects/${id}/force-stop`),
  adminForceStart: (id) => req("POST", `/admin/projects/${id}/force-start`),
  adminTransactions: () => req("GET", "/admin/transactions"),
  adminNotify: (data) => req("POST", "/admin/notifications", data),
  adminPurge: (days = 30) => req("POST", "/admin/notifications/purge", { olderThanDays: days }),
  adminBulkCoins: (amount, reason, excludeAdmin = true) => req("POST", "/admin/bulk/coins", { amount, reason, excludeAdmin }),
  adminPromo: () => req("GET", "/admin/promo"),
  adminCreatePromo: (data) => req("POST", "/admin/promo", data),
  adminDeletePromo: (code) => req("DELETE", `/admin/promo/${code}`),
  adminAudit: (page = 1) => req("GET", `/admin/audit?page=${page}`),
  adminPlatform: () => req("GET", "/admin/platform"),
  adminSavePlatform: (settings) => req("PUT", "/admin/platform", { settings }),

  // Advanced admin
  adminAnalytics: () => req("GET", "/admin/analytics"),
  adminLiveFeed: () => req("GET", "/admin/live-feed"),
  adminSearchUsers: ({ q, role, banned, minCoins, maxCoins }) =>
    req("GET", `/admin/users/search?q=${encodeURIComponent(q||"")}&role=${role||""}&banned=${banned||""}&minCoins=${minCoins||""}&maxCoins=${maxCoins||""}`),
  adminBulkAction: (userIds, action, value, reason) =>
    req("POST", "/admin/users/bulk-action", { userIds, action, value, reason }),
  adminEmergencyStop: () => req("POST", "/admin/emergency/stop-all"),
  adminEmergencyRestart: () => req("POST", "/admin/emergency/restart-all"),
  adminEmergencyBroadcast: (title, message, type) =>
    req("POST", "/admin/emergency/broadcast", { title, message, type }),
  adminNotes: () => req("GET", "/admin/notes"),
  adminSaveNotes: (notes) => req("PUT", "/admin/notes", { notes }),

  // Support chat
  supportSessions: () => req("GET", "/support/sessions"),
  supportCreate: (subject) => req("POST", "/support/sessions", { subject }),
  supportSession: (id) => req("GET", `/support/sessions/${id}`),
  supportSend: (id, message) => req("POST", `/support/sessions/${id}/messages`, { message }),
  supportClose: (id) => req("PUT", `/support/sessions/${id}/close`),
  supportReopen: (id) => req("PUT", `/support/sessions/${id}/reopen`),

  // Admin support
  adminSupportSessions: (status = "") => req("GET", `/admin/support/sessions${status ? `?status=${status}` : ""}`),
  adminSupportStats: () => req("GET", "/admin/support/stats"),
};
