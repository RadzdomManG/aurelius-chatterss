import React from "react";
import { NavLink } from "react-router-dom";
import {
  Inbox,
  Users,
  Bot,
  Image,
  FlaskConical,
  BarChart3,
  Activity,
  Settings,
  CircleDot,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

// Pages not yet built are marked disabled — they show in nav as "coming soon"
const navItems = [
  { to: "/", label: "Inbox", icon: Inbox, disabled: false },
  { to: "/models", label: "Models", icon: Users, disabled: true },
  { to: "/automation", label: "Automation", icon: Bot, disabled: true },
  { to: "/media", label: "Media", icon: Image, disabled: true },
  { to: "/playground", label: "Playground", icon: FlaskConical, disabled: true },
  { to: "/analytics", label: "Analytics", icon: BarChart3, disabled: true },
  { to: "/activity", label: "Activity", icon: Activity, disabled: true },
  { to: "/settings", label: "Settings", icon: Settings, disabled: true },
];

export default function Navigation() {
  return (
    <nav className="flex h-full w-16 flex-col items-center justify-between border-r border-border bg-sidebar py-4 lg:w-56">
      <div className="flex w-full flex-col items-center gap-1 px-2 lg:items-stretch lg:px-3">
        {/* Logo */}
        <div className="mb-4 flex items-center justify-center lg:justify-start lg:gap-2.5 lg:px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <span className="font-heading text-lg leading-none">A</span>
          </div>
          <span className="hidden font-heading text-lg text-sidebar-foreground lg:inline">
            Aurelius
          </span>
        </div>

        {/* Nav items */}
        <div className="flex w-full flex-col gap-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;

            if (item.disabled) {
              return (
                <div
                  key={item.to}
                  className="flex cursor-not-allowed items-center justify-center rounded-md px-2.5 py-2 text-sm text-muted-foreground/40 lg:justify-start lg:gap-3"
                  title="Coming soon"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="hidden lg:inline">{item.label}</span>
                  <span className="ml-auto hidden text-[10px] uppercase tracking-wide lg:inline">
                    soon
                  </span>
                </div>
              );
            }

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `flex items-center justify-center rounded-md px-2.5 py-2 text-sm transition-colors lg:justify-start lg:gap-3 ${
                    isActive
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                  }`
                }
                title={item.label}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden lg:inline">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </div>

      {/* Bottom: connection status + theme + user */}
      <div className="flex w-full flex-col items-center gap-2 px-2 lg:items-stretch lg:px-3">
        <div className="hidden items-center gap-2 rounded-md px-2.5 py-2 text-xs text-muted-foreground lg:flex">
          <CircleDot className="h-3 w-3 text-success" />
          <span>Fanvue: Mock</span>
        </div>
        <div className="flex items-center justify-center lg:justify-end">
          <ThemeToggle />
        </div>
        <div className="hidden items-center gap-2 rounded-md px-2.5 py-2 text-xs text-muted-foreground lg:flex">
          <div className="h-6 w-6 rounded-full bg-primary/20" />
          <span>Operator</span>
        </div>
      </div>
    </nav>
  );
}