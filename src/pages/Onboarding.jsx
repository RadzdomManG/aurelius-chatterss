import React from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { initiateFanvueOAuth } from "@/lib/fanvue-oauth";
import { usePlan } from "@/lib/plan-context";
import { useCreator } from "@/lib/creator-context";
import { toast } from "sonner";
import { CheckCircle, Plug, Bot, ArrowRight, Sparkles, Loader2, UserCircle } from "lucide-react";

// Onboarding wizard — a guided 4-step flow that a new creator follows after
// registering: (1) account created, (2) connect Fanvue, (3) set up persona,
// (4) done. Each step checks off as the user completes it and the next
// becomes active. Once Fanvue is connected and a persona exists, the wizard
// links to the Inbox.
export default function Onboarding() {
  const { planTier, isTrial, reload: reloadPlan } = usePlan();
  const { creators, connections, reloadCreators, selectCreator } = useCreator();
  const [connecting, setConnecting] = React.useState(false);
  const [creatingPersona, setCreatingPersona] = React.useState(false);
  const [personaText, setPersonaText] = React.useState("");
  const [personaName, setPersonaName] = React.useState("");

  // Resolve the first connected creator (if any).
  const connByCreator = React.useMemo(() => {
    const map = {};
    for (const c of (connections || [])) {
      const existing = map[c.creator_profile_id];
      if (!existing || (c.status === "connected" && existing.status !== "connected")) {
        map[c.creator_profile_id] = c;
      }
    }
    return map;
  }, [connections]);

  const connectedCreator = (creators || []).find((c) => connByCreator[c.id]?.status === "connected");

  // --- Step 1: Account created — always done (they're logged in) ---
  const step1Done = true;

  // --- Step 2: Fanvue connected ---
  const step2Done = !!connectedCreator;

  // --- Step 3: Persona set up ---
  const [hasPersona, setHasPersona] = React.useState(false);
  React.useEffect(() => {
    if (connectedCreator) {
      base44.entities.PersonaProfile.filter({ creator_profile_id: connectedCreator.id, active: true }, "-created_date", 1)
        .then((res) => setHasPersona(res && res.length > 0))
        .catch(() => setHasPersona(false));
    }
  }, [connectedCreator?.id]);
  const step3Done = hasPersona;

  // --- Step 4: Done ---
  const step4Done = step1Done && step2Done && step3Done;

  const steps = [
    { num: 1, label: "Create account", done: step1Done, icon: UserCircle },
    { num: 2, label: "Connect Fanvue", done: step2Done, icon: Plug },
    { num: 3, label: "Set up persona", done: step3Done, icon: Bot },
    { num: 4, label: "Done", done: step4Done, icon: CheckCircle },
  ];

  const handleConnect = async () => {
    try {
      setConnecting(true);
      await initiateFanvueOAuth();
    } catch (e) {
      toast.error("Failed to start Fanvue OAuth: " + (e.message || "Unknown error"));
    } finally {
      setConnecting(false);
    }
  };

  const handleCreatePersona = async () => {
    if (!connectedCreator) return;
    if (!personaName.trim() || !personaText.trim()) {
      toast.error("Enter a persona name and instructions");
      return;
    }
    try {
      setCreatingPersona(true);
      await base44.entities.PersonaProfile.create({
        creator_profile_id: connectedCreator.id,
        display_name: personaName.trim(),
        instructions: personaText.trim(),
        active: true,
      });
      toast.success("Persona created");
      setHasPersona(true);
      setPersonaName("");
      setPersonaText("");
    } catch (e) {
      toast.error("Failed to create persona: " + (e.message || "Unknown error"));
    } finally {
      setCreatingPersona(false);
    }
  };

  const currentStep = step4Done ? 4 : !step3Done && step2Done ? 3 : !step2Done && step1Done ? 2 : 1;

  return (
    <div className="h-full overflow-y-auto scrollbar-thin bg-background">
      <div className="mx-auto max-w-xl px-6 py-12">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Sparkles className="h-7 w-7" />
          </div>
          <h1 className="font-heading text-3xl text-foreground">Welcome to Aurelius</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Let's get your workspace set up. This takes about 2 minutes.
          </p>
          {isTrial && (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
              <Sparkles className="h-3 w-3" />
              Free trial active
            </div>
          )}
        </div>

        {/* Progress indicator */}
        <div className="mb-10 flex items-center justify-between">
          {steps.map((step, i) => {
            const Icon = step.icon;
            const isCurrent = currentStep === step.num;
            return (
              <React.Fragment key={step.num}>
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${
                    step.done
                      ? "border-success bg-success/10 text-success"
                      : isCurrent
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-muted text-muted-foreground"
                  }`}>
                    {step.done ? <CheckCircle className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </div>
                  <span className={`text-[10px] font-medium ${isCurrent || step.done ? "text-foreground" : "text-muted-foreground"}`}>
                    {step.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`h-0.5 flex-1 mx-2 rounded-full ${steps[i + 1].done || (step.done && currentStep > step.num) ? "bg-success" : "bg-border"}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Step content */}
        <div className="rounded-xl border border-border bg-card p-6">
          {/* Step 1: Account created */}
          {currentStep <= 2 && !step2Done && (
            <div className="space-y-4">
              <div>
                <h2 className="font-heading text-xl text-foreground">Connect your Fanvue account</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This links Aurelius to your Fanvue creator account so we can sync your messages, fans, and vault. Your tokens are encrypted and never exposed to the browser.
                </p>
              </div>
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {connecting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Plug className="h-4 w-4" />
                    Connect Fanvue
                  </>
                )}
              </button>
              <p className="text-center text-xs text-muted-foreground">
                You'll be redirected to Fanvue to authorize access. We need scopes for messages, media, and insights.
              </p>
            </div>
          )}

          {/* Step 2: Fanvue connected, now set up persona */}
          {step2Done && !step3Done && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-success">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm font-medium">Fanvue connected as {connectedCreator?.display_name || "creator"}</span>
              </div>
              <div>
                <h2 className="font-heading text-xl text-foreground">Set up your AI persona</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  The AI will roleplay as this persona when chatting with your fans. Describe the voice, tone, personality, and any specific instructions.
                </p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">Persona name</label>
                  <input
                    value={personaName}
                    onChange={(e) => setPersonaName(e.target.value)}
                    placeholder="e.g. Your creator name"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">Persona instructions</label>
                  <textarea
                    value={personaText}
                    onChange={(e) => setPersonaText(e.target.value)}
                    placeholder="Describe your personality, tone, how you talk, what you like, how flirty or reserved you are, emoji style, etc."
                    rows={5}
                    className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <button
                  onClick={handleCreatePersona}
                  disabled={creatingPersona || !personaName.trim() || !personaText.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {creatingPersona ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Bot className="h-4 w-4" />
                      Create persona
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Done */}
          {step4Done && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
                <CheckCircle className="h-7 w-7" />
              </div>
              <div>
                <h2 className="font-heading text-xl text-foreground">You're all set!</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your workspace is ready. Head to the Inbox to start chatting with your fans, or configure automation on the Models page.
                </p>
              </div>
              <Link
                to="/"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Go to Inbox
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </div>

        {/* Skip link */}
        {!step4Done && (
          <div className="mt-4 text-center">
            <Link to="/" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
              Skip for now — I'll finish later
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}