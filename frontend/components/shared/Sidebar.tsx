"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Logo } from "./Logo";

export const NAV_ITEMS = [
  { href: "/dashboard",  label: "Dashboard",  icon: <Icon.Home size={17} /> },
  { href: "/jobs",       label: "Jobs",       icon: <Icon.Briefcase size={17} />, count: 12 },
  { href: "/candidates", label: "Candidates", icon: <Icon.Users size={17} />, count: 247 },
  { href: "/pipeline",   label: "Pipeline",   icon: <Icon.Kanban size={17} /> },
  { href: "/interviews", label: "Interviews", icon: <Icon.Calendar size={17} />, count: 5 },
  { href: "/analytics",  label: "Analytics",  icon: <Icon.Chart size={17} /> },
  { href: "/settings",   label: "Settings",   icon: <Icon.Settings size={17} /> },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + "/");

  return (
    <aside className={`tsSidebar ${collapsed ? "tsSidebar-collapsed" : ""}`}>
      <div className="tsSidebar-top">
        <Logo collapsed={collapsed} />
        <button
          className="tsIconBtn tsSidebar-collapse"
          onClick={onToggle}
          aria-label="Collapse sidebar"
        >
          <Icon.PanelLeft size={16} />
        </button>
      </div>

      <nav className="tsSidebar-nav">
        {!collapsed && (
          <div className="tiny" style={{ padding: "8px 12px 4px", color: "var(--faint)" }}>
            Workspace
          </div>
        )}
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`tsNavItem ${isActive(item.href) ? "tsNavItem-active" : ""}`}
            title={collapsed ? item.label : ""}
          >
            <span className="tsNavItem-icon">{item.icon}</span>
            {!collapsed && (
              <>
                <span className="tsNavItem-label">{item.label}</span>
                {item.count != null && <span className="tsNavItem-count">{item.count}</span>}
              </>
            )}
          </Link>
        ))}
      </nav>

      <div className="tsSidebar-foot">
        {!collapsed && (
          <div className="tsUpgrade">
            <div className="tsUpgrade-head">
              <Icon.Sparkles size={14} /> <span>AI Credits</span>
            </div>
            <div className="tsUpgrade-bar">
              <div className="tsUpgrade-fill" style={{ width: "68%" }} />
            </div>
            <div className="tsUpgrade-meta">
              <span className="mono">3,412</span>{" "}
              <span style={{ color: "var(--muted)" }}>/ 5,000 left</span>
            </div>
            <button className="tsUpgrade-btn">Upgrade plan →</button>
          </div>
        )}
        <button className={`tsNavItem ${collapsed ? "" : "tsNavItem-thin"}`}>
          <span className="tsNavItem-icon">
            <Icon.Help size={17} />
          </span>
          {!collapsed && <span className="tsNavItem-label">Help & docs</span>}
        </button>
      </div>
    </aside>
  );
}
