"use client";
import * as React from "react";
import { Icon } from "@/lib/icons";

export interface AIPillProps {
  children: React.ReactNode;
}

export function AIPill({ children }: AIPillProps) {
  return (
    <span className="tsAIPill">
      <Icon.Sparkles size={11} />
      <span>{children}</span>
    </span>
  );
}
