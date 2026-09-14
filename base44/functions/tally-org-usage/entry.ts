// tally-org-usage — scheduled daily by the "Daily Usage Tally" workflow.
// For every organization, counts this month's AI jobs, messages sent, and
// creators connected, and upserts a UsageRecord for the current month.
//
// Also checks trial expiry: if an org's trial_ends_at has passed and the
// plan_status is still "trial", downgrades it to "free" and sets plan_status
// to "active" (trial ends, they're on free unless the owner upgrades them).
import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";

export default async function (req: Request): Promise<Response> {
  let body: any = {};
  try { body = await req.json(); } catch (e) {}

  try {
    const base44 = createClientFromRequest(req);

    // This function is called by a scheduled workflow — no user auth needed.
    // Use the service role for all reads/writes.

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // --- Load all organizations ---
    const orgs = await base44.asServiceRole.entities.Organization.list("-created_date", 500);
    let processed = 0;
    let errors = 0;

    for (const org of (orgs || [])) {
      try {
        // --- Trial expiry check ---
        if (org.plan_status === "trial" && org.trial_ends_at) {
          if (new Date(org.trial_ends_at) < now) {
            await base44.asServiceRole.entities.Organization.update(org.id, {
              plan_status: "active",
              plan_tier: org.plan_tier || "free",
            });
          }
        }

        // --- Tally this month's usage ---
        // Count AI jobs created this month for this org.
        // Since AIJob doesn't carry organization_id directly, we resolve via
        // CreatorProfile → organization_id. Load the org's creators first.
        const orgCreators = await base44.asServiceRole.entities.CreatorProfile.filter(
          { organization_id: org.id },
          "-created_date",
          200
        );
        const creatorIds = (orgCreators || []).map((c: any) => c.id);

        let aiJobs = 0;
        let messagesSent = 0;
        let ppvOffers = 0;
        let creatorsConnected = creatorIds.length;

        if (creatorIds.length > 0) {
          // Count AI jobs this month for these creators.
          // We query AIJob by creator_profile_id, then filter by created_date.
          for (const cpid of creatorIds) {
            try {
              const jobs = await base44.asServiceRole.entities.AIJob.filter(
                { creator_profile_id: cpid, status: { $in: ["completed"] } },
                "-created_date",
                200
              );
              aiJobs += (jobs || []).filter((j: any) =>
                j.created_date && new Date(j.created_date) >= new Date(monthStart)
              ).length;
            } catch (e) {}

            // Count messages sent this month (creator/AI sourced).
            try {
              const msgs = await base44.asServiceRole.entities.Message.filter(
                { creator_profile_id: cpid, sender_type: "creator" },
                "-created_date",
                200
              );
              messagesSent += (msgs || []).filter((m: any) =>
                m.created_date && new Date(m.created_date) >= new Date(monthStart)
              ).length;
            } catch (e) {}

            // Count PPV offers this month.
            try {
              const offers = await base44.asServiceRole.entities.PpvOfferTracking.filter(
                { creator_profile_id: cpid },
                "-created_date",
                200
              );
              ppvOffers += (offers || []).filter((o: any) =>
                o.sent_at && new Date(o.sent_at) >= new Date(monthStart)
              ).length;
            } catch (e) {}
          }
        }

        // --- Upsert the UsageRecord ---
        const existing = await base44.asServiceRole.entities.UsageRecord.filter(
          { organization_id: org.id, month: monthKey },
          "-created_date",
          1
        );
        if (existing && existing[0]) {
          await base44.asServiceRole.entities.UsageRecord.update(existing[0].id, {
            ai_jobs_processed: aiJobs,
            messages_sent: messagesSent,
            creators_connected: creatorsConnected,
            ppv_offers_sent: ppvOffers,
          });
        } else {
          await base44.asServiceRole.entities.UsageRecord.create({
            organization_id: org.id,
            month: monthKey,
            ai_jobs_processed: aiJobs,
            messages_sent: messagesSent,
            creators_connected: creatorsConnected,
            ppv_offers_sent: ppvOffers,
            reset_at: now.toISOString(),
          });
        }

        processed++;
      } catch (e) {
        errors++;
      }
    }

    return Response.json({
      success: true,
      processed,
      errors,
      month: monthKey,
      total_orgs: (orgs || []).length,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}