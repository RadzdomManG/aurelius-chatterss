import React from "react";
import { toast } from "sonner";
import { Webhook, Trash2, Plus, FlaskConical } from "lucide-react";
import { fanvueCall, useConnection, fmtDate } from "@/lib/fanvue-gateway";
import ScopeGate from "@/components/shared/ScopeGate";
import EmptyState from "@/components/shared/EmptyState";

const PUBLISHED_WEBHOOK_URL = "https://aurelius-chat-core.base44.app/functions/fanvue-webhook";

const EVENTS = [
  "creator.message.received",
  "creator.message.sent",
  "creator.message.mass_sent",
  "creator.message.read",
  "creator.message.read_by_fan",
  "creator.follow.created",
  "creator.post.liked",
  "creator.post.commented",
  "creator.subscription.activated",
  "creator.subscription.renewed",
  "creator.subscription.deactivated",
  "creator.payment.succeeded",
  "creator.refund.created",
  "creator.fan.status_changed",
  "creator.fan.presence_changed",
  "message.received",
  "subscription.new",
  "subscription.renewed",
  "subscription.cancelled",
  "tip.new",
  "purchase.new",
  "follow.new",
];

export default function Webhooks() {
  const { connection, loading: loadingConn } = useConnection();
  const [subs, setSubs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [url, setUrl] = React.useState(PUBLISHED_WEBHOOK_URL);
  const [selected, setSelected] = React.useState(["creator.message.received"]);
  const [testEvent, setTestEvent] = React.useState("creator.message.received");
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!connection) return;
    try {
      setLoading(true);
      const res = await fanvueCall("listWebhookSubscriptions");
      setSubs(res?.data?.data || []);
    } catch (e) {
      if (e?.code !== "MISSING_SCOPE") toast.error(e?.error || "Failed to load webhooks");
    } finally {
      setLoading(false);
    }
  }, [connection]);

  React.useEffect(() => { load(); }, [load]);

  const toggleEvent = (ev) => setSelected((prev) => (prev.includes(ev) ? prev.filter((x) => x !== ev) : [...prev, ev]));

  const create = async () => {
    if (!url || selected.length === 0) return;
    try {
      setSaving(true);
      await fanvueCall("createWebhookSubscription", { data: { url, events: selected } });
      toast.success("Webhook subscription created");
      await load();
    } catch (e) { toast.error(e?.error || "Failed"); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this webhook subscription?")) return;
    try {
      await fanvueCall("deleteWebhookSubscription", { params: { id }, confirm: true });
      setSubs((prev) => prev.filter((s) => s.id !== id));
      toast.success("Deleted");
    } catch (e) { toast.error(e?.error || "Failed"); }
  };

  const sendTest = async () => {
    try {
      setTesting(true);
      await fanvueCall("sendTestWebhook", { data: { event: testEvent } });
      toast.success("Test webhook dispatched — check Diagnostics for the delivery");
    } catch (e) { toast.error(e?.error || "Failed"); }
    finally { setTesting(false); }
  };

  if (loadingConn) return <div className="flex h-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" /></div>;
  if (!connection) return <div className="h-full p-8"><EmptyState icon={Webhook} title="Connect Fanvue" description="Connect a Fanvue account to manage webhook subscriptions." actionLabel="Go to Models" actionTo="/models" /></div>;
  if (!(connection.granted_scopes || []).includes("read:self")) return <div className="h-full p-8"><ScopeGate missing={["read:self"]} /></div>;

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-1 font-heading text-3xl text-foreground">Webhooks</h1>
        <p className="mb-6 text-sm text-muted-foreground">Register webhook subscriptions and dispatch test events</p>

        <div className="mb-6 rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-medium text-foreground">Create subscription</h3>
          <input value={url} onChange={(e) => setUrl(e.target.value)} className="mb-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" />
          <p className="mb-1.5 text-xs text-muted-foreground">Events</p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {EVENTS.map((ev) => (
              <button
                key={ev}
                type="button"
                onClick={() => toggleEvent(ev)}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${selected.includes(ev) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
              >
                {ev}
              </button>
            ))}
          </div>
          <button onClick={create} disabled={saving || selected.length === 0} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90">
            <Plus className="h-4 w-4" /> Create subscription
          </button>
        </div>

        <div className="mb-6 rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground"><FlaskConical className="h-4 w-4 text-primary" /> Send test event</h3>
          <div className="flex gap-2">
            <select value={testEvent} onChange={(e) => setTestEvent(e.target.value)} className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground">
              {EVENTS.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
            </select>
            <button onClick={sendTest} disabled={testing} className="rounded-md border border-border px-4 py-1.5 text-sm text-foreground hover:bg-accent disabled:opacity-50">Send test</button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Test deliveries appear in Diagnostics. Signed live events are auto-processed.</p>
        </div>

        <h2 className="mb-3 text-sm font-medium text-foreground">Active subscriptions</h2>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />)}</div>
        ) : subs.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">No subscriptions yet.</div>
        ) : (
          <div className="space-y-2">
            {subs.map((s) => (
              <div key={s.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{s.url}</p>
                    <p className="text-xs text-muted-foreground">Created {fmtDate(s.createdAt)}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(s.events || []).slice(0, 8).map((ev) => <span key={ev} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{ev}</span>)}
                      {(s.events || []).length > 8 && <span className="text-xs text-muted-foreground">+{s.events.length - 8} more</span>}
                    </div>
                  </div>
                  <button onClick={() => remove(s.id)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}