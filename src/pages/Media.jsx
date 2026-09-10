import React from "react";
import { base44 } from "@/api/base44Client";
import { Image as ImageIcon, Film, Folder, Plug } from "lucide-react";
import EmptyState from "@/components/shared/EmptyState";

export default function Media() {
  const [hasConnection, setHasConnection] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      const conns = await base44.entities.FanvueConnection.list("-created_date", 10);
      setHasConnection(conns.some((c) => c.status === "connected"));
    } catch (err) { /* ignore */ }
    finally { setLoading(false); }
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" /></div>;
  }

  if (!hasConnection) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState icon={Plug} title="Connect Fanvue to view media" description="Media and vault content are loaded from the Fanvue API (read:media scope). Connect a creator account to begin." actionLabel="Go to Models" actionTo="/models" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="mb-1 font-heading text-3xl text-foreground">Media</h1>
        <p className="mb-6 text-sm text-muted-foreground">Fanvue creator media and vault content</p>

        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Folder className="mx-auto mb-3 h-12 w-12 text-muted-foreground/40" />
          <h3 className="mb-1 font-heading text-lg text-foreground">Vault & Media</h3>
          <p className="mb-4 text-sm text-muted-foreground">Fanvue vault folders and media items are loaded via the Fanvue API (read:media scope).</p>
          <p className="text-xs text-muted-foreground">Backend function required to fetch media data (Builder+ plan). The function calls GET /media endpoints and displays thumbnails, media types, and purchase metadata.</p>
        </div>
      </div>
    </div>
  );
}