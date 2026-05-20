"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Button, Avatar, Badge, ScorePill, SearchInput } from "@/components/ui";
import { CANDIDATES } from "@/lib/data";

// Pipeline / Kanban view + Schedule Interview modal
const { useState: useS_p, useRef: useR_p } = React;

// ===== Kanban / Pipeline =====
function Pipeline() {
  const router = useRouter();
    
  const columns = [
    { id: "new", label: "New", color: "var(--stage-new)" },
    { id: "shortlisted", label: "Shortlisted", color: "var(--stage-shortlisted)" },
    { id: "scheduled", label: "Scheduled", color: "var(--stage-scheduled)" },
    { id: "inprogress", label: "Technical", color: "var(--stage-inprogress)" },
    { id: "feedback", label: "Culture fit", color: "var(--stage-feedback)" },
    { id: "hired", label: "Hired", color: "var(--stage-hired)" },
    { id: "rejected", label: "Rejected", color: "var(--stage-rejected)" },
  ];

  const [state, setState] = useS_p(() => {
    const map = {};
    columns.forEach(col => { map[col.id] = CANDIDATES.filter(c => c.stage === col.id); });
    return map;
  });
  const [dragId, setDragId] = useS_p(null);
  const [dropTarget, setDropTarget] = useS_p(null);

  const onDrop = (toCol) => {
    if (!dragId) return;
    setState(prev => {
      const next = { ...prev };
      for (const col of columns) {
        next[col.id] = next[col.id].filter(c => c.id !== dragId);
      }
      const moved = CANDIDATES.find(c => c.id === dragId);
      if (moved) next[toCol] = [...next[toCol], { ...moved, stage: toCol }];
      return next;
    });
    setDragId(null);
    setDropTarget(null);
  };

  return (
    <div className="tsPipe-page">
      <div className="tsPipe-toolbar">
        <div>
          <div className="h2">Senior Software Engineer · Pipeline</div>
          <div className="small" style={{ color: "var(--muted)" }}>247 candidates · drag cards between stages</div>
        </div>
        <div style={{ flex: 1 }}/>
        <SearchInput value="" onChange={() => {}} placeholder="Filter candidates…" kbd=""/>
        <Button variant="secondary" icon={<Icon.Filter size={14}/>}>Filters</Button>
        <div className="tsViewToggle">
          <button onClick={() => router.push("/candidates")}><Icon.Grid size={14}/></button>
          <button onClick={() => router.push("/candidates")}><Icon.List size={14}/></button>
          <button className="active"><Icon.Kanban size={14}/></button>
        </div>
      </div>

      <div className="tsKanban">
        {columns.map(col => (
          <div key={col.id}
            className={`tsKanban-col ${dropTarget === col.id ? "tsKanban-col-drop" : ""}`}
            onDragOver={e => { e.preventDefault(); setDropTarget(col.id); }}
            onDragLeave={() => setDropTarget(t => t === col.id ? null : t)}
            onDrop={() => onDrop(col.id)}>
            <div className="tsKanban-head">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="tsKanban-dot" style={{ background: col.color, boxShadow: `0 0 8px ${col.color}` }}/>
                <span style={{ fontWeight: 500, fontSize: 13 }}>{col.label}</span>
                <span className="tsKanban-count mono">{state[col.id].length}</span>
              </div>
              <button className="tsIconBtn"><Icon.MoreH size={13}/></button>
            </div>
            <div className="tsKanban-list">
              {state[col.id].map(c => (
                <div key={c.id}
                  className={`tsKanban-card ${dragId === c.id ? "dragging" : ""}`}
                  draggable
                  onDragStart={() => setDragId(c.id)}
                  onDragEnd={() => { setDragId(null); setDropTarget(null); }}
                  onClick={() => router.push("/candidates/c1")}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <Avatar name={c.name} color={c.avatar} size={26}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                      <div className="small" style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}>{c.years}y · {c.location}</div>
                    </div>
                    <ScorePill score={c.score}/>
                  </div>
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                    {c.skills.slice(0, 3).map(s => <span key={s} className="tsChip" style={{ fontSize: 10, padding: "1px 6px" }}>{s}</span>)}
                  </div>
                  {col.id === "scheduled" && (
                    <div className="tsKanban-meta">
                      <Icon.Clock size={10}/> Tomorrow 2:30 PM
                    </div>
                  )}
                  {col.id === "inprogress" && (
                    <div className="tsKanban-meta">
                      <Avatar name="John Smith" size={14}/> John Smith
                    </div>
                  )}
                </div>
              ))}
              {dropTarget === col.id && dragId && <div className="tsKanban-dropZone"/>}
              {state[col.id].length === 0 && dropTarget !== col.id && (
                <div className="tsKanban-empty">Drop here</div>
              )}
            </div>
            <button className="tsKanban-add"><Icon.Plus size={13}/> Add candidate</button>
          </div>
        ))}
      </div>
    </div>
  );
};


export { Pipeline as PipelineKanban };
export default Pipeline;
