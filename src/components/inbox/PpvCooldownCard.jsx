import React from "react";
import { base44 } from "@/api/base44Client";
import { Clock } from "lucide-react";

// Item 13 — per-conversation PPV cooldown display. Shows the operator when the
// next PPV offer becomes eligible, based on the creator's cooldown setting and
// the conversation's last_ppv_offer_at. Renders inside the Inspector.
export default function PpvCooldownCard({ conversation, creatorProfileId }) {
  const [minMinutes, setMinMinutes] = React.useState(10);
  const [warmup, setWarmup] = React.useState(3);

  React.useEffect(() => {
    if (!creatorProfileId) return;
    let active = true;
    (async () => {
      try {
        const list = await base44.entities.AutomationSettings.filter({ creator_profile_id: creatorProfileId }, "-created_date", 1);
        if (!active) return;
        if (list[0]) {
          setMinMinutes(Math.max(list[0].ppv_min_minutes_between_offers || 10, 10));
          setWarmup(list[0].ppv_warmup_messages ?? 3);
        }
      } catch (e) {}
    })();
    return () => { active = false; };
  }, [creatorProfileId]);

  if (!conversation) return null;

  const lastOffer = conversation.last_ppv_offer_at;
  let eligibleIn = null;
  if (lastOffer) {
    const ms = minMinutes * 60000 - (Date.now() - new Date(lastOffer).getTime());
    eligibleIn = ms > 0 ? Math.ceil(ms / 60000) : 0;
  }

  const offerCount = conversation.ppv_offer_count || 0;

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Clock className="h-3.5 w-3.5 text-primary" /> PPV status
      </h4>
      <div className="space-y-1.5">
        <Line label="Offers sent" value={String(offerCount)} />
        <Line label="Warm-up floor" value={`${warmup} msgs`} />
        <Line
          label="Next eligible"
          value={eligibleIn == null ? "Now" : eligibleIn > 0 ? `in ${eligibleIn}m` : "Now"}
          highlight={eligibleIn != null && eligibleIn > 0}
        />
      </div>
    </div>
  );
}

function Line({ label, value, highlight }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium ${highlight ? "text-warning" : "text-foreground"}`}>{value}</span>
    </div>
  );
}