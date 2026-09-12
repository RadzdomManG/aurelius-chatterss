import React from "react";
import { base44 } from "@/api/base44Client";
import { TrendingUp, Unlock, DollarSign, Percent } from "lucide-react";
import { useCreator } from "@/lib/creator-context";

const fmtMoney = (c) => `$${(Number(c || 0) / 100).toFixed(2)}`;

// Item 12 — PPV conversion analytics. Computes unlock rate, revenue, and
// per-set / per-rung performance from PpvOfferTracking for the selected creator.
export default function PpvConversionAnalytics() {
  const { selectedCreatorId } = useCreator();
  const [offers, setOffers] = React.useState([]);
  const [sets, setSets] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!selectedCreatorId) { setOffers([]); setSets([]); setLoading(false); return; }
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const [o, s] = await Promise.all([
          base44.entities.PpvOfferTracking.filter({ creator_profile_id: selectedCreatorId }, "-created_date", 200),
          base44.entities.PpvContentSet.filter({ creator_profile_id: selectedCreatorId }, "created_date", 100),
        ]);
        if (!active) return;
        setOffers(o || []);
        setSets(s || []);
      } catch (e) {}
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [selectedCreatorId]);

  if (loading) return <div className="mt-8 h-24 animate-pulse rounded-lg bg-muted" />;
  if (!selectedCreatorId) return null;

  const total = offers.length;
  const purchased = offers.filter((o) => o.purchased).length;
  const unlockRate = total ? Math.round((purchased / total) * 100) : 0;
  const revenue = offers.filter((o) => o.purchased).reduce((sum, o) => sum + (o.price_cents || 0), 0);
  const revenuePerOffer = total ? revenue / total : 0;

  const setMap = new Map(sets.map((s) => [s.id, s]));
  const bySet = {};
  for (const o of offers) {
    const k = o.content_set_id || "unknown";
    bySet[k] = bySet[k] || { name: setMap.get(o.content_set_id)?.name || "Unknown", sent: 0, purchased: 0, revenue: 0 };
    bySet[k].sent++;
    if (o.purchased) { bySet[k].purchased++; bySet[k].revenue += o.price_cents || 0; }
  }
  const setRows = Object.entries(bySet).sort((a, b) => b[1].revenue - a[1].revenue);

  const byRung = {};
  for (const o of offers) {
    const k = o.price_cents || 0;
    byRung[k] = byRung[k] || { sent: 0, purchased: 0, revenue: 0 };
    byRung[k].sent++;
    if (o.purchased) { byRung[k].purchased++; byRung[k].revenue += k; }
  }
  const rungRows = Object.entries(byRung).sort((a, b) => Number(a[0]) - Number(b[0]));

  return (
    <div className="mt-8 rounded-lg border border-border bg-card p-5">
      <h2 className="mb-4 flex items-center gap-2 font-heading text-lg text-foreground"><TrendingUp className="h-4 w-4 text-primary" /> PPV Conversion</h2>
      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MiniStat icon={Unlock} label="Offers sent" value={String(total)} />
        <MiniStat icon={Percent} label="Unlock rate" value={`${unlockRate}%`} />
        <MiniStat icon={DollarSign} label="Revenue" value={fmtMoney(revenue)} />
        <MiniStat icon={TrendingUp} label="Revenue / offer" value={fmtMoney(revenuePerOffer)} />
      </div>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">No PPV offers tracked yet. Offers appear here once the AI sends locked content.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">By content set</h3>
            <div className="space-y-1.5">
              {setRows.map(([id, r]) => (
                <div key={id} className="flex items-center justify-between text-sm">
                  <span className="truncate text-foreground">{r.name}</span>
                  <span className="text-muted-foreground">{r.sent} sent · {r.purchased} unlocked · {fmtMoney(r.revenue)}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">By price rung</h3>
            <div className="space-y-1.5">
              {rungRows.map(([cents, r]) => (
                <div key={cents} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{fmtMoney(cents)}</span>
                  <span className="text-muted-foreground">{r.sent} sent · {r.purchased} unlocked · {fmtMoney(r.revenue)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground"><Icon className="h-3.5 w-3.5" /><span className="text-xs">{label}</span></div>
      <p className="mt-1 text-xl font-heading text-foreground">{value}</p>
    </div>
  );
}