"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Avatar, SearchInput, IconButton } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";

interface NavigationProps {
  onSearchClick?: () => void;
}

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/jobs": "Jobs",
  "/candidates": "Candidates",
  "/pipeline": "Pipeline",
  "/interviews": "Interviews",
  "/analytics": "Analytics",
  "/settings": "Settings",
};

export function Navigation({ onSearchClick }: NavigationProps) {
  const pathname = usePathname() || "/dashboard";
  const segments = pathname.split("/").filter(Boolean);
  const root = "/" + (segments[0] || "");
  const title = TITLES[root] || segments[0] || "";
  const { user, logout } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const displayName = user?.name ?? "Loading...";
  const displayRole =
    user?.role === "recruiter"
      ? "Recruiter"
      : user?.role === "admin"
      ? "Admin"
      : user?.role === "interviewer"
      ? "Interviewer"
      : "";

  React.useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <header className="tsTopBar">
      <div className="tsTopBar-crumbs">
        <span style={{ color: "var(--muted)" }}>Synthire</span>
        <Icon.ChevronRight size={12} />
        <span style={{ textTransform: "capitalize" }}>{title}</span>
        {segments[1] && !/^[a-zA-Z0-9_-]{13,}$/.test(segments[1]) && (
          <>
            <Icon.ChevronRight size={12} />
            <span style={{ textTransform: "capitalize" }}>{segments[1]}</span>
          </>
        )}
      </div>

      <div className="tsTopBar-search" onClick={onSearchClick}>
        <SearchInput
          value=""
          onChange={() => {}}
          placeholder="Search candidates, jobs, interviews…"
          kbd="⌘K"
        />
      </div>

      <div className="tsTopBar-right">
        <IconButton icon={<Icon.Zap size={16} />} label="What's new" />
        <button className="tsIconBtn" aria-label="Notifications" style={{ position: "relative" }}>
          <Icon.Bell size={16} />
          <span className="tsTopBar-dot" />
        </button>
        <div className="tsTopBar-divider" />
        <div ref={menuRef} style={{ position: "relative" }}>
          <div
            className="tsTopBar-user"
            style={{ cursor: "pointer" }}
            onClick={() => setMenuOpen(o => !o)}
          >
            <Avatar name={displayName} color="#6366F1" size={28} />
            <div className="tsTopBar-userMeta">
              <div className="tsTopBar-userName">{displayName}</div>
              <div className="tsTopBar-userRole">{displayRole}</div>
            </div>
            <Icon.ChevronDown size={14} style={{ transition: 'transform 0.15s', transform: menuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}/>
          </div>
          {menuOpen && (
            <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, minWidth: 180, boxShadow: "0 8px 24px rgba(0,0,0,0.18)", zIndex: 200, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{displayName}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{user?.email}</div>
              </div>
              <div style={{ padding: "6px 0" }}>
                <button onClick={() => { setMenuOpen(false); router.push('/settings'); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", color: "var(--text)", fontSize: 13 }}>
                  <Icon.Settings size={14}/> Settings
                </button>
                <div style={{ margin: "4px 0", height: 1, background: "var(--border)" }}/>
                <button onClick={() => { setMenuOpen(false); logout(); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: 13 }}>
                  <Icon.Logout size={14}/> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
