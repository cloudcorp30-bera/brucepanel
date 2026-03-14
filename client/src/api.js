
// File manager (add to existing api object)
Object.assign(api, {
  uploadFile: (projectId, file) => {
    const token = localStorage.getItem("bp_token");
    const form = new FormData();
    form.append("file", file, file.name);
    return fetch(`/api/brucepanel/projects/${projectId}/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }).then(async r => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Upload failed");
      return d;
    });
  },
  listFiles: (projectId) => req("GET", `/projects/${projectId}/files`),
  getFileContent: (projectId, filePath) => req("GET", `/projects/${projectId}/files/content?path=${encodeURIComponent(filePath)}`),
  saveFileContent: (projectId, filePath, content) => req("PUT", `/projects/${projectId}/files/content`, { path: filePath, content }),
  deleteFile: (projectId, filePath) => req("DELETE", `/projects/${projectId}/files?path=${encodeURIComponent(filePath)}`),
  deployProject: (projectId, data) => req("POST", `/projects/${projectId}/deploy`, data),
});
