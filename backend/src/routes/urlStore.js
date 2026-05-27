import fs   from "fs";
import path from "path";

const FILE = path.resolve(process.cwd(), ".urls.json");

function read() {
  try { return fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE,"utf8")) : { urls:[], activeId:null }; }
  catch { return { urls:[], activeId:null }; }
}
function write(data) { fs.writeFileSync(FILE, JSON.stringify(data,null,2),"utf8"); }

import crypto from "crypto";

export const urlStore = {
  list()  { return read(); },

  add(url, label) {
    const data = read();
    const id   = `url-${crypto.randomUUID().slice(0,8)}`;
    data.urls.push({ id, url: url.trim().replace(/\/$/,""), label: label || url, createdAt: new Date().toISOString() });
    if (!data.activeId) data.activeId = id;
    write(data); return data;
  },

  activate(id) {
    const data = read();
    if (data.urls.find(u => u.id === id)) { data.activeId = id; write(data); }
    return data;
  },

  remove(id) {
    const data = read();
    data.urls = data.urls.filter(u => u.id !== id);
    if (data.activeId === id) data.activeId = data.urls[0]?.id || null;
    write(data); return data;
  },

  getActive() {
    const data = read();
    return data.urls.find(u => u.id === data.activeId) || null;
  },
};

export function urlRoutes(app) {
  app.get("/api/urls",           (_, res) => res.json(urlStore.list()));
  app.post("/api/urls",          (req, res) => res.json(urlStore.add(req.body.url, req.body.label)));
  app.post("/api/urls/:id/activate", (req, res) => res.json(urlStore.activate(req.params.id)));
  app.delete("/api/urls/:id",    (req, res) => res.json(urlStore.remove(req.params.id)));
  app.get("/api/urls/active",    (_, res) => res.json({ active: urlStore.getActive() }));
}
