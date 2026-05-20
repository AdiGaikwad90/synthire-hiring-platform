"use client";
import * as React from "react";

type BadgeVariant = "neutral" | "primary" | "success" | "warning" | "danger" | "info" | "ai";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
}

export function Badge({ variant = "neutral", dot, children, className = "", ...rest }: BadgeProps) {
  return (
    <span className={`tsBadge tsBadge-${variant} ${className}`} {...rest}>
      {dot && <span className="tsBadge-dot" />}
      {children}
    </span>
  );
}
