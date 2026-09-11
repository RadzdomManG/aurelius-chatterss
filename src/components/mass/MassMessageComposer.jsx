import React from "react";
import { Send, Loader2, Pencil } from "lucide-react";

export const SMART_LISTS = [
  { id: "subscribers", label: "Subscribers" },
  { id: "auto_renewing", label: "Auto-renewing" },
  { id: "non_renewing", label: "Non-renewing" },
  { id: "followers", label: "Followers" },
  { id: "free_trial_subscribers", label: "Free-trial subscribers" },
  { id: "expired_subscribers", label: "Expired subscribers" },
  { id: "spent_more_than_50", label: "Spent > $50" },
  { id: "muted", label: "Muted" },
];

const MIN_PPV_CENTS = 300;

function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function MassMessageComposer({ onSend, onUpdate, sending, editMode = false, initial = null, onCancelEdit }) {
  const [text, setText] = React.useState("");
  const [priceCents, setPriceCents] = React.useState(0);
  const [include, setInclude] = React.useState(["subscribers"]);
  const [exclude, setExclude] = React.useState([]);
  const [scheduledAt, setScheduledAt] = React.useState("");

  React.useEffect(() => {
    if (editMode && initial) {
      setText(initial.text || "");
      setPriceCents(initial.price || 0);
      setInclude(initial.includedLists?.smartListIds?.length ? initial.includedLists.smartListIds : ["subscribers"]);
      setExclude(initial.excludedLists?.smartListIds || []);
      setScheduledAt(toLocalInput(initial.scheduledAt));
    }
  }, [editMode, initial]);

  const toggle = (list, setList, id) => {
    setList((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const valid = text.trim().length > 0 && include.length > 0 && (priceCents === 0 || priceCents >= MIN_PPV_CENTS);

  const submit = () => {
    if (!valid) return;
    const payload = {
      text: text.trim(),
      price: priceCents > 0 ? priceCents : null,
      includedLists: { smartListIds: include, customListUuids: [] },
      excludedLists: { smartListIds: exclude, customListUuids: [] },
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    };
    if (editMode && onUpdate) {
      onUpdate(payload);
    } else if (onSend) {
      onSend(payload);
      setText("");
      setPriceCents(0);
      setInclude(["subscribers"]);
      setExclude([]);
      setScheduledAt("");
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">
          {editMode ? <span className="inline-flex items-center gap-2"><Pencil className="h-4 w-4 text-primary" /> Edit Scheduled Mass Message</span> : "New Mass Message"}
        </h3>
        {editMode && onCancelEdit && (
          <button onClick={onCancelEdit} className="text-xs text-muted-foreground hover:text-foreground">Cancel edit</button>
        )}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Message text…"
        rows={4}
        className="mb-3 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          PPV (cents)
          <input
            type="number"
            min={0}
            step={100}
            value={priceCents}
            onChange={(e) => setPriceCents(Math.max(0, Number(e.target.value)))}
            className="w-28 rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
          />
        </label>
        {priceCents > 0 && priceCents < MIN_PPV_CENTS && (
          <span className="text-xs text-destructive">Minimum $3.00 (300 cents)</span>
        )}
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          {editMode ? "Reschedule" : "Schedule"}
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
          />
        </label>
      </div>
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Include</p>
          <div className="flex flex-wrap gap-1.5">
            {SMART_LISTS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => toggle(include, setInclude, l.id)}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                  include.includes(l.id)
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Exclude</p>
          <div className="flex flex-wrap gap-1.5">
            {SMART_LISTS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => toggle(exclude, setExclude, l.id)}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                  exclude.includes(l.id)
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button
        onClick={submit}
        disabled={!valid || sending}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90"
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : editMode ? <Pencil className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        {editMode ? "Update Message" : scheduledAt ? "Schedule" : "Send to all"}
      </button>
    </div>
  );
}