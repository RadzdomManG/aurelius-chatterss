import React from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { CheckCircle, XCircle, Loader2, ArrowRight, KeyRound, MessageSquare } from "lucide-react";

export default function FanvueCallback() {
  const [status, setStatus] = React.useState("processing");
  const [error, setError] = React.useState(null);
  const [sessionInfo, setSessionInfo] = React.useState(null);
  const navigate = useNavigate();

  React.useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const errParam = params.get("error");
    const errorDesc = params.get("error_description");

    if (errParam) {
      setStatus("error");
      setError(errorDesc || errParam);
      return;
    }

    if (!code || !state) {
      setStatus("error");
      setError("Missing authorization code or state parameter");
      return;
    }

    try {
      // Find the OAuth session by state
      const sessions = await base44.entities.OAuthSession.filter({ state }, "-created_date", 1);
      const session = sessions[0];

      if (!session) {
        setStatus("error");
        setError("No matching OAuth session found. Please try connecting again from the Models page.");
        return;
      }

      // Store the auth code and mark as exchanging
      await base44.entities.OAuthSession.update(session.id, {
        auth_code: code,
        status: "exchanging",
      });

      // Log activity
      await base44.entities.ActivityLog.create({
        event_type: "fanvue.auth.callback",
        status: "info",
        message: "Fanvue authorization code received. Token exchange pending.",
        metadata: { session_id: session.id },
      });

      setSessionInfo({ sessionId: session.id });
      setStatus("success");
      toast.success("Authorization received!");
    } catch (err) {
      setStatus("error");
      setError(err.message || "Failed to process authorization callback");
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="max-w-md text-center">
        {status === "processing" && (
          <>
            <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-primary" />
            <h2 className="font-heading text-xl text-foreground">Processing Authorization...</h2>
            <p className="mt-1 text-sm text-muted-foreground">Verifying your Fanvue authorization</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success/15">
              <CheckCircle className="h-8 w-8 text-success" />
            </div>
            <h2 className="font-heading text-xl text-foreground">Authorization Received!</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your Fanvue authorization code has been captured. To complete the connection and start syncing,
              ask the assistant to <strong>complete the Fanvue OAuth token exchange</strong>.
            </p>

            <div className="mt-6 rounded-lg border border-border bg-card p-4 text-left">
              <div className="mb-2 flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Connection Status</span>
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>Authorization code: <span className="font-mono">received</span></p>
                <p>Token exchange: <span className="text-warning">pending</span></p>
                <p>Session ID: <span className="font-mono">{sessionInfo?.sessionId?.slice(0, 12)}...</span></p>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2">
              <button
                onClick={() => navigate("/models")}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Go to Models <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/15">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="font-heading text-xl text-foreground">Connection Failed</h2>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <button
              onClick={() => navigate("/models")}
              className="mt-6 inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
            >
              <ArrowRight className="h-4 w-4" /> Back to Models
            </button>
          </>
        )}
      </div>
    </div>
  );
}