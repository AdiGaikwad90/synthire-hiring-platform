"use client";
import * as React from "react";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}

export function IconButton({ icon, label, active, ...rest }: IconButtonProps) {
  return (
    <button className={`tsIconBtn ${active ? "tsIconBtn-active" : ""}`} aria-label={label} {...rest}>
      {icon}
    </button>
  );
}
