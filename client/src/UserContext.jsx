import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "./api";

const UserCtx = createContext(null);

export function UserProvider({ children }) {
  const [user, setUser]                   = useState(null);
  const [notifications, setNotifications] = useState([]);

  const reload = useCallback(async () => {
    try {
      const [me, notif] = await Promise.all([api.me(), api.notifications()]);
      setUser(me);
      localStorage.setItem("bp_user", JSON.stringify(me));
      setNotifications(notif.notifications || []);
    } catch {}
  }, []);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 30000); // refresh every 30s
    return () => clearInterval(t);
  }, [reload]);

  async function markRead(id) {
    try { await api.markNotifRead(id); reload(); } catch {}
  }

  return (
    <UserCtx.Provider value={{ user, notifications, markRead, reload }}>
      {children}
    </UserCtx.Provider>
  );
}

export function useUser() { return useContext(UserCtx); }
