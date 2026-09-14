import React from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, Ban, Clock, CreditCard, FileText, Scale } from "lucide-react";

// Terms & Conditions — public-facing, linked from Register, Login, and Billing.
// Covers the platform owner's right to remove access, delay/withhold payment,
// and suspend accounts for non-payment or abuse.
export default function Terms() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <span className="font-heading text-lg">A</span>
          </div>
          <div>
            <h1 className="font-heading text-2xl text-foreground">Aurelius Chatter — Terms & Conditions</h1>
            <p className="text-sm text-muted-foreground">Last updated: September 14, 2026</p>
          </div>
        </div>

        <div className="mb-8 rounded-lg border border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <Scale className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm text-muted-foreground">
              By creating an account, connecting a Fanvue creator account, or using any part of
              Aurelius Chatter ("the Service"), you agree to the terms below. These terms form a
              binding agreement between you ("you", "Creator", "Subscriber") and the platform owner
              ("we", "us", "Platform Owner").
            </p>
          </div>
        </div>

        <Section icon={FileText} title="1. The Service">
          <p>
            Aurelius Chatter is an AI-powered operations console that helps Fanvue creators manage
            fan conversations, automate engagement, schedule content, and track performance. The
            Service is provided on a subscription basis across three tiers: Free, Pro, and Agency.
            Access to features is gated by the tier assigned to your organization by the Platform
            Owner.
          </p>
        </Section>

        <Section icon={CreditCard} title="2. Billing & Payment">
          <p>
            Plan subscription fees are billed monthly and are handled off-platform. You are
            responsible for paying invoices in full by the due date communicated to you. Your tier
            (Free, Pro, or Agency) and its associated limits only take effect once payment for that
            tier is received in full.
          </p>
          <p className="mt-2">
            <strong className="text-foreground">Delay or non-payment.</strong> If any invoice is not
            paid by its due date, we reserve the right — at our sole discretion and without prior
            notice — to immediately downgrade your account to the Free tier, suspend access to the
            Service, withhold or pause AI message processing, and disable Copilot bulk actions
            until the outstanding balance is settled. We are under no obligation to send reminders
            before taking these actions.
          </p>
          <p className="mt-2">
            <strong className="text-foreground">No refunds for suspension.</strong> If your account
            is suspended or downgraded due to late or missed payment, no prorated refund will be
            issued for the current billing period. Service resumes only after full payment of all
            outstanding amounts plus any reinstatement fee we may set.
          </p>
        </Section>

        <Section icon={ShieldAlert} title="3. Right to Remove Access">
          <p>
            We may revoke, limit, or suspend your access to the Service at any time, for any
            reason, including but not limited to:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Non-payment, late payment, or chargeback of any invoice.</li>
            <li>Violation of these Terms or any acceptable-use policy we publish.</li>
            <li>Misuse of the AI automation in a way that harms a fan, a creator, or Fanvue.</li>
            <li>Suspicious, fraudulent, or abusive activity on your account.</li>
            <li>A request or instruction from Fanvue or any legal authority.</li>
            <li>Extended inactivity or abandonment of the account.</li>
          </ul>
          <p className="mt-2">
            Removal of access may include disconnecting Fanvue OAuth tokens, pausing all automation,
            disabling logins, and deleting queued AI jobs. We are not liable for any loss of
            drafted content, scheduled posts, or pending conversations resulting from such action.
          </p>
        </Section>

        <Section icon={Clock} title="4. Service Availability & No Warranties">
          <p>
            The Service is provided "as is" and "as available". We do not guarantee uninterrupted
            access, error-free AI output, or that messages will always be delivered to Fanvue. AI
            responses are generated by third-party models and may occasionally be inaccurate,
            off-persona, or repetitive. You are responsible for reviewing automated replies before
            they reach your fans where your automation mode requires approval.
          </p>
        </Section>

        <Section icon={Ban} title="5. Acceptable Use">
          <p>
            You agree not to use the Service to send spam, impersonate another person, distribute
            unlawful content, or circumvent any Fanvue platform policy. The AI must not be used to
            harass, deceive, or financially exploit fans. We may immediately terminate any account
            found in violation.
          </p>
        </Section>

        <Section icon={FileText} title="6. Data & Privacy">
          <p>
            Conversation history, fan memories, vault media references, and usage data are stored
            to operate the Service. We do not sell your data. You may request export or deletion of
            your organization's data at any time by contacting support. Upon account termination,
            we will permanently delete your data within 30 days, except where retention is required
            by law or for dispute resolution.
          </p>
        </Section>

        <Section icon={ShieldAlert} title="7. Limitation of Liability">
          <p>
            To the maximum extent permitted by law, we are not liable for any indirect,
            incidental, or consequential damages arising from use of the Service, including lost
            revenue from failed message delivery, paused automation, suspended accounts, or
            inaccurate AI output. Our total liability for any claim is limited to the fees you paid
            us in the three (3) months preceding the event giving rise to the claim.
          </p>
        </Section>

        <Section icon={FileText} title="8. Changes to These Terms">
          <p>
            We may update these Terms at any time. Material changes will be communicated via the
            email on your account or an in-app notice. Continued use of the Service after changes
            take effect constitutes acceptance of the revised Terms.
          </p>
        </Section>

        <Section icon={Scale} title="9. Governing Law">
          <p>
            These Terms are governed by the laws applicable to the Platform Owner's jurisdiction.
            Any dispute will be resolved by binding arbitration or in the competent courts of that
            jurisdiction, unless we agree otherwise in writing.
          </p>
        </Section>

        <div className="mt-10 flex items-center justify-between border-t border-border pt-6">
          <p className="text-sm text-muted-foreground">
            Questions about these terms? Contact the Platform Owner directly.
          </p>
          <Link
            to="/register"
            className="text-sm font-medium text-primary hover:underline"
          >
            Back to sign up
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        <h2 className="font-heading text-lg text-foreground">{title}</h2>
      </div>
      <div className="space-y-1 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}