import React from "react";
import { base44 } from "@/api/base44Client";
import { useCreator } from "@/lib/creator-context";

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

// Resolves the FanvueConnection for the app-level selected creator (from
// CreatorProvider). Pages that call fanvueCall should pass the returned
// creator.id so the proxy uses the selected creator's connection — not just
// the first connected one it finds.
export function useConnection() {
  const { selectedCreator, selectedConnection, loaded } = useCreator();
  const loading = !loaded;
  const connection = selectedConnection?.status === "connected" ? selectedConnection : null;
  return { connection, creator: selectedCreator, loading };
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