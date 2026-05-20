"use client";
import * as React from "react";

export interface TooltipProps {
  text: string;
  children: React.ReactNode;
  side?: "top" | "bottom";
}

export function Tooltip({ text, children, side = "top" }: TooltipProps) {
  return (
    <span className="tsTip-wrap">
      {children}
      <span className={`tsTip tsTip-${side}`}>{text}</span>
    </span>
  );
}
