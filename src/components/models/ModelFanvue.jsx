import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { RefreshCw, Trash2, ShieldCheck, ShieldAlert, KeyRound } from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";

export default function ModelFanvue({ creator, connection, onSaved }) {
  const [acting, setActing] = React.useState(false);

  const handleReconnect = async () => {
    try {
      setActing(true);
      const res = await base44.functions.invoke("fanvue-auth", { action: "initiate" });
      if (res.data?.authUrl) window.location.href = res.data.authUrl;
    } catch (err) {
      toast.error("Fanvue OAuth requires backend function (Builder+ plan)");
    } finally {
      setActing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connection?.id) return;
    if (!confirm("Disconnect this Fanvue account? Automation will stop.")) return;
    try {
      setActing(true);
      await base44.entities.FanvueConnection.update(connection.id, { status: "disconnected" });
      toast.success("Fanvue disconnected");
      onSaved();
    } catch (err) {
      toast.error("Failed to disconnect");
    } finally {
      setActing(false);
    }
  };

  const tokenExpiringSoon = connection?.access_token_expires_at &&
    new Date(connection.access_token_expires_at).getTime() < Date.now() + 3600000;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <KeyRound className="h-4 w-4 text-primary" /> Connection Status
          </h3>
          <StatusBadge
            variant={connection?.status === "connected" ? "success" : connection?.status === "error" ? "error" : "neutral"}
            label={connection?.status || "disconnected"}
          />
        </div>
        <div className="space-y-2 text-sm">
          <Row label="Fanvue Creator" value={creator.display_name} />
          <Row label="Username" value={`@${creator.username || "—"}`} />
          <Row label="Fanvue UUID" value={connection?.external_user_uuid || "—"} mono />
          <Row label="Token Expires" value={connection?.access_token_expires_at ? new Date(connection.access_token_expires_at).toLocaleString() : "—"} />
          <Row label="Last Health Check" value={connection?.last_health_check_at ? new Date(connection.last_health_check_at).toLocaleString() : "Never"} />
          <Row label="Last Sync" value={connection?.last_sync_at ? new Date(connection.last_sync_at).toLocaleString() : "Never"} />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-3 text-sm font-medium text-foreground">Granted Scopes</h3>
        {connection?.granted_scopes?.length ? (
          <div className="flex flex-wrap gap-2">
            {connection.granted_scopes.map((scope) => (
              <span key={scope} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                <ShieldCheck className="h-3 w-3 text-success" /> {scope}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No scopes granted</p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-3 text-sm font-medium text-foreground">Token Security</h3>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-success" />
          <span>Access and refresh tokens are encrypted and stored server-side only.</span>
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4 text-warning" />
          <span>Never exposed to browser JavaScript.</span>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={handleReconnect} disabled={acting}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          <RefreshCw className="h-4 w-4" /> Reconnect Fanvue
        </button>
        {connection?.id && (
          <button onClick={handleDisconnect} disabled={acting}
            className="inline-flex items-center gap-2 rounded-md border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/5 disabled:opacity-50">
            <Trash2 className="h-4 w-4" /> Disconnect
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs text-foreground" : "text-foreground"}>{value}</span>
    </div>
  );
}