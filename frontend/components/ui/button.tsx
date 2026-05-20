"use client";
import * as React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "ai";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
  loading?: boolean;
}

const sizeMap: Record<Size, string> = { sm: "tsBtn-sm", md: "tsBtn-md", lg: "tsBtn-lg" };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", icon, children, className = "", loading, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      className={`tsBtn tsBtn-${variant} ${sizeMap[size]} ${className}`}
      disabled={loading || disabled}
      {...rest}
    >
      {loading ? <span className="tsBtn-spinner" /> : icon}
      {children && <span>{children}</span>}
    </button>
  )
);
Button.displayName = "Button";
