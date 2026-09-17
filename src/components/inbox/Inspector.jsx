import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { User, Brain, Pencil, Check, X, Sparkles } from "lucide-react";
import PpvCooldownCard from "@/components/inbox/PpvCooldownCard";
import ConversationControls from "@/components/inbox/ConversationControls";

const TABS = [
  { key: "insights", label: "Fan Insights", icon: User },
  { key: "templates", label: "Templates", icon: Sparkles },
];

const NOTE_FILTERS = ["All", "Manual", "AI", "Favourites"];
const MEMORY_CONFIDENCE_THRESHOLD = 0.7;

// Trivial memory keys we never surface even above threshold
const TRIVIAL_KEYS = /^(hi|hello|hey|greeting|mood|reaction|topic|temp|misc)$/i;

const QUICK_TEMPLATES = [
  "hey babe, missed you today… how was your morning?",
  "i was just thinking about you 🙈 what are you up to?",
  "you up? can't sleep and you crossed my mind",
  "tell me something i don't know about you yet…",
  "i made something earlier i kind of want to show you 🙈",
];

function money(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function fmtDate(d) {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "-";
  }
}

function relativeAge(d) {
  if (!d) return "-";
  const ms = Date.now() - new Date(d).getTime();
  const days = Math.floor(ms / 86400000);
  if (days <= 0) return "today";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo ago`;
  const years = Math.floor(months / 12);
  return `${years} yr ago`;
}

export default function Inspector({ fan, memories, conversation, creator, aiState }) {
  const [tab, setTab] = React.useState("insights");

  return (
    <div className="hidden h-full w-80 shrink-0 flex-col border-l border-border bg-card xl:flex">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <h3 className="font-heading text-lg text-foreground">Inspector</h3>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-border px-4">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-1 py-2.5 text-xs font-medium transition-colors ${
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {tab === "insights" && <FanInsights fan={fan} memories={memories} conversation={conversation} creatorId={creator?.id} />}
        {tab === "templates" && <TemplatesTab />}
      </div>
    </div>
  );
}

function FanInsights({ fan, memories, conversation, creatorId }) {
  if (!fan) {
    return <EmptyInspector text="Select a conversation to view fan insights" />;
  }
  return (
    <div className="space-y-4 p-4">
      {/* Identity */}
      <div className="flex flex-col items-center text-center">
        {fan.avatar_url ? (
          <img src={fan.avatar_url} alt="" className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-lg font-medium text-primary">
            {fan.display_name?.charAt(0) || "?"}
          </div>
        )}
        <h4 className="mt-2 font-medium text-foreground">{fan.display_name}</h4>
        <p className="text-sm text-muted-foreground">@{fan.handle || "unknown"}</p>
      </div>

      <SpendingBehavior fan={fan} />
      <SubscriptionCard fan={fan} />
      <PpvCooldownCard conversation={conversation} creatorProfileId={creatorId} />
      <ConversationControls fan={fan} conversation={conversation} />
      <NicknameField fan={fan} />
      <NotesField fan={fan} />
      <MemoryList memories={memories} />
    </div>
  );
}

function SpendingBehavior({ fan }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  const fanId = fan?.id;

  React.useEffect(() => {
    if (!fanId) return;
    let active = true;
    setLoading(true);
    setError(null);
    base44.functions
      .invoke("fan-spending", { fanId })
      .then((res) => {
        if (!active) return;
        const d = res?.data || res;
        if (d?.error) setError(d.error);
        else setData(d);
      })
      .catch((e) => {
        if (!active) return;
        setError(e?.message || "Failed to load spending");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fanId]);

  if (loading) {
    return (
      <Card title="Spending behavior">
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card title="Spending behavior">
        <p className="text-xs text-muted-foreground">Unable to load Fanvue spending data.</p>
      </Card>
    );
  }

  const d = data || {};
  const total = money(d.totalSpentCents);
  const last = d.lastSpend;
  const ppv = d.totalPpv || {};
  const tip = d.totalTip || {};
  const top = d.topPurchase;

  return (
    <Card title="Spending behavior">
      {/* Two stat boxes */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <StatBox label="Total spent" value={total} sub={d.sinceDate ? `Since ${fmtDate(d.sinceDate)}` : "—"} />
        <StatBox
          label="Last purchase"
          value={last ? money(last.amountCents) : (d.lastPurchaseAt ? fmtDate(d.lastPurchaseAt) : "—")}
          sub={last ? `${last.type.toUpperCase()} · ${relativeAge(last.at)}` : (d.lastPurchaseAt ? relativeAge(d.lastPurchaseAt) : "—")}
        />
      </div>

      {/* Details list */}
      <div className="space-y-1.5">
        <DetailLine
          label="Total PPV"
          value={money(ppv.sumCents)}
          sub={ppv.count ? `${money(ppv.avgCents)} avg` : "—"}
        />
        <DetailLine
          label="Total Tip"
          value={money(tip.sumCents)}
          sub={tip.count ? `${money(tip.avgCents)} avg` : "—"}
        />
        <DetailLine
          label="Top purchase"
          value={top ? money(top.amountCents) : "$0.00"}
          sub={top ? (top.at ? `${top.type.toUpperCase()} · ${fmtDate(top.at)}` : top.type.toUpperCase()) : "—"}
        />
      </div>
    </Card>
  );
}

function SubscriptionCard({ fan }) {
  // Subscription details come from Fan.spending fetch in SpendingBehavior, but
  // we show what we have from the fan record here to avoid a second call. The
  // spending card above carries the full subscription breakdown when available.
  const status = fan?.subscription_status || "Unknown";
  return (
    <Card title="Subscription">
      <div className="space-y-1.5">
        <DetailLine
          label="Fan type"
          value={
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {status}
            </span>
          }
        />
        <DetailLine label="Total spent" value={money(fan?.total_spent_cents)} />
        <DetailLine label="AI paused" value={fan?.automation_paused ? "Yes" : "No"} />
      </div>
    </Card>
  );
}

function NicknameField({ fan }) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(fan?.nickname || fan?.display_name || "");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setValue(fan?.nickname || fan?.display_name || "");
  }, [fan?.id, fan?.nickname, fan?.display_name]);

  const save = async () => {
    try {
      setSaving(true);
      await base44.entities.Fan.update(fan.id, { nickname: value.trim() });
      toast.success("Nickname saved");
      setEditing(false);
    } catch (e) {
      toast.error("Failed to save nickname");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Nickname</span>
        {editing ? (
          <div className="flex items-center gap-1">
            <button onClick={save} disabled={saving} className="flex h-6 w-6 items-center justify-center rounded text-success hover:bg-accent" title="Save">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => { setEditing(false); setValue(fan?.nickname || fan?.display_name || ""); }} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent" title="Cancel">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary" title="Edit nickname">
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        )}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={!editing}
        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-70"
      />
    </div>
  );
}

function NotesField({ fan }) {
  const [value, setValue] = React.useState(fan?.notes || "");
  const [saving, setSaving] = React.useState(false);
  const [filter, setFilter] = React.useState("All");
  const [search, setSearch] = React.useState("");
  const saveTimer = React.useRef(null);

  React.useEffect(() => {
    setValue(fan?.notes || "");
  }, [fan?.id, fan?.notes]);

  const persist = React.useCallback((text) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        setSaving(true);
        await base44.entities.Fan.update(fan.id, { notes: text });
      } catch (e) {
        toast.error("Failed to save notes");
      } finally {
        setSaving(false);
      }
    }, 800);
  }, [fan?.id]);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</span>
        {saving && <span className="text-[10px] text-muted-foreground/60">saving…</span>}
      </div>

      {/* Filters */}
      <div className="mb-2 flex flex-wrap gap-1">
        {NOTE_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
              filter === f ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Search (visual filter for the notes view) */}
      <div className="relative mb-2">
        <input
          type="text"
          placeholder="Search notes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-input bg-background py-1.5 pl-3 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
        />
      </div>

      <textarea
        placeholder="Type notes about this fan..."
        value={value}
        onChange={(e) => { setValue(e.target.value); persist(e.target.value); }}
        rows={3}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <p className="mt-1 text-[10px] text-muted-foreground/60">
        {filter === "All" ? "Free-text notes, auto-saved" : `Filtered view (${filter}) — notes are free-text`}
      </p>
    </div>
  );
}

function MemoryList({ memories }) {
  const filtered = React.useMemo(() => {
    const list = Array.isArray(memories) ? memories : [];
    return list.filter((m) => {
      const conf = m.confidence != null ? m.confidence : 0.5;
      if (conf < MEMORY_CONFIDENCE_THRESHOLD) return false;
      if (TRIVIAL_KEYS.test(m.memory_key || "")) return false;
      return true;
    });
  }, [memories]);

  const hidden = (Array.isArray(memories) ? memories.length : 0) - filtered.length;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Brain className="h-3.5 w-3.5" />
          Memory
        </span>
        {hidden > 0 && (
          <span className="text-[10px] text-muted-foreground/60">{filtered.length} shown · {hidden} low-signal hidden</span>
        )}
      </div>
      {filtered.length === 0 ? (
        <p className="rounded-md border border-border bg-background px-3 py-3 text-xs text-muted-foreground">
          No high-signal memories yet — the AI only saves durable facts about this fan.
        </p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((m) => (
            <div key={m.id} className="rounded-md border border-border bg-background p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {m.memory_key}
                </span>
                {m.confidence != null && (
                  <span className="text-[10px] text-muted-foreground/60">{Math.round(m.confidence * 100)}%</span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-foreground">{m.memory_value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplatesTab() {
  const [copied, setCopied] = React.useState(null);
  const copy = (text, i) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(i);
      setTimeout(() => setCopied(null), 1500);
    });
  };
  return (
    <div className="space-y-3 p-4">
      <p className="text-xs text-muted-foreground">Quick opener snippets. Tap to copy and paste into the composer.</p>
      {QUICK_TEMPLATES.map((t, i) => (
        <button
          key={i}
          onClick={() => copy(t, i)}
          className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-accent"
        >
          <div className="flex items-start justify-between gap-2">
            <span>{t}</span>
            <span className="shrink-0 text-[10px] text-muted-foreground">{copied === i ? "Copied" : "Copy"}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

/* ---------- small presentational helpers ---------- */

function Card({ title, children }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <h4 className="mb-2.5 text-sm font-semibold text-foreground">{title}</h4>
      {children}
    </div>
  );
}

function StatBox({ label, value, sub }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-semibold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground/70">{sub}</p>
    </div>
  );
}

function DetailLine({ label, value, sub }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right">
        <span className="text-sm font-medium text-foreground">{value}</span>
        {sub && <span className="ml-1.5 text-[11px] text-muted-foreground/70">{sub}</span>}
      </span>
    </div>
  );
}

function EmptyInspector({ text }) {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}