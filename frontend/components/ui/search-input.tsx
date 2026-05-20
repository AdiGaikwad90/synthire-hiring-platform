"use client";
import * as React from "react";
import { Icon } from "@/lib/icons";

export interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  kbd?: string;
  style?: React.CSSProperties;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  kbd = "⌘K",
  style,
}: SearchInputProps) {
  return (
    <div className="tsSearch" style={style}>
      <Icon.Search size={15} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {kbd && <span className="tsSearch-kbd">{kbd}</span>}
    </div>
  );
}
