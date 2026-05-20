"use client";
import * as React from "react";
import { Icon } from "@/lib/icons";

// Floating tweaks panel — light/dark, density.
// Persists via localStorage; in a real app you'd wire to a user-preferences API.

const STORAGE_KEY = "synthire-tweaks";

interface Tweaks {
  theme: "dark" | "light";
  density: "comfortable" | "compact";
}

const DEFAULTS: Tweaks = { theme: "dark", density: "comfortable" };

function read(): Tweaks {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return DEFAULTS;
  }
}

export function useTweaks(): [Tweaks, (k: keyof Tweaks, v: any) => void] {
  const [tweaks, setTweaks] = React.useState<Tweaks>(DEFAULTS);

  React.useEffect(() => {
    const t = read();
    setTweaks(t);
    document.documentElement.dataset.theme = t.theme;
    document.documentElement.dataset.density = t.density;
  }, []);

  const set = React.useCallback((k: keyof Tweaks, v: any) => {
    setTweaks((prev) => {
      const next = { ...prev, [k]: v };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      document.documentElement.dataset.theme = next.theme;
      document.documentElement.dataset.density = next.density;
      return next;
    });
  }, []);

  return [tweaks, set];
}

export function TweaksPanel() {
  const [tweaks, setTweaks] = useTweaks();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        className="tsTweaksFab"
        onClick={() => setOpen((o) => !o)}
        aria-label="Open tweaks"
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          color: "var(--text)",
          boxShadow: "var(--shadow)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 50,
        }}
      >
        <Icon.Settings size={16} />
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 64,
            right: 16,
            width: 260,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 16,
            boxShadow: "var(--shadow-lg)",
            zIndex: 50,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontWeight: 500, fontSize: 13 }}>Tweaks</div>
            <button className="tsIconBtn" onClick={() => setOpen(false)} aria-label="Close">
              <Icon.X size={14} />
            </button>
          </div>

          <Section label="Theme">
            <Segmented
              value={tweaks.theme}
              onChange={(v) => setTweaks("theme", v)}
              options={[
                { value: "dark",  label: "Dark",  icon: <Icon.Moon size={12} /> },
                { value: "light", label: "Light", icon: <Icon.Sun size={12} /> },
              ]}
            />
          </Section>

          <Section label="Density">
            <Segmented
              value={tweaks.density}
              onChange={(v) => setTweaks("density", v)}
              options={[
                { value: "comfortable", label: "Comfortable" },
                { value: "compact",     label: "Compact" },
              ]}
            />
          </Section>
        </div>
      )}
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="tiny" style={{ marginBottom: 6, color: "var(--muted)" }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: React.ReactNode }[];
}) {
  return (
    <div
      style={{
        display: "flex",
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 3,
        gap: 2,
      }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            flex: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            padding: "5px 10px",
            borderRadius: 6,
            fontSize: 12,
            background: value === o.value ? "var(--surface)" : "transparent",
            color: value === o.value ? "var(--text)" : "var(--text-2)",
            boxShadow: value === o.value ? "0 1px 2px rgba(0,0,0,0.2)" : "none",
          }}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
