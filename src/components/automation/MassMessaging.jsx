import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Send, Users, DollarSign, Clock, Plus, Trash2 } from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";

const AUDIENCES = [
  { id: "all", label: "All Fans", icon: Users },
  { id: "subscribers", label: "Active Subscribers", icon: Users },
  { id: "top_spenders", label: "Top Spenders", icon: DollarSign },
];

export default function MassMessaging({ creator }) {
  const [creators, setCreators] = React.useState([]);
  const [fanCounts, setFanCounts] = React.useState({});
  const [messages, setMessages] = React.useState([]);
  const [form, setForm] = React.useState({
    creatorId: "",
    text: "",
    audience: "all",
    ppvCents: 0,
    scheduledFor: "",
  });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [creatorList, fanList, schedList] = await Promise.all([
        base44.entities.CreatorProfile.list("-created_date", 50),
        base44.entities.Fan.list("-created_date", 500),
        base44.entities.ScheduledAction.filter({ action_type: "mass_message" }, "-scheduled_for", 50),
      ]);
      setCreators(creatorList);
      setMessages(schedList);

      const counts = {};
      for (const c of creatorList) {
        const fans = fanList.filter((f) => f.creator_profile_id === c.id);
        counts[c.id] = {
          all: fans.length,
          subscribers: fans.filter((f) => f.subscription_status === "active").length,
          top_spenders: fans.filter((f) => (f.total_spent_cents || 0) > 1000).length,
        };
      }
      setFanCounts(counts);
      if (creatorList[0]) setForm((f) => ({ ...f, creatorId: creatorList[0].id }));
    } catch (err) {
      toast.error("Failed to load data");
    }
  };

  const handleCreate = async () => {
    if (!form.text.trim() || !form.creatorId) return;
    try {
      setSaving(true);
      const scheduledFor = form.scheduledFor || new Date().toISOString();
      await base44.entities.ScheduledAction.create({
        creator_profile_id: form.creatorId,
        action_type: "mass_message",
        payload: {
          text: form.text,
          audience: form.audience,
          ppv_cents: form.ppvCents || null,
        },
        scheduled_for: scheduledFor,
        status: "pending",
      });
      await base44.entities.ActivityLog.create({
        creator_profile_id: form.creatorId,
        event_type: "mass_message.scheduled",
        status: "info",
        message: `Mass message scheduled for ${form.audience} audience`,
      });
      toast.success("Mass message scheduled");
      setForm({ ...form, text: "", ppvCents: 0, scheduledFor: "" });
      loadData();
    } catch (err) {
      toast.error("Failed to schedule mass message");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (id) => {
    try {
      await base44.entities.ScheduledAction.update(id, { status: "cancelled" });
      toast.success("Mass message cancelled");
      loadData();
    } catch (err) {
      toast.error("Failed to cancel");
    }
  };

  const currentCount = fanCounts[form.creatorId]?.[form.audience] || 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Compose */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
          <Send className="h-4 w-4 text-primary" /> New Mass Message
        </h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">Creator</label>
            <select value={form.creatorId} onChange={(e) => setForm({ ...form, creatorId: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {creators.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">Audience ({currentCount} fans)</label>
            <div className="flex gap-2">
              {AUDIENCES.map((a) => {
                const Icon = a.icon;
                return (
                  <button key={a.id} onClick={() => setForm({ ...form, audience: a.id })}
                    className={`flex flex-1 items-center gap-2 rounded-md border px-3 py-2 text-sm ${form.audience === a.id ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-accent"}`}>
                    <Icon className="h-3.5 w-3.5" /> {a.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">Message</label>
            <textarea value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} rows={4}
              placeholder="Type your mass message here..." className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">PPV Price (cents, 0 = free)</label>
              <input type="number" value={form.ppvCents} onChange={(e) => setForm({ ...form, ppvCents: parseInt(e.target.value) || 0 })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">Schedule (leave empty for now)</label>
              <input type="datetime-local" value={form.scheduledFor} onChange={(e) => setForm({ ...form, scheduledFor: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
          </div>

          <button onClick={handleCreate} disabled={saving || !form.text.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <Plus className="h-4 w-4" /> {saving ? "Scheduling..." : "Schedule Mass Message"}
          </button>
        </div>
      </div>

      {/* Existing mass messages */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-foreground">Scheduled Mass Messages</h3>
        {messages.length === 0 ? (
          <p className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">No mass messages scheduled</p>
        ) : (
          <div className="space-y-2">
            {messages.map((msg) => (
              <div key={msg.id} className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <StatusBadge variant={msg.status === "pending" ? "info" : msg.status === "sent" ? "success" : msg.status === "cancelled" ? "neutral" : "error"} label={msg.status} />
                    <span className="text-xs text-muted-foreground">{msg.payload?.audience || "all"}</span>
                    {msg.payload?.ppv_cents > 0 && <span className="text-xs text-success">${(msg.payload.ppv_cents / 100).toFixed(2)} PPV</span>}
                  </div>
                  <p className="mt-1 text-sm text-foreground">{msg.payload?.text}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(msg.scheduled_for).toLocaleString()}</p>
                </div>
                {msg.status === "pending" && (
                  <button onClick={() => handleCancel(msg.id)} className="rounded-md p-1.5 text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}