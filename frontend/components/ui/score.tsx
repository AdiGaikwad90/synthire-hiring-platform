"use client";
import * as React from "react";

export interface ScoreRingProps {
  score: number;
  size?: number;
  stroke?: number;
  label?: string;
}

export function ScoreRing({ score, size = 80, stroke = 8, label }: ScoreRingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const color =
    score >= 80 ? "var(--success)" : score >= 60 ? "var(--warning)" : "var(--danger)";
  return (
    <div className="tsRing" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--border)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="tsRing-content">
        <div className="tsRing-num">{score}</div>
        {label && <div className="tsRing-label">{label}</div>}
      </div>
    </div>
  );
}

export interface ScoreBarProps {
  label?: React.ReactNode;
  value: number;
  color?: string;
}

export function ScoreBar({ label, value, color }: ScoreBarProps) {
  const c =
    color ||
    (value >= 80 ? "var(--success)" : value >= 60 ? "var(--warning)" : "var(--danger)");
  return (
    <div className="tsScoreBar">
      <div className="tsScoreBar-head">
        <span className="tsScoreBar-label">{label}</span>
        <span className="tsScoreBar-val mono">{value}%</span>
      </div>
      <div className="tsScoreBar-track">
        <div className="tsScoreBar-fill" style={{ width: `${value}%`, background: c }} />
      </div>
    </div>
  );
}

export interface ScorePillProps {
  score: number;
}

export function ScorePill({ score }: ScorePillProps) {
  const tone = score >= 80 ? "success" : score >= 60 ? "warning" : "danger";
  return (
    <span className={`tsScorePill tsScorePill-${tone}`}>
      <span className="mono">{score}</span>
    </span>
  );
}
