"use client";
import * as React from "react";
import { Icon } from "@/lib/icons";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  side?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 560,
  side = false,
}: ModalProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="tsModalBackdrop" onClick={onClose}>
      <div
        className={`tsModal ${side ? "tsModal-side" : "tsModal-center"}`}
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tsModal-head">
          <div>
            {title && <div className="h3">{title}</div>}
            {subtitle && (
              <div className="small" style={{ marginTop: 4 }}>
                {subtitle}
              </div>
            )}
          </div>
          <button className="tsIconBtn" onClick={onClose} aria-label="Close">
            <Icon.X size={18} />
          </button>
        </div>
        <div className="tsModal-body">{children}</div>
        {footer && <div className="tsModal-foot">{footer}</div>}
      </div>
    </div>
  );
}
