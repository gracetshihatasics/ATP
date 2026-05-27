import { useState, useEffect, useCallback } from "react";

const BACKEND = "http://localhost:3579";

export function useUrls() {
  const [urls,     setUrls]     = useState([]);
  const [activeId, setActiveId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`${BACKEND}/api/urls`);
      const data = await res.json();
      setUrls(data.urls || []);
      setActiveId(data.activeId || null);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeUrl = urls.find(u => u.id === activeId)?.url || "";

  const add = async (url, label) => {
    if (!url) return;
    await fetch(`${BACKEND}/api/urls`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ url, label }),
    });
    load();
  };

  const activate = async (id) => {
    await fetch(`${BACKEND}/api/urls/${id}/activate`, { method:"POST" });
    load();
  };

  const remove = async (id) => {
    await fetch(`${BACKEND}/api/urls/${id}`, { method:"DELETE" });
    load();
  };

  return { urls, activeId, activeUrl, add, activate, remove, reload: load };
}
