"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Button, Avatar, ScorePill, SearchInput } from "@/components/ui";
import { useCandidates, useUpdateCandidateStage } from "@/hooks/queries/useCandidates";
import { useJobs } from "@/hooks/queries/useJobs";

const SORT_OPTIONS = [
  { value: "score_desc", label: "Score: High → Low" },
  { value: "score_asc", label: "Score: Low → High" },
  { value: "name_asc", label: "Name: A → Z" },
  { value: "name_desc", label: "Name: Z → A" },
];

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

  const [search, setSearch] = React.useState("");
  const [selectedJob, setSelectedJob] = React.useState("");
  const [sortBy, setSortBy] = React.useState("score_desc");
  const [showFilters, setShowFilters] = React.useState(false);

  const { data: jobsData } = useJobs();
  const { data: candidateData } = useCandidates(selectedJob ? { job_id: selectedJob } : undefined);
  const { mutate: updateStage } = useUpdateCandidateStage();

  const selectedJobTitle = React.useMemo(() => {
    if (!selectedJob) return null;
    return jobsData?.items?.find(j => j.id === selectedJob)?.title ?? null;
  }, [selectedJob, jobsData]);

  const board = React.useMemo(() => {
    const map: Record<string, any[]> = {};
    columns.forEach(col => { map[col.id] = []; });

    let items = candidateData?.items ?? [];

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.location?.toLowerCase().includes(q) ||
        (c.technical_skills ?? []).some((s: string) => s.toLowerCase().includes(q))
      );
    }

    // Sort
    items = [...items].sort((a, b) => {
      switch (sortBy) {
        case "score_desc": return (b.overall_score ?? 0) - (a.overall_score ?? 0);
        case "score_asc": return (a.overall_score ?? 0) - (b.overall_score ?? 0);
        case "name_asc": return (a.name ?? "").localeCompare(b.name ?? "");
        case "name_desc": return (b.name ?? "").localeCompare(a.name ?? "");
        default: return 0;
      }
    });

    items.forEach(c => {
      if (map[c.status]) map[c.status].push(c);
      else if (map['new']) map['new'].push(c);
    });
    return map;
  }, [candidateData, search, sortBy]);

  const totalVisible = React.useMemo(() =>
    Object.values(board).reduce((sum, col) => sum + col.length, 0),
    [board]
  );

  const [dragId, setDragId] = React.useState<string | null>(null);
  const [dropTarget, setDropTarget] = React.useState<string | null>(null);

  const onDrop = (toCol: string) => {
    if (!dragId) return;
    updateStage({ id: dragId, status: toCol });
    setDragId(null);
    setDropTarget(null);
  };

  const activeFilterCount = (selectedJob ? 1 : 0) + (sortBy !== "score_desc" ? 1 : 0);

  return (
    <div className="tsPipe-page">
      <div className="tsPipe-toolbar">
        <div>
          <div className="h2">
            {selectedJobTitle ? `${selectedJobTitle} · Pipeline` : "Pipeline"}
          </div>
          <div className="small" style={{ color: "var(--muted)" }}>
            {totalVisible} candidate{totalVisible !== 1 ? "s" : ""} · drag cards between stages
          </div>
        </div>
        <div style={{ flex: 1 }}/>
        <SearchInput
          value={search}
          onChange={(e: any) => setSearch(typeof e === "string" ? e : e?.target?.value ?? "")}
          placeholder="Filter candidates…"
          kbd=""
        />
        <Button
          variant={activeFilterCount > 0 ? "primary" : "secondary"}
          icon={<Icon.Filter size={14}/>}
          onClick={() => setShowFilters(v => !v)}
        >
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </Button>
        <div className="tsViewToggle">
          <button onClick={() => router.push("/candidates")}><Icon.Grid size={14}/></button>
          <button onClick={() => router.push("/candidates")}><Icon.List size={14}/></button>
          <button className="active"><Icon.Kanban size={14}/></button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "10px 24px", background: "var(--surface-2)",
          borderBottom: "1px solid var(--border)", flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>Job</span>
            <select
              value={selectedJob}
              onChange={e => setSelectedJob(e.target.value)}
              style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 6, padding: "4px 10px", fontSize: 12,
                color: "var(--text)", cursor: "pointer", minWidth: 180,
              }}
            >
              <option value="">All jobs</option>
              {(jobsData?.items ?? []).map(job => (
                <option key={job.id} value={job.id}>{job.title}</option>
              ))}
            </select>
          </div>

          <div style={{ width: 1, height: 20, background: "var(--border)" }}/>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>Sort by</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 6, padding: "4px 10px", fontSize: 12,
                color: "var(--text)", cursor: "pointer", minWidth: 160,
              }}
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {activeFilterCount > 0 && (
            <>
              <div style={{ width: 1, height: 20, background: "var(--border)" }}/>
              <button
                onClick={() => { setSelectedJob(""); setSortBy("score_desc"); }}
                style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                Clear filters
              </button>
            </>
          )}
        </div>
      )}

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
                <span className="tsKanban-count mono">{(board[col.id] ?? []).length}</span>
              </div>
              <button className="tsIconBtn"><Icon.MoreH size={13}/></button>
            </div>
            <div className="tsKanban-list">
              {(board[col.id] ?? []).map(c => (
                <div key={c.id}
                  className={`tsKanban-card ${dragId === c.id ? "dragging" : ""}`}
                  draggable
                  onDragStart={() => setDragId(c.id)}
                  onDragEnd={() => { setDragId(null); setDropTarget(null); }}
                  onClick={() => router.push(`/candidates/${c.id}`)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <Avatar name={c.name} size={26}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                      <div className="small" style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}>{c.location ?? ''}</div>
                    </div>
                    <ScorePill score={c.overall_score ?? 0}/>
                  </div>
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                    {(c.technical_skills ?? []).slice(0, 3).map((s: string) => <span key={s} className="tsChip" style={{ fontSize: 10, padding: "1px 6px" }}>{s}</span>)}
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
              {(board[col.id] ?? []).length === 0 && dropTarget !== col.id && (
                <div className="tsKanban-empty">Drop here</div>
              )}
            </div>
            <button className="tsKanban-add"><Icon.Plus size={13}/> Add candidate</button>
          </div>
        ))}
      </div>
    </div>
  );
}


export { Pipeline as PipelineKanban };
export default Pipeline;
