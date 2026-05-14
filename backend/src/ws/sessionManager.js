/** @typedef {{ browser: import('playwright').Browser, page: import('playwright').Page, ws: import('ws').WebSocket, running: boolean }} Session */

/** @type {Map<string, Session>} */
const sessions = new Map();

export const sessionManager = {
  set(id, session)  { sessions.set(id, session); },
  get(id)           { return sessions.get(id); },
  has(id)           { return sessions.has(id); },
  count()           { return sessions.size; },

  async destroy(id) {
    const s = sessions.get(id);
    if (!s) return;
    s.running = false;
    await s.browser?.close().catch(() => {});
    sessions.delete(id);
  },

  stop(id) {
    const s = sessions.get(id);
    if (s) s.running = false;
  },

  isRunning(id) {
    return sessions.get(id)?.running ?? false;
  },
};
