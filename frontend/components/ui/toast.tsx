"use client";
import * as React from "react";
import { Icon } from "@/lib/icons";

interface Toast {
  id: string;
  message: React.ReactNode;
  variant?: "success" | "error" | "info";
  duration?: number;
}

type ToastInput = Omit<Toast, "id">;

const ToastContext = React.createContext<((t: ToastInput) => void) | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const push = React.useCallback((t: ToastInput) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((arr) => [...arr, { id, ...t }]);
    setTimeout(() => setToasts((arr) => arr.filter((x) => x.id !== id)), t.duration || 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="tsToasts">
        {toasts.map((t) => (
          <div key={t.id} className={`tsToast tsToast-${t.variant || "success"}`}>
            {t.variant === "error" ? (
              <Icon.X size={16} stroke={3} />
            ) : (
              <Icon.Check size={16} stroke={3} />
            )}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  // Always callable — no-op if provider isn't mounted (avoids crashing pages that
  // render outside the recruiter layout).
  return ctx || ((_: ToastInput) => {});
}
