"use client";
import * as React from "react";
import type { Stage } from "@/lib/types";
import { STAGES, STAGE_LABELS } from "@/lib/stages";

// Names come from lib/stages.ts, the one list of stages; only the colour is local.
export const STAGE_META = Object.fromEntries(
  STAGES.map((stage) => [stage, { label: STAGE_LABELS[stage], color: `var(--stage-${stage})` }]),
) as Record<Stage, { label: string; color: string }>;

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
