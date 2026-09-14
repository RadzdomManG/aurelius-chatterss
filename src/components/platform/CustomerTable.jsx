import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ChevronRight, ChevronDown, Lock, MoreVertical, Check, X } from "lucide-react";
import MembersPanel from "@/components/platform/MembersPanel";

// CustomerTable — the customer list on the SaaS owner dashboard.
// Each row expands to show usage detail + plan management controls.
export default function CustomerTable({ customers, onPlanChanged }) {
  const [expanded, setExpanded] = React.useState(null);

  const toggle = (id) => setExpanded((prev) => (prev === id ? null : id));

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left">
            <th className="px-4 py-3 font-medium text-muted-foreground" style={{ width: 32 }} />
            <th className="px-4 py-3 font-medium text-muted-foreground">Customer</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">Plan</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">MRR</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">AI Jobs</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Creators</th>
            <th className="px-4 py-3 font-medium text-muted-foreground" style={{ width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => {
            const isOpen = expanded === c.id;
            return (
              <React.Fragment key={c.id}>
                <tr
                  onClick={() => toggle(c.id)}
                  className={cn(
                    "cursor-pointer border-b border-border transition-colors hover:bg-muted/30",
                    isOpen && "bg-muted/20"
                  )}
                >
                  <td className="px-4 py-3 text-muted-foreground">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{c.name}</span>
                      {c.planStatus === "suspended" && <Lock className="h-3 w-3 text-destructive" />}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(c.createdAt || 0).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <PlanBadge tier={c.planTier} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={c.planStatus} />
                  </td>
                  <td className="px-4 py-3 text-right text-foreground">{fmtMoney(c.mrrCents)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="text-foreground">{c.aiJobsThisMonth}</span>
                      <span className="text-xs text-muted-foreground">/ {c.aiMessagesLimit === -1 ? "∞" : c.aiMessagesLimit}</span>
                    </div>
                    {c.aiMessagesLimit > 0 && (
                      <div className="ml-auto mt-1 h-1 w-16 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            c.aiUsagePercent >= 90 ? "bg-destructive" : c.aiUsagePercent >= 70 ? "bg-warning" : "bg-primary"
                          )}
                          style={{ width: `${c.aiUsagePercent}%` }}
                        />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-foreground">{c.creatorsConnected}</span>
                    <span className="text-xs text-muted-foreground"> / {c.maxCreators === -1 ? "∞" : c.maxCreators}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <MoreVertical className="h-4 w-4" />
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-border bg-muted/10">
                    <td colSpan={8} className="px-4 py-4">
                      <CustomerDetail customer={c} onPlanChanged={onPlanChanged} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
          {customers.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                No customers yet. When creators register, they'll appear here.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CustomerDetail({ customer, onPlanChanged }) {
  const [updating, setUpdating] = React.useState(null);

  const setPlan = async (tier) => {
    try {
      setUpdating("tier");
      await base44.functions.invoke("platform-set-plan", {
        organizationId: customer.id,
        planTier: tier,
      });
      toast.success(`Plan set to ${tier}`);
      onPlanChanged?.();
    } catch (e) {
      toast.error("Failed to update plan: " + (e.message || "Unknown error"));
    } finally {
      setUpdating(null);
    }
  };

  const setStatus = async (status) => {
    try {
      setUpdating("status");
      await base44.functions.invoke("platform-set-plan", {
        organizationId: customer.id,
        planStatus: status,
      });
      toast.success(status === "suspended" ? "Account suspended" : "Account reactivated");
      onPlanChanged?.();
    } catch (e) {
      toast.error("Failed to update status: " + (e.message || "Unknown error"));
    } finally {
      setUpdating(null);
    }
  };

  const setMrr = async (cents) => {
    try {
      setUpdating("mrr");
      await base44.functions.invoke("platform-set-plan", {
        organizationId: customer.id,
        mrrCents: cents,
      });
      toast.success("MRR updated");
      onPlanChanged?.();
    } catch (e) {
      toast.error("Failed to update MRR: " + (e.message || "Unknown error"));
    } finally {
      setUpdating(null);
    }
  };

  const [mrrInput, setMrrInput] = React.useState("");

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="sm:col-span-3">
        <MembersPanel customer={customer} onMembersChanged={onPlanChanged} />
      </div>
      {/* Plan tier */}
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Plan Tier</p>
        <div className="flex flex-wrap gap-1.5">
          {["free", "pro", "agency"].map((tier) => (
            <button
              key={tier}
              onClick={() => setPlan(tier)}
              disabled={updating === "tier" || customer.planTier === tier}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                customer.planTier === tier
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-background text-foreground hover:bg-accent"
              )}
            >
              {tier}
            </button>
          ))}
        </div>
      </div>

      {/* Status */}
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Account Status</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setStatus("active")}
            disabled={updating === "status" || customer.planStatus === "active"}
            className={cn(
              "flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              customer.planStatus === "active"
                ? "bg-success text-success-foreground"
                : "border border-border bg-background text-foreground hover:bg-accent"
            )}
          >
            <Check className="h-3 w-3" /> Active
          </button>
          <button
            onClick={() => setStatus("suspended")}
            disabled={updating === "status" || customer.planStatus === "suspended"}
            className={cn(
              "flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              customer.planStatus === "suspended"
                ? "bg-destructive text-destructive-foreground"
                : "border border-border bg-background text-foreground hover:bg-accent"
            )}
          >
            <X className="h-3 w-3" /> Suspend
          </button>
        </div>
      </div>

      {/* MRR */}
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          MRR (cents) — current: {fmtMoney(customer.mrrCents)}
        </p>
        <div className="flex gap-1.5">
          <input
            value={mrrInput}
            onChange={(e) => setMrrInput(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="cents (e.g. 4900 = $49)"
            className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
          />
          <button
            onClick={() => {
              const cents = parseInt(mrrInput, 10);
              if (!isNaN(cents) && cents >= 0) {
                setMrr(cents);
                setMrrInput("");
              }
            }}
            disabled={updating === "mrr" || !mrrInput}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Set
          </button>
        </div>
      </div>
    </div>
  );
}

function PlanBadge({ tier }) {
  const STYLES = {
    free: "bg-muted text-muted-foreground",
    pro: "bg-primary/15 text-primary",
    agency: "bg-accent text-accent-foreground",
  };
  const LABELS = { free: "Free", pro: "Pro", agency: "Agency" };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", STYLES[tier] || STYLES.free)}>
      {LABELS[tier] || "Free"}
    </span>
  );
}

function StatusPill({ status }) {
  const STYLES = {
    active: "bg-success/15 text-success",
    suspended: "bg-destructive/15 text-destructive",
    trial: "bg-warning/15 text-warning",
  };
  const LABELS = { active: "Active", suspended: "Suspended", trial: "Trial" };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", STYLES[status] || STYLES.active)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", status === "suspended" ? "bg-destructive" : status === "trial" ? "bg-warning" : "bg-success")} />
      {LABELS[status] || "Active"}
    </span>
  );
}

function fmtMoney(cents) {
  if (!cents) return "$0";
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}