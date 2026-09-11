import React from "react";
import { toast } from "sonner";
import { Megaphone, Trash2, Eye, DollarSign, Users as UsersIcon, Pencil } from "lucide-react";
import { fanvueCall, useConnection, money, fmtDateShort } from "@/lib/fanvue-gateway";
import ScopeGate from "@/components/shared/ScopeGate";
import EmptyState from "@/components/shared/EmptyState";
import MassMessageComposer from "@/components/mass/MassMessageComposer";

const STATUS_STYLES = {
  SENT: "bg-success/15 text-success",
  UNSENT: "bg-muted text-muted-foreground",
  SENDING: "bg-primary/15 text-primary",
  FAILED: "bg-destructive/15 text-destructive",
  MODERATED: "bg-warning/15 text-warning",
  SCHEDULED: "bg-chart-4/15 text-chart-4",
};

export default function MassMessages() {
  const { connection, loading: loadingConn } = useConnection();
  const [messages, setMessages] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [editing, setEditing] = React.useState(null);

  const load = React.useCallback(async () => {
    if (!connection) return;
    try {
      setLoading(true);
      const res = await fanvueCall("listMassMessages_v1_experimental", { query: { size: 50 } });
      setMessages(res?.data?.data || []);
    } catch (e) {
      if (e?.code !== "MISSING_SCOPE") toast.error(e?.error || "Failed to load mass messages");
    } finally {
      setLoading(false);
    }
  }, [connection]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleSend = async (payload) => {
    const recipients = payload.includedLists.smartListIds.join(", ");
    if (!window.confirm(`Send this mass message to: ${recipients || "(none)"}${payload.price ? ` for ${money(payload.price)}` : ""}?`)) return;
    try {
      setSending(true);
      await fanvueCall("sendMassMessage", { data: payload, confirm: true });
      toast.success("Mass message sent");
      await load();
    } catch (e) {
      toast.error(e?.error || "Failed to send mass message");
    } finally {
      setSending(false);
    }
  };

  const handleUpdate = async (payload) => {
    if (!editing) return;
    if (!window.confirm("Update this scheduled mass message?")) return;
    try {
      setSending(true);
      await fanvueCall("updateMassMessage", { params: { messageUuid: editing.uuid }, data: payload, confirm: true });
      toast.success("Mass message updated");
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e?.error || "Failed to update mass message");
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (m) => {
    const isSent = m.status === "SENT";
    const action = isSent ? "unsend" : "cancel";
    if (!window.confirm(`Are you sure you want to ${action} this mass message? This cannot be undone.`)) return;
    try {
      await fanvueCall("deleteMassMessage", { params: { messageUuid: m.uuid }, confirm: true });
      setMessages((prev) => prev.filter((x) => x.uuid !== m.uuid));
      if (editing?.uuid === m.uuid) setEditing(null);
      toast.success(isSent ? "Mass message unsent" : "Mass message cancelled");
    } catch (e) {
      toast.error(e?.error || `Failed to ${action}`);
    }
  };

  if (loadingConn) {
    return <div className="flex h-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" /></div>;
  }
  if (!connection) {
    return <div className="h-full p-8"><EmptyState icon={Megaphone} title="Connect Fanvue" description="Connect a Fanvue creator account to send mass messages." actionLabel="Go to Models" actionTo="/models" /></div>;
  }
  if (!(connection.granted_scopes || []).includes("write:chat")) {
    return <div className="h-full p-8"><ScopeGate missing={["write:chat"]} /></div>;
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="mb-1 font-heading text-3xl text-foreground">Mass Messages</h1>
        <p className="mb-6 text-sm text-muted-foreground">Broadcast PPV and free messages to fan segments</p>

        <div className="mb-8">
          {editing ? (
            <MassMessageComposer editMode initial={editing} onUpdate={handleUpdate} sending={sending} onCancelEdit={() => setEditing(null)} />
          ) : (
            <MassMessageComposer onSend={handleSend} sending={sending} />
          )}
        </div>

        <h2 className="mb-3 text-sm font-medium text-foreground">Sent & Scheduled</h2>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />)}</div>
        ) : messages.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">No mass messages yet.</div>
        ) : (
          <div className="space-y-2">
            {messages.map((m) => (
              <div key={m.uuid} className={`rounded-lg border bg-card p-4 ${editing?.uuid === m.uuid ? "border-primary ring-1 ring-primary/30" : "border-border"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[m.status] || "bg-muted text-muted-foreground"}`}>{m.status}</span>
                      {m.price ? <span className="inline-flex items-center gap-1 text-xs text-success"><DollarSign className="h-3 w-3" />{money(m.price)}</span> : null}
                      <span className="text-xs text-muted-foreground">{fmtDateShort(m.publishedAt || m.scheduledAt || m.createdAt)}</span>
                    </div>
                    <p className="line-clamp-2 text-sm text-foreground">{m.text || "[media only]"}</p>
                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><UsersIcon className="h-3 w-3" />{m.recipientCount ?? 0} recipients</span>
                      <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{m.viewCount ?? 0} views</span>
                      <span className="inline-flex items-center gap-1"><DollarSign className="h-3 w-3" />{money(m.totalRevenue)} revenue</span>
                      <span>{m.purchaseCount ?? 0} purchases</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {m.status === "SCHEDULED" && (
                      <button
                        onClick={() => setEditing(m)}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-primary"
                        title="Edit scheduled message"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(m)}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
                      title={m.status === "SENT" ? "Unsend" : "Cancel"}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}