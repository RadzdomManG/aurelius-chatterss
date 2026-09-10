import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Plus, Zap, Trash2, Send, DollarSign, Pause, Tag, Bell } from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";

const TRIGGERS = [
  { id: "new_subscriber", label: "New Subscriber", description: "When a fan subscribes" },
  { id: "first_message", label: "First Message", description: "When a fan sends their first message" },
  { id: "new_message", label: "New Message", description: "When any fan sends a message" },
  { id: "high_spender", label: "High Spender", description: "When a fan spends over $50" },
  { id: "inactive_fan", label: "Inactive Fan", description: "When a fan hasn't messaged in 7 days" },
];

const ACTIONS = [
  { id: "send_message", label: "Send Message", icon: Send },
  { id: "send_ppv", label: "Send PPV", icon: DollarSign },
  { id: "pause_ai", label: "Pause AI", icon: Pause },
  { id: "tag_fan", label: "Tag Fan", icon: Tag },
  { id: "notify", label: "Notify", icon: Bell },
];

export default function RulesManager() {
  const [creators, setCreators] = React.useState([]);
  const [rules, setRules] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);
  const [form, setForm] = React.useState({
    creatorId: "",
    name: "",
    trigger: "new_subscriber",
    actionType: "send_message",
    messageText: "",
    ppvCents: 0,
  });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [creatorList, ruleList] = await Promise.all([
        base44.entities.CreatorProfile.list("-created_date", 50),
        base44.entities.Rule.list("-created_date", 100),
      ]);
      setCreators(creatorList);
      setRules(ruleList);
      if (creatorList[0]) setForm((f) => ({ ...f, creatorId: creatorList[0].id }));
    } catch (err) {
      toast.error("Failed to load rules");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim() || !form.creatorId) return;
    try {
      setSaving(true);
      const actionPayload = {};
      if (form.actionType === "send_message" || form.actionType === "send_ppv") {
        actionPayload.text = form.messageText;
        if (form.actionType === "send_ppv") actionPayload.ppv_cents = form.ppvCents;
      }

      await base44.entities.Rule.create({
        creator_profile_id: form.creatorId,
        name: form.name,
        trigger: form.trigger,
        action_type: form.actionType,
        action_payload: actionPayload,
        enabled: true,
      });
      toast.success("Rule created");
      setForm({ ...form, name: "", messageText: "", ppvCents: 0 });
      setShowCreate(false);
      loadData();
    } catch (err) {
      toast.error("Failed to create rule");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (rule) => {
    try {
      await base44.entities.Rule.update(rule.id, { enabled: !rule.enabled });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)));
    } catch (err) {
      toast.error("Failed to toggle rule");
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this rule?")) return;
    try {
      await base44.entities.Rule.delete(id);
      toast.success("Rule deleted");
      loadData();
    } catch (err) {
      toast.error("Failed to delete rule");
    }
  };

  const creatorName = (id) => creators.find((c) => c.id === id)?.display_name || "Unknown";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Automate responses based on fan behavior triggers</p>
        <button onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> New Rule
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground"><Zap className="h-4 w-4 text-primary" /> Create Automation Rule</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Rule Name</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Welcome new subscribers" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Creator</label>
                <select value={form.creatorId} onChange={(e) => setForm({ ...form, creatorId: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {creators.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">Trigger</label>
              <div className="grid grid-cols-3 gap-2">
                {TRIGGERS.map((t) => (
                  <button key={t.id} onClick={() => setForm({ ...form, trigger: t.id })}
                    className={`rounded-md border p-2.5 text-left ${form.trigger === t.id ? "border-primary bg-primary/10" : "border-border hover:bg-accent"}`}>
                    <p className="text-sm font-medium text-foreground">{t.label}</p>
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">Action</label>
              <div className="flex flex-wrap gap-2">
                {ACTIONS.map((a) => {
                  const Icon = a.icon;
                  return (
                    <button key={a.id} onClick={() => setForm({ ...form, actionType: a.id })}
                      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${form.actionType === a.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"}`}>
                      <Icon className="h-3.5 w-3.5" /> {a.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {(form.actionType === "send_message" || form.actionType === "send_ppv") && (
              <>
                <div>
                  <label className="mb-1.5 block text-xs text-muted-foreground">Message Text</label>
                  <textarea value={form.messageText} onChange={(e) => setForm({ ...form, messageText: e.target.value })} rows={3}
                    placeholder="Message to send when trigger fires..." className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                </div>
                {form.actionType === "send_ppv" && (
                  <div>
                    <label className="mb-1.5 block text-xs text-muted-foreground">PPV Price (cents)</label>
                    <input type="number" value={form.ppvCents} onChange={(e) => setForm({ ...form, ppvCents: parseInt(e.target.value) || 0 })}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                  </div>
                )}
              </>
            )}

            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={saving || !form.name.trim()}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {saving ? "Creating..." : "Create Rule"}
              </button>
              <button onClick={() => setShowCreate(false)} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rules list */}
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />)}</div>
      ) : rules.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-4 py-12 text-center">
          <Zap className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No automation rules yet. Create one to automate responses.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => {
            const trigger = TRIGGERS.find((t) => t.id === rule.trigger);
            const action = ACTIONS.find((a) => a.id === rule.action_type);
            const ActionIcon = action?.icon || Zap;
            return (
              <div key={rule.id} className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                  <ActionIcon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{rule.name}</p>
                    <StatusBadge variant={rule.enabled ? "success" : "neutral"} label={rule.enabled ? "Active" : "Disabled"} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {creatorName(rule.creator_profile_id)} · {trigger?.label || rule.trigger} → {action?.label || rule.action_type}
                  </p>
                  {rule.action_payload?.text && <p className="mt-1 text-xs text-muted-foreground">"{rule.action_payload.text}"</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleToggle(rule)}
                    className={`relative h-5 w-9 rounded-full transition-colors ${rule.enabled ? "bg-primary" : "bg-muted"}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${rule.enabled ? "translate-x-4" : "translate-x-0.5"}`} />
                  </button>
                  <button onClick={() => handleDelete(rule.id)} className="rounded-md p-1.5 text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}