"use client";
import * as React from "react";

export interface AvatarProps {
  name: string;
  color?: string;
  size?: number;
  src?: string;
  ring?: boolean;
}

export function Avatar({ name, color, size = 32, ring }: AvatarProps) {
  const ini = (name || "??")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const c = color || "#6366F1";
  return (
    <div
      className={`tsAvatar ${ring ? "tsAvatar-ring" : ""}`}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${c}, ${c}CC)`,
        fontSize: size * 0.4,
      }}
    >
      {ini}
    </div>
  );
}
