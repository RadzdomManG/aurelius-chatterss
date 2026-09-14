import React from "react";
import { cn } from "@/lib/utils";

// PlatformStats — the top stat cards on the SaaS owner dashboard.
export default function PlatformStats({ stats }) {
  const cards = [
    { label: "Total Customers", value: stats?.totalCustomers || 0, icon: "Users", tone: "primary" },
    { label: "Monthly Revenue", value: fmtMoney(stats?.totalMrrCents || 0), icon: "DollarSign", tone: "success" },
    { label: "Active", value: stats?.activeCount || 0, icon: "CheckCircle", tone: "success" },
    { label: "Suspended", value: stats?.suspendedCount || 0, icon: "Ban", tone: "destructive" },
    { label: "On Trial", value: stats?.trialCount || 0, icon: "Clock", tone: "warning" },
    { label: "AI Jobs (month)", value: stats?.totalAiJobs || 0, icon: "Bot", tone: "primary" },
    { label: "Messages Sent", value: stats?.totalMessages || 0, icon: "MessageSquare", tone: "primary" },
    { label: "Creators Connected", value: stats?.totalCreatorsConnected || 0, icon: "Users", tone: "primary" },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <StatCard key={c.label} {...c} />
      ))}
    </div>
  );
}

function StatCard({ label, value, tone }) {
  const TONES = {
    primary: "border-primary/20 bg-primary/5 text-primary",
    success: "border-success/20 bg-success/5 text-success",
    destructive: "border-destructive/20 bg-destructive/5 text-destructive",
    warning: "border-warning/20 bg-warning/5 text-warning",
  };
  return (
    <div className={cn("rounded-lg border p-4", TONES[tone] || TONES.primary)}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1.5 font-heading text-2xl text-foreground">{value}</p>
    </div>
  );
}

function fmtMoney(cents) {
  if (!cents) return "$0";
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}