import React from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

export default function FanvueCallback() {
  const [status, setStatus] = React.useState("processing");
  const [error, setError] = React.useState(null);
  const navigate = useNavigate();

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const errParam = params.get("error");

    if (errParam) {
      setStatus("error");
      setError(errParam);
      return;
    }

    if (!code || !state) {
      setStatus("error");
      setError("Missing authorization code or state");
      return;
    }

    exchangeCode(code, state);
  }, []);

  const exchangeCode = async (code, state) => {
    try {
      const res = await base44.functions.invoke("fanvue-auth", { action: "callback", code, state });
      setStatus("success");
      toast.success("Fanvue connected successfully!");
      setTimeout(() => navigate("/models"), 2000);
    } catch (err) {
      setStatus("error");
      setError(err.response?.data?.message || err.message || "Failed to exchange authorization code");
      toast.error("Fanvue connection failed — backend function required (Builder+ plan)");
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center">
      {status === "processing" && (
        <>
          <Loader2 className="mb-4 h-12 w-12 animate-spin text-primary" />
          <h2 className="font-heading text-xl text-foreground">Connecting Fanvue...</h2>
          <p className="mt-1 text-sm text-muted-foreground">Exchanging authorization code for tokens</p>
        </>
      )}
      {status === "success" && (
        <>
          <CheckCircle className="mb-4 h-12 w-12 text-success" />
          <h2 className="font-heading text-xl text-foreground">Fanvue Connected!</h2>
          <p className="mt-1 text-sm text-muted-foreground">Redirecting to Models...</p>
        </>
      )}
      {status === "error" && (
        <>
          <XCircle className="mb-4 h-12 w-12 text-destructive" />
          <h2 className="font-heading text-xl text-foreground">Connection Failed</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">{error}</p>
          <p className="mt-4 text-xs text-muted-foreground">Fanvue OAuth requires a backend function (Builder+ plan) to exchange the authorization code for tokens.</p>
          <button onClick={() => navigate("/models")} className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Back to Models
          </button>
        </>
      )}
    </div>
  );
}