import React from "react";
import { Outlet } from "react-router-dom";
import Navigation from "@/components/Navigation";
import ReconnectBanner from "@/components/shared/ReconnectBanner";
import { useAIProcessor } from "@/hooks/useAIProcessor";
import { CreatorProvider } from "@/lib/creator-context";

export default function AppShell() {
  useAIProcessor();
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
      </div>
    </CreatorProvider>
  );
}