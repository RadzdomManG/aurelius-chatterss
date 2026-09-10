import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { apiCall, getValidAccessToken } from "../../shared/fanvue-api.ts";

// fanvue-insights — proxies the real Fanvue v1 Insights endpoints (read:insights).
// All self-scoped insight operations are routed here so the browser never holds
// a Fanvue token. Returns real Fanvue data; surfaces scope/permission failures
// as a structured 403 the UI can gate on.

type Resource =
  | "summary"
  | "earnings"
  | "percentile"
  | "retention"
  | "unsubscribe"
  | "spending"
  | "subscribers"
  | "topSpenders"
  | "fan";

const PATHS: Record<Resource, (p: any) => string> = {
  summary: () => "/v1/insights/earnings/summary",
  earnings: () => "/v1/insights/earnings",
  percentile: () => "/v1/insights/earnings/percentile",
  retention: () => "/v1/insights/fan-retention-summary",
  unsubscribe: () => "/v1/insights/unsubscribe-reasons",
  spending: () => "/v1/insights/spending",
  subscribers: () => "/v1/insights/subscribers",
  topSpenders: () => "/v1/insights/top-spenders",
  fan: (p) => `/v1/insights/fans/${encodeURIComponent(p.userUuid)}`,
};

// Which query params each resource accepts (all are v1 cursor + `size` for lists).
const PARAMS: Record<Resource, string[]> = {
  summary: ["startDate", "endDate", "granularity", "timezone"],
  earnings: ["startDate", "endDate", "source", "cursor", "size"],
  percentile: [],
  retention: ["periods"],
  unsubscribe: ["periodStart"],
  spending: ["startDate", "endDate", "source", "fanUuid", "cursor", "size"],
  subscribers: ["startDate", "endDate", "cursor", "size"],
  topSpenders: ["startDate", "endDate", "cursor", "size"],
  fan: [],
};

function buildQuery(resource: Resource, p: any): string {
  const allowed = PARAMS[resource];
  const params = new URLSearchParams();
  for (const key of allowed) {
    if (p[key] != null && p[key] !== "") params.set(key, String(p[key]));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export default async function (req: Request): Promise<Response> {
  let body: any = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch (e) {
    body = {};
  }

  const base44 = createClientFromRequest(req);

  let user;
  try {
    user = await base44.auth.me();
  } catch (e) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const resource = body.resource as Resource;
  if (!resource || !PATHS[resource]) {
    return Response.json({ error: "Invalid or missing 'resource'" }, { status: 400 });
  }

  // Resolve the active Fanvue connection (optionally for a specific creator profile).
  const connections = await base44.entities.FanvueConnection.list("-created_date", 20);
  let connection = connections.find((c: any) => c.status === "connected");
  if (body.creatorProfileId) {
    connection =
      connections.find((c: any) => c.creator_profile_id === body.creatorProfileId && c.status === "connected") ||
      connection;
  }
  if (!connection) {
    return Response.json({ error: "No connected Fanvue account", code: "NO_CONNECTION" }, { status: 404 });
  }

  // Scope gate: read:insights (fan insights also needs read:fan).
  const required = ["read:insights", ...(resource === "fan" ? ["read:fan"] : [])];
  const granted = connection.granted_scopes || [];
  const missing = required.filter((s) => !granted.includes(s));
  if (missing.length) {
    return Response.json(
      { error: "Permission required", code: "MISSING_SCOPE", missing, granted },
      { status: 403 }
    );
  }

  const accessToken = await getValidAccessToken(connection, base44);
  const path = PATHS[resource](body) + buildQuery(resource, body);

  try {
    const data = await apiCall(path, accessToken);
    return Response.json({ resource, data });
  } catch (err: any) {
    const msg = err.message || "Fanvue insights request failed";
    const scopeErr = /Insufficient scopes|403/.test(msg);
    return Response.json(
      { error: msg, code: scopeErr ? "MISSING_SCOPE" : "FANVUE_ERROR" },
      { status: scopeErr ? 403 : 502 }
    );
  }
}