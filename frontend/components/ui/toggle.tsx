"use client";
import * as React from "react";
import { Icon } from "@/lib/icons";

export interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: React.ReactNode;
  size?: "sm" | "md";
}

export function Toggle({ checked, onChange, label, size = "md" }: ToggleProps) {
  return (
    <label className={`tsToggle tsToggle-${size}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="tsToggle-track">
        <span className="tsToggle-thumb" />
      </span>
      {label && <span className="tsToggle-label">{label}</span>}
    </label>
  );
}

export interface CheckboxProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: React.ReactNode;
}

export function Checkbox({ checked, onChange, label }: CheckboxProps) {
  return (
    <label className="tsCheckbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="tsCheckbox-box">{checked && <Icon.Check size={12} stroke={3} />}</span>
      {label && <span>{label}</span>}
    </label>
  );
}
