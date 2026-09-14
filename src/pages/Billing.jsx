import React from "react";
import { base44 } from "@/api/base44Client";
import { usePlan } from "@/lib/plan-context";
import { PlanBadge } from "@/components/shared/UpgradePrompt";
import { Sparkles, TrendingUp, MessageSquare, Bot, Users, CreditCard, Calendar, Crown } from "lucide-react";
import { Link } from "react-router-dom";

// Billing / Usage page — shows the customer's current plan, this month's
// usage (AI jobs, messages, PPV offers, creators), and the plan limits.
// Payment is handled off-platform — this page just shows what they have and
// what they've used this month.
export default function Billing() {
  const { organization, plan, usage, loading, planTier, planStatus, isTrial, trialEndsAt, aiMessagesRemaining } = usePlan();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <CreditCard className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h3 className="font-heading text-lg text-foreground">No workspace found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Your workspace will be provisioned automatically. If this persists, contact the platform owner.
          </p>
        </div>
      </div>
    );
  }

  const trialEndDate = trialEndsAt ? new Date(trialEndsAt) : null;
  const daysLeft = trialEndDate ? Math.max(0, Math.ceil((trialEndDate.getTime() - Date.now()) / 86400000)) : 0;

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-3xl px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-heading text-3xl text-foreground">Plan & Usage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your subscription plan and this month's usage. Payment is handled directly with the platform owner.
          </p>
        </div>

        {/* Plan card */}
        <div className="mb-6 rounded-xl border border-border bg-card p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="font-heading text-2xl text-foreground">{organization.name}</h2>
                <PlanBadge tier={planTier} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {plan?.label} plan · {planStatus === "active" ? "Active" : planStatus === "trial" ? "Trial" : "Suspended"}
              </p>
            </div>
            {planStatus === "active" && (
              <div className="flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs text-success">
                <Sparkles className="h-3 w-3" />
                Active
              </div>
            )}
            {isTrial && (
              <div className="flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1 text-xs text-warning">
                <Calendar className="h-3 w-3" />
                Trial · {daysLeft}d left
              </div>
            )}
            {planStatus === "suspended" && (
              <div className="flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-xs text-destructive">
                <Crown className="h-3 w-3" />
                Suspended
              </div>
            )}
          </div>

          {/* Plan limits grid */}
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <LimitCard
              icon={Bot}
              label="AI Messages / Month"
              value={usage?.aiJobsProcessed || 0}
              limit={plan?.maxAiMessagesPerMonth === -1 ? "Unlimited" : plan?.maxAiMessagesPerMonth}
              percent={usage?.aiUsagePercent || 0}
            />
            <LimitCard
              icon={Users}
              label="Creators Connected"
              value={usage?.creatorsConnected || 0}
              limit={plan?.maxCreators === -1 ? "Unlimited" : plan?.maxCreators}
            />
            <LimitCard
              icon={TrendingUp}
              label="Copilot Bulk Scheduling"
              value={plan?.copilotBulkScheduling ? "Enabled" : "Disabled"}
              limit={plan?.copilotBulkScheduling ? "Pro/Agency" : "Upgrade required"}
              textOnly
            />
          </div>
        </div>

        {/* Usage detail */}
        <div className="mb-6 rounded-xl border border-border bg-card p-6">
          <h3 className="mb-4 font-heading text-lg text-foreground">This Month's Usage</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <UsageStat icon={Bot} label="AI Jobs Processed" value={usage?.aiJobsProcessed || 0} />
            <UsageStat icon={MessageSquare} label="Messages Sent" value={usage?.messagesSent || 0} />
            <UsageStat icon={TrendingUp} label="PPV Offers Sent" value={usage?.ppvOffersSent || 0} />
            <UsageStat icon={Users} label="Creators Connected" value={usage?.creatorsConnected || 0} />
          </div>
        </div>

        {/* Payment info */}
        <div className="rounded-xl border border-border bg-muted/30 p-6">
          <div className="flex items-start gap-3">
            <CreditCard className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <h3 className="text-sm font-medium text-foreground">Payment & Upgrades</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                To upgrade your plan, change your tier, or manage billing, contact the platform owner directly.
                There is no automated billing — all arrangements are handled personally.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Access may be delayed, downgraded, or revoked for late or missed payments. See our{" "}
                <Link to="/terms" className="text-primary font-medium hover:underline">Terms & Conditions</Link>
                {" "}for details.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LimitCard({ icon: Icon, label, value, limit, percent, textOnly }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="font-heading text-2xl text-foreground">{value}</span>
        <span className="text-sm text-muted-foreground">/ {limit}</span>
      </div>
      {!textOnly && percent !== undefined && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.min(100, percent)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function UsageStat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <span className="mt-2 block font-heading text-2xl text-foreground">{value}</span>
    </div>
  );
}