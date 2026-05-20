"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Avatar, SearchInput, IconButton } from "@/components/ui";

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

  return (
    <header className="tsTopBar">
      <div className="tsTopBar-crumbs">
        <span style={{ color: "var(--muted)" }}>Acme Inc.</span>
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
        <Link href="/interviewer" className="tsTopBar-user">
          <Avatar name="Sarah Chen" color="#6366F1" size={28} />
          <div className="tsTopBar-userMeta">
            <div className="tsTopBar-userName">Sarah Chen</div>
            <div className="tsTopBar-userRole">Senior Recruiter</div>
          </div>
          <Icon.ChevronDown size={14} />
        </Link>
      </div>
    </header>
  );
}
