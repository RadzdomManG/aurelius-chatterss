import React from "react";
import { Sparkles, ArrowUpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// UpgradePrompt — inline non-blocking card shown when a free-tier user hits
// a plan limit. Not a modal — renders in place wherever the gated feature
// would normally be.
export default function UpgradePrompt({ title, description, className }) {
  return (
    <div className={cn(
      "flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4",
      className
    )}>
      <ArrowUpCircle className="h-5 w-5 shrink-0 text-primary mt-0.5" />
      <div>
        <p className="text-sm font-medium text-foreground">{title || "Upgrade your plan"}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {description || "This feature requires a higher plan. Contact the platform owner to upgrade your account."}
        </p>
      </div>
    </div>
  );
}

// PlanBadge — small pill showing the user's current plan tier.
export function PlanBadge({ tier, className }) {
  const STYLES = {
    free: "bg-muted text-muted-foreground",
    pro: "bg-primary/15 text-primary",
    agency: "bg-accent text-accent-foreground",
  };
  const LABELS = {
    free: "Free",
    pro: "Pro",
    agency: "Agency",
  };
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
      STYLES[tier] || STYLES.free,
      className
    )}>
      <Sparkles className="h-3 w-3" />
      {LABELS[tier] || "Free"}
    </span>
  );
}