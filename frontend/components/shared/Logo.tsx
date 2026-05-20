"use client";
import * as React from "react";

interface LogoProps {
  collapsed?: boolean;
}

export function Logo({ collapsed }: LogoProps) {
  return (
    <div className="tsLogo">
      <div className="tsLogo-mark">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <defs>
            <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#A855F7" />
              <stop offset="100%" stopColor="#3B82F6" />
            </linearGradient>
          </defs>
          <path d="M12 2L4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4z" fill="url(#logoGrad)" />
          <path
            d="M9 11l2 2 4-4"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>
      {!collapsed && (
        <span className="tsLogo-name">
          TalentScout
          <span style={{ color: "var(--muted)", fontWeight: 400 }}> AI</span>
        </span>
      )}
    </div>
  );
}
