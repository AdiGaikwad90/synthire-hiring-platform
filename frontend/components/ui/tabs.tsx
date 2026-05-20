"use client";
import * as React from "react";

export interface TabsTab {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  count?: number;
}

export interface TabsProps {
  tabs: TabsTab[];
  active: string;
  onChange: (id: string) => void;
  variant?: "default" | "pill";
}

export function Tabs({ tabs, active, onChange, variant = "default" }: TabsProps) {
  return (
    <div className={`tsTabs tsTabs-${variant}`}>
      {tabs.map((t) => (
        <button
          key={t.id}
          className={`tsTab ${active === t.id ? "tsTab-active" : ""}`}
          onClick={() => onChange(t.id)}
        >
          {t.icon}
          <span>{t.label}</span>
          {t.count != null && <span className="tsTab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
