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
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  register: (u, p) => req("POST", "/auth/register", { username: u, password: p }),
  login: (u, p) => req("POST", "/auth/login", { username: u, password: p }),
  logout: () => req("POST", "/auth/logout"),
  me: () => req("GET", "/auth/me"),
  projects: () => req("GET", "/projects"),
  getProject: (id) => req("GET", `/projects/${id}`),
  createProject: (data) => req("POST", "/projects", data),
  deleteProject: (id) => req("DELETE", `/projects/${id}`),
  deployProject: (id, data) => req("POST", `/projects/${id}/deploy`, data),
  startProject: (id) => req("POST", `/projects/${id}/start`),
  stopProject: (id) => req("POST", `/projects/${id}/stop`),
  restartProject: (id) => req("POST", `/projects/${id}/restart`),
  reinstallProject: (id) => req("POST", `/projects/${id}/reinstall`),
  getLogs: (id, lines = 100) => req("GET", `/projects/${id}/logs?lines=${lines}`),
  getEnv: (id) => req("GET", `/projects/${id}/env`),
  updateEnv: (id, env) => req("PUT", `/projects/${id}/env`, { env }),
};
