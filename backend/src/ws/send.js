/** Send a JSON message over a WebSocket, silently dropping if not open. */
export function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}
