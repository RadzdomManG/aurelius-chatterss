import React from "react";
import { Lock } from "lucide-react";

export default function ScopeGate({ missing = [], title = "Permission required", description }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-warning/40 bg-warning/5 px-6 py-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-warning/15">
        <Lock className="h-6 w-6 text-warning" />
      </div>
      <h2 className="mb-1 font-heading text-xl text-foreground">{title}</h2>
      <p className="mb-1 text-sm text-muted-foreground">
        Re-authorize Fanvue with: <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{(missing || []).join(", ")}</code>
      </p>
      <p className="mb-5 max-w-md text-xs text-muted-foreground">
        {description || "Go to Models to reconnect your account with these scopes enabled."}
      </p>
      <a
        href="/models"
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Go to Models
      </a>
    </div>
  );
}