import React from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { CheckCircle, XCircle, Loader2, ArrowRight } from "lucide-react";

export default function FanvueCallback() {
  const [status, setStatus] = React.useState("processing");
  const [error, setError] = React.useState(null);
  const [creatorName, setCreatorName] = React.useState(null);
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
      // Exchange the authorization code for tokens via the backend function
      const res = await base44.functions.invoke("fanvue-auth", {
        action: "exchange",
        code,
        state,
      });

      if (res.data?.success) {
        setStatus("success");
        setCreatorName(res.data.creatorName || res.data.creatorHandle);
        toast.success("Fanvue account connected!");
      } else {
        setStatus("error");
        setError(res.data?.error || "Token exchange failed");
      }
    } catch (err) {
      setStatus("error");
      setError(err.response?.data?.error || err.message || "Failed to complete Fanvue connection");
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="max-w-md text-center">
        {status === "processing" && (
          <>
            <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-primary" />
            <h2 className="font-heading text-xl text-foreground">Connecting Fanvue...</h2>
            <p className="mt-1 text-sm text-muted-foreground">Exchanging authorization code for access tokens</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success/15">
              <CheckCircle className="h-8 w-8 text-success" />
            </div>
            <h2 className="font-heading text-xl text-foreground">Fanvue Connected!</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {creatorName ? `Account "${creatorName}" is now connected.` : "Your Fanvue account is now connected."}
              {" "}Run a sync from the Models page to pull in your conversations.
            </p>
            <button
              onClick={() => navigate("/models")}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Go to Models <ArrowRight className="h-4 w-4" />
            </button>
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