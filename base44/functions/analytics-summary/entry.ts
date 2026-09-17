import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { apiCall, getValidAccessToken } from "../../shared/fanvue-api.ts";

// analytics-summary — aggregates per-creator metrics for the comparison dashboard:
//   - Total tips (Fanvue insights breakdownBySource)
//   - PPV sales (Fanvue insights breakdownBySource)
//   - Avg AI response time (local Message timestamps)
//   - Earnings trend over time (Fanvue summary overTime)
//   - Recent PPV offers (local Message records with ppv_cents)
// One server-side call per creator to the Fanvue summary endpoint; the browser
// never holds a Fanvue token.

const MS_PER_DAY = 86400000;

function dateStr(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// Race a promise against a timeout so a slow Fanvue API never blocks the
// whole response — the function always returns local data (response times,
// recent PPV) within a bounded time, with insights_error set when Fanvue
// is too slow or fails.
function withTimeout<T>(promise: Promise<T>, ms: number, label = "operation"): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out`)), ms)
    ),
  ]);
}

export default async function (req: Request): Promise<Response> {
  let body: any = {};
  try { body = await req.json(); } catch (e) {}

  const base44 = createClientFromRequest(req);
  try { await base44.auth.me(); } catch (e) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const days = Math.min(Math.max(Number(body.days) || 30, 1), 365);
  const endDate = body.endDate || dateStr(Date.now());
  const startDate = body.startDate || dateStr(Date.now() - (days - 1) * MS_PER_DAY);
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime() + MS_PER_DAY;

  const [creators, connections, messages] = await Promise.all([
    base44.asServiceRole.entities.CreatorProfile.list("-created_date", 100),
    base44.asServiceRole.entities.FanvueConnection.list("-created_date", 100),
    base44.asServiceRole.entities.Message.list("-created_date", 2000),
  ]);

  // ---- Avg response time + recent PPV per creator (local data) ----
  const responseStats: Record<string, { total: number; count: number }> = {};
  const ppvByCreator: Record<string, any[]> = {};
  const byConv: Record<string, any[]> = {};
  for (const m of messages) {
    const key = `${m.creator_profile_id}::${m.conversation_id}`;
    if (!byConv[key]) byConv[key] = [];
    byConv[key].push(m);
    if (m.ppv_cents && m.ppv_cents > 0) {
      const cid = m.creator_profile_id;
      if (!ppvByCreator[cid]) ppvByCreator[cid] = [];
      ppvByCreator[cid].push(m);
    }
  }
  for (const key of Object.keys(byConv)) {
    const msgs = byConv[key].sort((a: any, b: any) => new Date(a.created_date).getTime() - new Date(b.created_date).getTime());
    const cid = msgs[0]?.creator_profile_id;
    if (!cid) continue;
    if (!responseStats[cid]) responseStats[cid] = { total: 0, count: 0 };
    for (let i = 0; i < msgs.length - 1; i++) {
      if (msgs[i].sender_type === "fan" && (msgs[i + 1].sender_type === "creator" || msgs[i + 1].sender_type === "ai")) {
        const fanTime = new Date(msgs[i].created_date).getTime();
        const replyTime = new Date(msgs[i + 1].created_date).getTime();
        if (fanTime >= startMs && fanTime < endMs) {
          const diff = replyTime - fanTime;
          if (diff > 0 && diff < 3600000) {
            responseStats[cid].total += diff;
            responseStats[cid].count++;
          }
        }
      }
    }
  }

  // ---- Per-creator Fanvue insights ----
  // When a specific creator is selected on the frontend, only that creator's
  // Fanvue insights are fetched (one API call instead of N). All other roster
  // entries are returned with connected flag intact but no Fanvue earnings
  // data, so the comparison table still shows the full roster.
  const selectedCreatorId = body.creatorProfileId || null;
  const isTransient = (msg: string) => /timeout|5\d\d|429|rate.?limit|network|econnreset|aborted/i.test(msg || "");

  async function fetchInsightsWithRetry(accessToken: string): Promise<any> {
    const fanvueStart = new Date(startDate + "T00:00:00Z").toISOString();
    const fanvueEnd = new Date(endDate + "T23:59:59Z").toISOString();
    const params = new URLSearchParams({ startDate: fanvueStart, endDate: fanvueEnd, granularity: "day" });
    try {
      return await apiCall(`/v1/insights/earnings/summary?${params}`, accessToken);
    } catch (err: any) {
      // Single retry on transient failures (timeout / 5xx / 429 / network).
      if (isTransient(err.message)) {
        await new Promise((r) => setTimeout(r, 1500));
        return await apiCall(`/v1/insights/earnings/summary?${params}`, accessToken);
      }
      throw err;
    }
  }

  const results = await Promise.all(creators.map(async (creator: any) => {
    const connection = connections.find((c: any) => c.creator_profile_id === creator.id && c.status === "connected");
    const rs = responseStats[creator.id] || { total: 0, count: 0 };
    const avg_response_seconds = rs.count > 0 ? Math.round(rs.total / rs.count / 1000) : null;
    const recent_ppv = (ppvByCreator[creator.id] || [])
      .sort((a: any, b: any) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime())
      .slice(0, 10)
      .map((m: any) => ({ amount_cents: m.ppv_cents, date: m.created_date, preview: (m.body || "").slice(0, 60) }));

    const base = {
      creator_profile_id: creator.id,
      display_name: creator.display_name,
      username: creator.username,
      avatar_url: creator.avatar_url,
      connected: !!connection,
      tips_cents: 0,
      ppv_cents: 0,
      total_earnings_cents: 0,
      avg_response_seconds,
      trend: [] as any[],
      recent_ppv,
      insights_error: null as string | null,
    };

    if (!connection) {
      base.insights_error = "Not connected";
      return base;
    }
    const granted = connection.granted_scopes || [];
    if (!granted.includes("read:insights")) {
      base.insights_error = "Missing read:insights scope";
      return base;
    }

    // Skip the Fanvue API call for non-selected creators when a specific
    // creator is requested — keeps the call fast (one Fanvue hit, not N).
    if (selectedCreatorId && creator.id !== selectedCreatorId) {
      base.insights_error = "skipped";
      return base;
    }

    try {
      const accessToken = await withTimeout(getValidAccessToken(connection, base44), 8000, "token refresh");
      const summary: any = await withTimeout(fetchInsightsWithRetry(accessToken), 9000, "insights fetch");

      const breakdown = summary?.breakdownBySource || {};
      base.tips_cents = breakdown.tips?.net ?? 0;
      base.ppv_cents = (breakdown.messages?.net ?? 0) + (breakdown.posts?.net ?? 0);

      let rangeTotal = 0;
      base.trend = (summary?.overTime || []).map((o: any) => {
        rangeTotal += o.net || 0;
        return {
          date: o.periodStart ? new Date(o.periodStart).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "",
          gross: (o.gross || 0) / 100,
          net: (o.net || 0) / 100,
        };
      });
      // overTime reflects the selected range; thisMonth is unrelated to it.
      base.total_earnings_cents = rangeTotal;
    } catch (err: any) {
      base.insights_error = err.message || "Insights request failed";
    }
    return base;
  }));

  return Response.json({ creators: results, date_range: { start: startDate, end: endDate } });
}