export const OPERATIONS_VERSION = "A7.1";

export function operationId(headers) {
  const incoming = headers?.get?.("x-request-id") || "";
  if (/^[A-Za-z0-9._:-]{8,128}$/.test(incoming)) return incoming;
  return crypto.randomUUID();
}

export function classifyStatus(status) {
  const code = Number(status || 0);
  if (code === 0) return "network";
  if (code === 401) return "authentication";
  if (code === 403) return "authorization";
  if (code === 429) return "rate_limit";
  if (code >= 500) return "service";
  if (code >= 400) return "request";
  return "unknown";
}

export function responseHeaders(corsHeaders, requestId) {
  return {
    ...corsHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    "X-Request-ID": requestId,
  };
}

export function logOperationalEvent(event, fields = {}) {
  const allowed = [
    "request_id",
    "service",
    "category",
    "http_status",
    "duration_ms",
    "action",
    "board_key",
    "duplicate",
  ];
  const payload = { event, operations_version: OPERATIONS_VERSION };
  for (const key of allowed) {
    const value = fields[key];
    if (value !== undefined && value !== null) payload[key] = value;
  }
  const line = JSON.stringify(payload);
  if (fields.category === "service" || String(event).endsWith(".failure")) console.error(line);
  else console.info(line);
}
