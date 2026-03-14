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

  // Notifications
  notifications: () => req("GET", "/notifications"),
  markRead: (id) => req("PUT", `/notifications/${id}/read`),

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

  // Subscribe
  plans: () => req("GET", "/subscribe/plans"),
  initiatePay: (planId, phone) => req("POST", "/subscribe/initiate", { planId, phone }),
  payStatus: (checkoutRequestId) => req("GET", `/subscribe/status/${checkoutRequestId}`),

  // Referral
  referralInfo: () => req("GET", "/referral/info"),

  // Admin
  adminStats: () => req("GET", "/admin/stats"),
  adminUsers: () => req("GET", "/admin/users"),
  adminUpdateCoins: (id, amount, reason) => req("POST", `/admin/users/${id}/coins`, { amount, reason }),
  adminBan: (id, banned) => req("POST", `/admin/users/${id}/ban`, { banned }),
  adminSetRole: (id, role) => req("POST", `/admin/users/${id}/role`, { role }),
  adminSetEmail: (id, email) => req("POST", `/admin/users/${id}/email`, { email }),
  adminDeleteUser: (id) => req("DELETE", `/admin/users/${id}`),
  adminProjects: () => req("GET", "/admin/projects"),
  adminDeleteProject: (id) => req("DELETE", `/admin/projects/${id}`),
  adminTransactions: () => req("GET", "/admin/transactions"),
  adminNotify: (data) => req("POST", "/admin/notifications", data),
  adminPurge: (days = 30) => req("POST", "/admin/notifications/purge", { olderThanDays: days }),
  adminBulkCoins: (amount, reason, excludeAdmin = true) =>
    req("POST", "/admin/bulk/coins", { amount, reason, excludeAdmin }),
};
