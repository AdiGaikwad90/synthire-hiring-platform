"use client";
import * as React from "react";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: React.ReactNode;
  error?: string | null;
  hint?: string;
  icon?: React.ReactNode;
  suffix?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, icon, suffix, className = "", ...rest }, ref) => (
    <label className={`tsField ${error ? "tsField-error" : ""} ${className}`}>
      {label && <span className="tsField-label">{label}</span>}
      <span className="tsField-input">
        {icon && <span className="tsField-icon">{icon}</span>}
        <input ref={ref} {...rest} />
        {suffix && <span className="tsField-suffix">{suffix}</span>}
      </span>
      {(error || hint) && (
        <span className={error ? "tsField-errorMsg" : "tsField-hint"}>{error || hint}</span>
      )}
    </label>
  )
);
Input.displayName = "Input";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: React.ReactNode;
  hint?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hint, maxLength, value = "", onChange, className = "", ...rest }, ref) => {
    const v = (value as string) || "";
    return (
      <label className={`tsField ${className}`}>
        {label && <span className="tsField-label">{label}</span>}
        <textarea ref={ref} value={v} onChange={onChange} maxLength={maxLength} {...rest} />
        {(hint || maxLength) && (
          <span className="tsField-hint" style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{hint}</span>
            {maxLength && (
              <span>
                {v.length}/{maxLength}
              </span>
            )}
          </span>
        )}
      </label>
    );
  }
);
Textarea.displayName = "Textarea";
