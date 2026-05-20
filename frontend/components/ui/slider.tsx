"use client";
import * as React from "react";

export interface SliderProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  color?: string;
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  color = "var(--primary)",
  ...rest
}: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="tsSlider">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        style={{
          background: `linear-gradient(90deg, ${color} 0%, ${color} ${pct}%, var(--border) ${pct}%, var(--border) 100%)`,
        }}
        {...rest}
      />
    </div>
  );
}
