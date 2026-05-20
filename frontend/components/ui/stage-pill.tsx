"use client";
import * as React from "react";
import type { Stage } from "@/lib/types";

export const STAGE_META: Record<Stage, { label: string; color: string }> = {
  new:         { label: "New",          color: "var(--stage-new)" },
  shortlisted: { label: "Shortlisted",  color: "var(--stage-shortlisted)" },
  scheduled:   { label: "Scheduled",    color: "var(--stage-scheduled)" },
  inprogress:  { label: "In Progress",  color: "var(--stage-inprogress)" },
  feedback:    { label: "Feedback",     color: "var(--stage-feedback)" },
  hired:       { label: "Hired",        color: "var(--stage-hired)" },
  rejected:    { label: "Rejected",     color: "var(--stage-rejected)" },
};

export interface StagePillProps {
  stage: Stage;
}

export function StagePill({ stage }: StagePillProps) {
  const m = STAGE_META[stage] || { label: stage as string, color: "var(--muted)" };
  return (
    <span className="tsStage">
      <span
        className="tsStage-dot"
        style={{ background: m.color, boxShadow: `0 0 8px ${m.color}` }}
      />
      <span>{m.label}</span>
    </span>
  );
}
