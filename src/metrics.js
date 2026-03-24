export const metrics = {
  http_requests_total: 0,
  http_errors_total: 0,
  ws_connections_total: 0,
  ws_connections_active: 0,
  ws_messages_total: 0,
  ws_messages_direct_total: 0,
  ws_messages_broadcast_total: 0,
  auth_failures_total: 0
};

export function renderMetrics(roomsPermanent, roomsSession) {
  const lines = [
    `http_requests_total ${metrics.http_requests_total}`,
    `http_errors_total ${metrics.http_errors_total}`,
    `ws_connections_total ${metrics.ws_connections_total}`,
    `ws_connections_active ${metrics.ws_connections_active}`,
    `ws_messages_total ${metrics.ws_messages_total}`,
    `ws_messages_direct_total ${metrics.ws_messages_direct_total}`,
    `ws_messages_broadcast_total ${metrics.ws_messages_broadcast_total}`,
    `auth_failures_total ${metrics.auth_failures_total}`,
    `rooms_permanent ${roomsPermanent}`,
    `rooms_session ${roomsSession}`
  ];
  return lines.join("\n") + "\n";
}