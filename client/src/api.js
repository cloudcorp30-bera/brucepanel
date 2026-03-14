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

  // Admin
  adminStats: () => req("GET", "/admin/stats"),
  adminSystem: () => req("GET", "/admin/system"),
  adminUsers: () => req("GET", "/admin/users"),
  adminUpdateCoins: (id, amount, reason) => req("POST", `/admin/users/${id}/coins`, { amount, reason }),
  adminBan: (id, banned) => req("POST", `/admin/users/${id}/ban`, { banned }),
  adminSetRole: (id, role) => req("POST", `/admin/users/${id}/role`, { role }),
  adminSetEmail: (id, email) => req("POST", `/admin/users/${id}/email`, { email }),
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
};
