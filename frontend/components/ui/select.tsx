"use client";
import * as React from "react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size" | "children"> {
  label?: React.ReactNode;
  error?: string | null;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
}

/**
 * Design-system <select>. Strips browser-native chrome via `appearance: none`
 * and renders a custom chevron, so it matches the visual weight of <Input>.
 *
 * Used wherever a native dropdown is acceptable; for searchable / multi-select
 * use cases, build a popover-based combobox separately.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, options, placeholder, className = "", value, ...rest }, ref) => (
    <label className={`tsField ${error ? "tsField-error" : ""} ${className}`}>
      {label && <span className="tsField-label">{label}</span>}
      <span className="tsField-input tsField-select">
        <select ref={ref} value={value ?? ""} {...rest}>
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="tsField-select-chevron" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </span>
      {(error || hint) && (
        <span className={error ? "tsField-errorMsg" : "tsField-hint"}>{error || hint}</span>
      )}
    </label>
  )
);
Select.displayName = "Select";
