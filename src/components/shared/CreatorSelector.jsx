import React from "react";
import { ChevronDown, Check } from "lucide-react";
import { useCreator } from "@/lib/creator-context";

// Shared "choose model" selector. Shows a green dot for connected creators and
// a grey dot for disconnected ones so the operator understands empty vaults.
// Mounted on every creator-scoped page; the choice persists across navigation
// via the app-level CreatorProvider.
export default function CreatorSelector({ className = "", compact = false }) {
  const { creators, connByCreator, selectedCreator, selectedCreatorId, selectCreator } = useCreator();
  const [open, setOpen] = React.useState(false);

  if (creators.length === 0) return null;

  const connected = !!connByCreator[selectedCreator?.id]?.status && connByCreator[selectedCreator.id].status === "connected";

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${connected ? "bg-success" : "bg-muted-foreground/50"}`} />
        <span className="truncate max-w-[160px]">{selectedCreator?.display_name || "Select creator"}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className={`absolute z-40 mt-1 max-h-72 w-64 overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-lg scrollbar-thin ${compact ? "left-0" : "right-0"}`}>
            {creators.map((c) => {
              const conn = connByCreator[c.id];
              const isConn = conn?.status === "connected";
              return (
                <button
                  key={c.id}
                  onClick={() => { selectCreator(c.id); setOpen(false); }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <span className="flex flex-col">
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      <span className={`h-1.5 w-1.5 rounded-full ${isConn ? "bg-success" : "bg-muted-foreground/50"}`} />
                      {c.display_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      @{c.username || "unknown"} · {isConn ? "Connected" : "Disconnected"}
                    </span>
                  </span>
                  {c.id === selectedCreatorId && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}