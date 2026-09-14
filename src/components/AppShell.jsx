import React from "react";
import { Outlet } from "react-router-dom";
import Navigation from "@/components/Navigation";
import ReconnectBanner from "@/components/shared/ReconnectBanner";
import { useAIProcessor } from "@/hooks/useAIProcessor";
import { CreatorProvider } from "@/lib/creator-context";
import CopilotPanel from "@/components/copilot/CopilotPanel";
import { Sparkles } from "lucide-react";

export default function AppShell() {
  useAIProcessor();
  const [copilotOpen, setCopilotOpen] = React.useState(false);
  return (
    <CreatorProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Navigation />
        <main className="flex flex-1 flex-col overflow-hidden">
          <ReconnectBanner />
          <div className="flex-1 overflow-hidden">
            <Outlet />
          </div>
        </main>

        {/* Floating Copilot button */}
        <button
          onClick={() => setCopilotOpen(true)}
          className="fixed bottom-6 right-6 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
          title="Open Copilot"
        >
          <Sparkles className="h-5 w-5" />
        </button>

        {/* Slide-out Copilot panel */}
        <CopilotPanel open={copilotOpen} onClose={() => setCopilotOpen(false)} />
      </div>
    </CreatorProvider>
  );
}