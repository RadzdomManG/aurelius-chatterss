import React from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { ChevronRight, ChevronDown, Lock, AlertCircle } from "lucide-react";

const fmtMoney = (cents) => (cents ? `$${(cents / 100).toFixed(2)}` : "$0.00");
const fmtSeconds = (s) => (s == null ? "—" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);
const fmtDate = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export default function CreatorComparisonTable({ creators }) {
  const [expanded, setExpanded] = React.useState(null);

  const toggle = (id) => setExpanded((prev) => (prev === id ? null : id));

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left">
            <th className="px-4 py-3 font-medium text-muted-foreground" />
            <th className="px-4 py-3 font-medium text-muted-foreground">Creator</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total Tips</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">PPV Sales</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Avg Response</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total Earnings</th>
          </tr>
        </thead>
        <tbody>
          {creators.map((c) => {
            const isOpen = expanded === c.creator_profile_id;
            return (
              <React.Fragment key={c.creator_profile_id}>
                <tr
                  onClick={() => toggle(c.creator_profile_id)}
                  className={`cursor-pointer border-b border-border transition-colors hover:bg-muted/30 ${isOpen ? "bg-muted/20" : ""}`}
                >
                  <td className="px-4 py-3 text-muted-foreground">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{c.display_name}</span>
                      {c.username && <span className="text-xs text-muted-foreground">@{c.username}</span>}
                      {!c.connected && <Lock className="h-3 w-3 text-muted-foreground" />}
                      {c.insights_error && c.connected && <AlertCircle className="h-3 w-3 text-warning" />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{fmtMoney(c.tips_cents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{fmtMoney(c.ppv_cents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{fmtSeconds(c.avg_response_seconds)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{fmtMoney(c.total_earnings_cents)}</td>
                </tr>
                {isOpen && (
                  <tr className="bg-muted/10">
                    <td colSpan={6} className="px-4 pb-5 pt-2">
                      <CreatorDetail creator={c} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
          {creators.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                No creators yet — connect a Fanvue account to see analytics.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CreatorDetail({ creator }) {
  const hasTrend = creator.trend && creator.trend.length > 0;
  const hasPpv = creator.recent_ppv && creator.recent_ppv.length > 0;

  return (
    <div className="space-y-4">
      {creator.insights_error && (
        <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning">
          <AlertCircle className="h-3.5 w-3.5" />
          {creator.insights_error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Earnings trend */}
        <div className="rounded-md border border-border bg-card p-4">
          <h4 className="mb-3 text-xs font-medium text-muted-foreground">Earnings Trend</h4>
          {hasTrend ? (
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={creator.trend}>
                  <defs>
                    <linearGradient id={`grad-${creator.creator_profile_id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(v) => `$${v}`}
                  />
                  <Area type="monotone" dataKey="net" name="Net" stroke="hsl(var(--chart-1))" strokeWidth={2} fill={`url(#grad-${creator.creator_profile_id})`} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">No earnings data for this period.</p>
          )}
        </div>

        {/* Recent PPV offers */}
        <div className="rounded-md border border-border bg-card p-4">
          <h4 className="mb-3 text-xs font-medium text-muted-foreground">Recent PPV Offers</h4>
          {hasPpv ? (
            <div className="space-y-2 max-h-44 overflow-y-auto scrollbar-thin">
              {creator.recent_ppv.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="truncate pr-3">
                    <span className="text-foreground">{fmtMoney(p.amount_cents)}</span>
                    <span className="ml-2 truncate text-xs text-muted-foreground">{p.preview || "(no text)"}</span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtDate(p.date)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">No PPV offers sent in this period.</p>
          )}
        </div>
      </div>
    </div>
  );
}