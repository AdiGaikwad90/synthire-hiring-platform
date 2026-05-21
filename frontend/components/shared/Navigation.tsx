"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  const displayName = user?.name ?? "Loading...";
  const displayRole =
    user?.role === "recruiter"
      ? "Recruiter"
      : user?.role === "admin"
      ? "Admin"
      : user?.role === "interviewer"
      ? "Interviewer"
      : "";

  return (
    <header className="tsTopBar">
      <div className="tsTopBar-crumbs">
        <span style={{ color: "var(--muted)" }}>Synthire</span>
        <Icon.ChevronRight size={12} />
        <span style={{ textTransform: "capitalize" }}>{title}</span>
        {segments[1] && (
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
        <div
          className="tsTopBar-user"
          style={{ cursor: "pointer" }}
          onClick={logout}
          title="Sign out"
        >
          <Avatar name={displayName} color="#6366F1" size={28} />
          <div className="tsTopBar-userMeta">
            <div className="tsTopBar-userName">{displayName}</div>
            <div className="tsTopBar-userRole">{displayRole}</div>
          </div>
          <Icon.ChevronDown size={14} />
        </div>
      </div>
    </header>
  );
}
