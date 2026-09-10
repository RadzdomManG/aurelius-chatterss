import React from "react";
import { Outlet } from "react-router-dom";
import Navigation from "@/components/Navigation";
import { useAIProcessor } from "@/hooks/useAIProcessor";

export default function AppShell() {
  useAIProcessor();
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Navigation />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}