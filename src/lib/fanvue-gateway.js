import React from "react";
import { base44 } from "@/api/base44Client";

// fanvue-gateway — single frontend entry to the registry-backed fanvue-api proxy.
// `fanvueCall(operationId, opts)` returns { operationId, data } or throws an object
// with { error, code, missing? } so pages can scope-gate and confirm.
export async function fanvueCall(operationId, opts = {}) {
  const { params, query, data, confirm, creatorProfileId } = opts;
  try {
    return await base44.functions.invoke("fanvue-api", {
      operationId,
      params,
      query,
      data,
      confirm: !!confirm,
      creatorProfileId,
    });
  } catch (e) {
    const d = e?.response?.data || e;
    throw d;
  }
}

export function useConnection() {
  const [state, setState] = React.useState({ connection: null, creator: null, loading: true });
  React.useEffect(() => {
    (async () => {
      try {
        const [conns, creators] = await Promise.all([
          base44.entities.FanvueConnection.list("-created_date", 20),
          base44.entities.CreatorProfile.list("-created_date", 10),
        ]);
        const connection = conns.find((c) => c.status === "connected") || null;
        const creator = connection
          ? creators.find((c) => c.id === connection.creator_profile_id) || creators[0]
          : creators[0] || null;
        setState({ connection, creator, loading: false });
      } catch (e) {
        setState({ connection: null, creator: null, loading: false });
      }
    })();
  }, []);
  return state;
}

export function hasScope(connection, scope) {
  return (connection?.granted_scopes || []).includes(scope);
}

export function hasScopes(connection, scopes = []) {
  return scopes.every((s) => (connection?.granted_scopes || []).includes(s));
}

export const money = (cents) => (cents ? `$${(cents / 100).toFixed(2)}` : "$0.00");
export const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" });
};
export const fmtDateShort = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};