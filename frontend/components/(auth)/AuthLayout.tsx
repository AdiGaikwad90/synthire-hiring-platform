"use client";
import * as React from "react";
import { Icon } from "@/lib/icons";
import { Avatar } from "@/components/ui";
import { Logo } from "@/components/shared/Logo";

interface AuthLayoutProps {
  children: React.ReactNode;
  /** Heading shown on the left value-prop panel */
  heading?: React.ReactNode;
  /** Subtitle under the heading */
  subtitle?: React.ReactNode;
}

const DEFAULT_VPS = [
  { icon: <Icon.Zap size={16} />, t: "Screen 1,000s of resumes in minutes" },
  { icon: <Icon.Target size={16} />, t: "AI-powered candidate matching" },
  { icon: <Icon.Kanban size={16} />, t: "Manage your entire pipeline in one place" },
];

/**
 * Two-pane layout for auth screens. Left pane is a brand-coloured value-prop
 * panel; right pane hosts the form passed via `children`.
 */
export function AuthLayout({ children, heading, subtitle }: AuthLayoutProps) {
  return (
    <div className="tsLogin">
      <div className="tsLogin-left">
        <div className="tsLogin-leftBg" />
        <div className="tsLogin-leftContent">
          <div style={{ display: "flex", alignItems: "center", gap: 9, color: "white" }}>
            <Logo />
          </div>
          <h1 className="tsLogin-h">
            {heading ?? (
              <>
                Welcome back to <span className="ai-text">Synthire</span>
              </>
            )}
          </h1>
          <p className="tsLogin-sub">
            {subtitle ??
              "The applicant tracking system your hiring team has been waiting for. AI-native, calmly designed, ridiculously fast."}
          </p>

          <div className="tsLogin-vps">
            {DEFAULT_VPS.map((vp) => (
              <div key={vp.t} className="tsLogin-vp">
                <div className="tsLogin-vp-icon">{vp.icon}</div>
                <div style={{ paddingTop: 6, color: "white", fontSize: 14 }}>{vp.t}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="tsLogin-illu">
          <div className="tsLogin-illuCard" style={{ top: 20, left: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Avatar name="Priya Sharma" color="#EC4899" size={22} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 11.5 }}>Priya Sharma</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.6)" }}>Senior Engineer</div>
              </div>
              <span
                style={{
                  background: "rgba(16,185,129,0.2)",
                  color: "#34D399",
                  padding: "1px 5px",
                  borderRadius: 4,
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                }}
              >
                92
              </span>
            </div>
          </div>
          <div className="tsLogin-illuCard" style={{ top: 90, left: 120, animationDelay: "1.5s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon.Sparkles size={14} style={{ color: "#A855F7" }} />
              <div style={{ flex: 1, fontSize: 11.5 }}>3 high-potential matches found</div>
            </div>
          </div>
          <div className="tsLogin-illuCard" style={{ top: 0, left: 240, animationDelay: "0.8s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Icon.Check size={12} stroke={3} style={{ color: "#34D399" }} />
              <span style={{ fontSize: 11.5 }}>Interview scheduled</span>
            </div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.6)" }}>Tomorrow at 2:30 PM</div>
          </div>
        </div>
      </div>

      <div className="tsLogin-right">{children}</div>
    </div>
  );
}
