import React from "react";
import { base44 } from "@/api/base44Client";
import { DollarSign, TrendingUp, Unlock, Percent, ShieldCheck, Layers, Trophy, RefreshCw } from "lucide-react";

const fmtMoney = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`;
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

// Revenue tab — pairs internal PpvOfferTracking funnel with Fanvue's
// read:insights verified PPV earnings, plus a Base vs Rescue comparison.
// `fanvueStats` is the selected creator's analytics-summary object.
export default function RevenueTab({ selectedCreatorId, days, fanvueStats }) {
  const [offers, setOffers] = React.useState([]);
  const [sets, setSets] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!selectedCreatorId) { setOffers([]); setSets([]); setLoading(false); return; }
    setLoading(true);
    try {
      const [o, s] = await Promise.all([
        base44.entities.PpvOfferTracking.filter({ creator_profile_id: selectedCreatorId }, "-created_date", 500),
        base44.entities.PpvContentSet.filter({ creator_profile_id: selectedCreatorId }, "created_date", 200),
      ]);
      setOffers(o || []);
      setSets(s || []);
    } catch (e) {
      setOffers([]); setSets([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCreatorId]);

  React.useEffect(() => { load(); }, [load]);

  // Scope offers to the selected date window.
  const cutoff = days ? Date.now() - days * 86400000 : 0;
  const windowed = offers.filter((o) => {
    const t = new Date(o.sent_at || o.created_date).getTime();
    return t >= cutoff;
  });

  const total = windowed.length;
  const purchased = windowed.filter((o) => o.purchased);
  const unlockCount = purchased.length;
  const unlockRate = pct(unlockCount, total);
  const internalRevenue = purchased.reduce((sum, o) => sum + (o.price_cents || 0), 0);
  const revenuePerOffer = total ? internalRevenue / total : 0;

  // Fanvue-verified headline (from read:insights via analytics-summary).
  const fanvuePpv = fanvueStats?.ppv_cents || 0;
  const fanvueTotalEarnings = fanvueStats?.total_earnings_cents || 0;
  const insightsError = fanvueStats?.insights_error;

  // Base vs Rescue split.
  const base = windowed.filter((o) => o.offer_type !== "rescue");
  const rescue = windowed.filter((o) => o.offer_type === "rescue");
  const baseUnlocks = base.filter((o) => o.purchased).length;
  const rescueUnlocks = rescue.filter((o) => o.purchased).length;
  const baseRevenue = base.filter((o) => o.purchased).reduce((s, o) => s + (o.price_cents || 0), 0);
  const rescueRevenue = rescue.filter((o) => o.purchased).reduce((s, o) => s + (o.price_cents || 0), 0);

  // Top content by revenue — sets + auto-vault folders in one ranked table.
  const setMap = new Map(sets.map((s) => [s.id, s]));
  const byContent = {};
  for (const o of windowed) {
    const isVault = o.source === "vault" || !o.content_set_id;
    const key = isVault ? `vault::${o.folder_name || "Unsorted"}` : `set::${o.content_set_id}`;
    byContent[key] = byContent[key] || {
      name: isVault ? (o.folder_name || "Vault — Unsorted") : (setMap.get(o.content_set_id)?.name || "Unknown set"),
      type: isVault ? "Vault" : "Set",
      sent: 0, unlocked: 0, revenue: 0,
    };
    byContent[key].sent++;
    if (o.purchased) { byContent[key].unlocked++; byContent[key].revenue += o.price_cents || 0; }
  }
  const contentRows = Object.entries(byContent)
    .map(([k, r]) => ({ key: k, ...r, conv: pct(r.unlocked, r.sent), rpo: r.sent ? r.revenue / r.sent : 0 }))
    .sort((a, b) => b.revenue - a.revenue);

  if (loading) {
    return <div className="mt-6 h-64 animate-pulse rounded-lg bg-muted" />;
  }

  if (!selectedCreatorId) {
    return (
      <div className="mt-6 rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Select a creator to view PPV revenue performance.
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Headline metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <HeadlineCard
          label="PPV Revenue (Fanvue)"
          value={fmtMoney(fanvuePpv)}
          icon={ShieldCheck}
          color="text-success"
          badge="verified"
          hint={insightsError ? insightsError : "read:insights"}
          error={!!insightsError}
        />
        <HeadlineCard label="Offers Sent" value={String(total)} icon={TrendingUp} color="text-primary" />
        <HeadlineCard label="Unlocks" value={String(unlockCount)} icon={Unlock} color="text-foreground" />
        <HeadlineCard label="Unlock Rate" value={`${unlockRate}%`} icon={Percent} color="text-warning" />
        <HeadlineCard label="Revenue / Offer" value={fmtMoney(revenuePerOffer)} icon={DollarSign} color="text-success" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Base vs Rescue */}
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-heading text-lg text-foreground">
              <Layers className="h-4 w-4 text-primary" /> Base vs Rescue
            </h2>
            <span className="text-xs text-muted-foreground">last {days} days</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <OfferColumn title="Base offers" accent="text-foreground" sent={base.length} unlocks={baseUnlocks} rate={pct(baseUnlocks, base.length)} revenue={baseRevenue} />
            <OfferColumn title="Rescue offers" accent="text-primary" sent={rescue.length} unlocks={rescueUnlocks} rate={pct(rescueUnlocks, rescue.length)} revenue={rescueRevenue} />
          </div>
          <div className="mt-4 rounded-md border border-border bg-background p-3 text-sm">
            {rescueUnlocks > 0 ? (
              <span className="text-foreground">
                Rescue recovered <strong className="text-success">{fmtMoney(rescueRevenue)}</strong> across <strong>{rescueUnlocks}</strong> unlock{rescueUnlocks === 1 ? "" : "s"} that would otherwise have been lost.
              </span>
            ) : rescue.length > 0 ? (
              <span className="text-muted-foreground">No rescue unlocks yet — {rescue.length} rescue offer{rescue.length === 1 ? "" : "s"} sent, none purchased.</span>
            ) : (
              <span className="text-muted-foreground">No rescue offers sent in this window.</span>
            )}
          </div>
        </div>

        {/* Top content by revenue */}
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-heading text-lg text-foreground">
              <Trophy className="h-4 w-4 text-warning" /> Top Content by Revenue
            </h2>
            <span className="text-xs text-muted-foreground">{contentRows.length} item{contentRows.length === 1 ? "" : "s"}</span>
          </div>
          {contentRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No PPV offers tracked for this creator yet. Offers appear once the AI sends locked content.</p>
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto scrollbar-thin">
              {contentRows.map((r) => (
                <div key={r.key} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{r.type}</span>
                    <span className="truncate text-foreground">{r.name}</span>
                  </div>
                  <span className="shrink-0 text-muted-foreground">
                    {r.sent} sent · {r.unlocked} unlocked · {r.conv}% · <strong className="text-foreground">{fmtMoney(r.revenue)}</strong>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Internal funnel from PpvOfferTracking · Fanvue-verified revenue from read:insights
      </p>
    </div>
  );
}

function HeadlineCard({ label, value, icon: Icon, color, badge, hint, error }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
        {badge && (
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${error ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>
            {error ? "unavailable" : badge}
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-heading text-foreground">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function OfferColumn({ title, accent, sent, unlocks, rate, revenue }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className={`mb-2 text-sm font-medium ${accent}`}>{title}</p>
      <div className="space-y-1 text-sm">
        <Row label="Sent" value={String(sent)} />
        <Row label="Unlocked" value={String(unlocks)} />
        <Row label="Unlock rate" value={`${rate}%`} />
        <Row label="Revenue" value={fmtMoney(revenue)} strong />
      </div>
    </div>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-medium text-foreground" : "text-foreground"}>{value}</span>
    </div>
  );
}