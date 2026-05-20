"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Avatar } from "@/components/ui";
import { CANDIDATES, JOBS } from "@/lib/data";
import { NAV_ITEMS } from "./Sidebar";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [q, setQ] = React.useState("");

  const allItems = [
    ...NAV_ITEMS.map((n) => ({
      id: n.href,
      label: n.label,
      type: "Nav",
      icon: n.icon,
      action: () => {
        router.push(n.href);
        onClose();
      },
    })),
    {
      id: "newjob",
      label: "Create new job…",
      type: "Action",
      icon: <Icon.Plus size={16} />,
      action: () => {
        router.push("/jobs/new");
        onClose();
      },
    },
    {
      id: "upload",
      label: "Upload resumes…",
      type: "Action",
      icon: <Icon.Upload size={16} />,
      action: () => {
        router.push("/candidates");
        onClose();
      },
    },
    ...CANDIDATES.slice(0, 5).map((c) => ({
      id: c.id,
      label: c.name,
      type: "Candidate",
      subtitle: c.title,
      icon: <Avatar name={c.name} color={c.avatar} size={20} />,
      action: () => {
        router.push(`/candidates/${c.id}`);
        onClose();
      },
    })),
    ...JOBS.slice(0, 3).map((j) => ({
      id: j.id,
      label: j.title,
      type: "Job",
      subtitle: j.department,
      icon: <Icon.Briefcase size={16} />,
      action: () => {
        router.push(`/jobs/${j.id}`);
        onClose();
      },
    })),
  ];

  const items = q ? allItems.filter((i) => i.label.toLowerCase().includes(q.toLowerCase())) : allItems;

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="tsModalBackdrop" onClick={onClose}>
      <div className="tsPalette" onClick={(e) => e.stopPropagation()}>
        <div className="tsPalette-search">
          <Icon.Search size={16} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type a command or search…"
          />
          <span className="tsSearch-kbd">ESC</span>
        </div>
        <div className="tsPalette-list">
          {items.slice(0, 8).map((it: any) => (
            <button key={it.id} className="tsPalette-item" onClick={it.action}>
              <span className="tsPalette-itemIcon">{it.icon}</span>
              <div className="tsPalette-itemMain">
                <div>{it.label}</div>
                {it.subtitle && <div className="small">{it.subtitle}</div>}
              </div>
              <span className="tsPalette-itemTag">{it.type}</span>
            </button>
          ))}
          {!items.length && (
            <div style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>
              No results.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
