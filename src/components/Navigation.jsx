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
  Calendar,
  CircleDot,
  Stethoscope,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import LiveActivityBell from "@/components/shared/LiveActivityBell";

const navItems = [
  { to: "/", label: "Inbox", icon: Inbox },
  { to: "/models", label: "Models", icon: Users },
  { to: "/automation", label: "Automation", icon: Bot },
  { to: "/calendar", label: "Calendar", icon: Calendar },
  { to: "/media", label: "Media", icon: Image },
  { to: "/playground", label: "Playground", icon: FlaskConical },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/activity", label: "Activity", icon: Activity },
  { to: "/diagnostics", label: "Diagnostics", icon: Stethoscope },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Navigation() {
  return (
    <nav className="flex h-full w-16 flex-col items-center justify-between border-r border-border bg-sidebar py-4 lg:w-56">
      <div className="flex w-full flex-col items-center gap-1 px-2 lg:items-stretch lg:px-3">
        <div className="mb-4 flex items-center justify-center lg:justify-start lg:gap-2.5 lg:px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <span className="font-heading text-lg leading-none">A</span>
          </div>
          <span className="hidden font-heading text-lg text-sidebar-foreground lg:inline">
            Aurelius
          </span>
        </div>

        <div className="flex w-full flex-col gap-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
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

      <div className="flex w-full flex-col items-center gap-2 px-2 lg:items-stretch lg:px-3">
        <div className="flex items-center justify-center gap-2 lg:justify-end">
          <LiveActivityBell />
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}