// copilot-get-analytics — agent tool that fetches Fanvue analytics for the
// active creator: earnings summary, subscribers, spending, and top spenders
// over the last N days (default 30). Uses Promise.allSettled so one failing
// endpoint never blanks the whole report.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { getValidAccessToken, apiCall } from "../../shared/fanvue-api.ts";

export default async function (req: Request): Promise<Response> {
  let body: any = {};
  try { body = await req.json(); } catch (e) {}

  try {
    const base44 = createClientFromRequest(req);
    try { await base44.auth.me(); } catch (e) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { creatorProfileId, days } = body;
    if (!creatorProfileId) return Response.json({ error: "creatorProfileId is required" }, { status: 400 });

    const conns = await base44.asServiceRole.entities.FanvueConnection.filter(
      { creator_profile_id: creatorProfileId, status: "connected" }, "-created_date", 1
    );
    const connection = conns[0];
    if (!connection) return Response.json({ error: "Fanvue account not connected" }, { status: 400 });

    const accessToken = await getValidAccessToken(connection, base44);

    const rangeDays = Math.max(Math.min(days || 30, 365), 1);
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - rangeDays);
    const startISO = startDate.toISOString();
    const endISO = endDate.toISOString();
    const qs = `startDate=${encodeURIComponent(startISO)}&endDate=${encodeURIComponent(endISO)}`;

    const [earnings, subscribers, spending, topSpenders] = await Promise.allSettled([
      apiCall(`/v1/insights/earnings/summary?${qs}`, accessToken),
      apiCall(`/v1/insights/subscribers?${qs}`, accessToken),
      apiCall(`/v1/insights/spending?${qs}`, accessToken),
      apiCall(`/v1/insights/top-spenders?limit=10`, accessToken),
    ]);

    const unwrap = (r: any) =>
      r.status === "fulfilled" ? r.value : { error: r.reason?.message || "Failed" };

    return Response.json({
      success: true,
      range: { days: rangeDays, startDate: startISO, endDate: endISO },
      earningsSummary: unwrap(earnings),
      subscribers: unwrap(subscribers),
      spending: unwrap(spending),
      topSpenders: unwrap(topSpenders),
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}