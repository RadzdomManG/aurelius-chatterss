import React from "react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  success: "bg-success/15 text-success",
  error: "bg-destructive/15 text-destructive",
  warning: "bg-warning/15 text-warning",
  info: "bg-primary/15 text-primary",
  neutral: "bg-muted text-muted-foreground",
};

const DOTS = {
  success: "bg-success",
  error: "bg-destructive",
  warning: "bg-warning",
  info: "bg-primary",
  neutral: "bg-muted-foreground",
};

export default function StatusBadge({ status, label, variant = "neutral", dot = true }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        VARIANTS[variant] || VARIANTS.neutral
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", DOTS[variant] || DOTS.neutral)} />}
      {label || status}
    </span>
  );
}