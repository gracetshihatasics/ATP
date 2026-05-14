export const WS_URL = "ws://localhost:3579";

/**
 * Create and return a WebSocket connected to the ATP backend.
 * @param {{ onMessage: (msg:object)=>void, onOpen: ()=>void, onClose: ()=>void, onError: ()=>void }} handlers
 * @returns {WebSocket}
 */
export function createWSConnection({ onMessage, onOpen, onClose, onError }) {
  const socket = new WebSocket(WS_URL);

  socket.onopen    = onOpen;
  socket.onclose   = onClose;
  socket.onerror   = onError;
  socket.onmessage = (e) => {
    try { onMessage(JSON.parse(e.data)); } catch { /* ignore malformed */ }
  };

  return socket;
}

/**
 * Send a JSON payload over an open WebSocket.
 * Silently drops if the socket is not in OPEN state.
 * @param {WebSocket|null} socket
 * @param {object} payload
 */
export function wsSend(socket, payload) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}
