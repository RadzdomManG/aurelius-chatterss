import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { apiCall, getValidAccessToken } from "../../shared/fanvue-api.ts";
import { findCapability } from "../../shared/fanvue-capabilities.ts";

// fanvue-api — generic, registry-backed proxy for the entire Fanvue v1 surface.
// The browser never holds a token. Every call is resolved against the capability
// registry (operationId), scope-checked against the connection's granted scopes,
// and gated: money + destructive ops require an explicit `confirm: true`.
export default async function (req: Request): Promise<Response> {
  let body: any = {};
  try {
    const t = await req.text();
    if (t) body = JSON.parse(t);
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

  const { operationId, params = {}, query = {}, data, confirm = false, creatorProfileId } = body;
  if (!operationId) return Response.json({ error: "Missing operationId" }, { status: 400 });

  const cap = findCapability(operationId);
  if (!cap) return Response.json({ error: "Unknown operation", operationId }, { status: 404 });

  const connections = await base44.entities.FanvueConnection.list("-created_date", 20);
  let connection = connections.find((c: any) => c.status === "connected");
  if (creatorProfileId) {
    connection =
      connections.find((c: any) => c.creator_profile_id === creatorProfileId && c.status === "connected") ||
      connection;
  }
  if (!connection) {
    return Response.json({ error: "No connected Fanvue account", code: "NO_CONNECTION" }, { status: 404 });
  }

  const granted = connection.granted_scopes || [];
  const missing = cap.scopes.filter((s: string) => !granted.includes(s));
  if (missing.length) {
    return Response.json(
      { error: "Permission required", code: "MISSING_SCOPE", missing, granted, required: cap.scopes },
      { status: 403 }
    );
  }

  const needsConfirm = cap.money || cap.method === "DELETE" || /block/i.test(operationId);
  if (needsConfirm && !confirm) {
    return Response.json(
      { error: "Confirmation required", code: "CONFIRM_REQUIRED", operationId, money: cap.money, method: cap.method },
      { status: 409 }
    );
  }

  // Build path with path params substituted.
  let path = cap.path;
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    path = path.replace(`{${k}}`, encodeURIComponent(String(v)));
  }
  const qp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v != null && v !== "") qp.set(k, String(v));
  }
  const fullPath = qp.toString() ? `${path}?${qp.toString()}` : path;

  const options: any = {};
  if (cap.method !== "GET") {
    options.method = cap.method;
    if (data != null) options.body = JSON.stringify(data);
  }

  try {
    const accessToken = await getValidAccessToken(connection, base44);
    let result;
    try {
      result = await apiCall(fullPath, accessToken, options);
    } catch (e) {
      // Empty 204 bodies make res.json() throw — treat as success with no payload.
      if (e instanceof SyntaxError || /JSON|parse|unexpected end/i.test(e.message || "")) {
        result = null;
      } else {
        throw e;
      }
    }
    return Response.json({ operationId, data: result });
  } catch (err: any) {
    const msg = err.message || "Fanvue request failed";
    const scopeErr = /403|Insufficient scopes/i.test(msg);
    return Response.json(
      { error: msg, code: scopeErr ? "MISSING_SCOPE" : "FANVUE_ERROR", operationId },
      { status: scopeErr ? 403 : 502 }
    );
  }
}