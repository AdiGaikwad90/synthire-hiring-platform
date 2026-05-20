"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Modal, Button, Card, Badge, Avatar, ScoreRing, ScoreBar, ScorePill, StagePill, Slider, Toggle, Checkbox, SearchInput, AIPill } from "@/components/ui";
import { JOBS, CANDIDATES } from "@/lib/data";
import { ResumeBatchModal } from "./ResumeBatchModal";

// Candidate list — Job detail view with filters + candidate cards
const { useState: useS_c, useMemo: useM_c } = React;

function Candidates() {
  const router = useRouter();
    
  const job = JOBS[0];
  const [view, setView] = useS_c("grid"); // grid | list | pipeline
  const [tab, setTab] = useS_c("overview");
  const [filters, setFilters] = useS_c({
    minOverall: 0, minSkills: 0, minExp: 0, minEdu: 0, minAch: 0,
    required: ["TypeScript", "React", "AWS"],
    nice: ["Kubernetes"],
    minYears: 0,
    industries: { Tech: true, Finance: false, Healthcare: false, Consumer: false },
    leadership: false,
    degrees: { hs: false, bachelor: true, master: true, phd: false },
  });
  const [detailCand, setDetailCand] = useS_c(null);
  const [showUpload, setShowUpload] = useS_c(false);

  const filtered = useM_c(() => CANDIDATES.filter(c =>
    c.score >= filters.minOverall &&
    c.skillsScore >= filters.minSkills &&
    c.expScore >= filters.minExp &&
    c.eduScore >= filters.minEdu &&
    c.achScore >= filters.minAch &&
    c.years >= filters.minYears
  ), [filters]);

  if (view === "pipeline") { setView("grid"); router.push("/pipeline"); return null; }

  return (
    <div className="tsPage tsCands-page">
      <button className="tsBackBtn" onClick={() => router.push("/jobs")}><Icon.ArrowLeft size={14}/> Back to jobs</button>

      <div className="tsCands-layout">
        {/* Left: Job detail */}
        <aside className="tsJobDetail">
          <div style={{ marginBottom: 8 }}>
            <Badge variant="success" dot>Active</Badge>
          </div>
          <div className="h2" style={{ marginBottom: 6 }}>{job.title}</div>
          <div className="small" style={{ color: "var(--muted)", marginBottom: 18 }}>{job.department} · {job.location}</div>

          <div className="tsTabs" style={{ marginBottom: 16 }}>
            <button className={`tsTab ${tab === "overview" ? "tsTab-active" : ""}`} onClick={() => setTab("overview")}>Overview</button>
            <button className={`tsTab ${tab === "req" ? "tsTab-active" : ""}`} onClick={() => setTab("req")}>Requirements</button>
            <button className={`tsTab ${tab === "settings" ? "tsTab-active" : ""}`} onClick={() => setTab("settings")}>Settings</button>
          </div>

          {tab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <MetaRow label="Posted" val={job.posted}/>
              <MetaRow label="Updated" val="Today, 11:42 AM"/>
              <MetaRow label="Hiring manager" val={<div style={{ display: "flex", alignItems: "center", gap: 6 }}><Avatar name="Mike Johnson" size={18}/> Mike Johnson</div>}/>
              <MetaRow label="Compensation" val={job.salary}/>
              <MetaRow label="Type" val={`${job.type} · ${job.level}`}/>
              <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }}/>
              <div>
                <div className="tiny" style={{ marginBottom: 8 }}>Pipeline overview</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <PipeMini label="Applied" count={247} max={247} color="var(--stage-new)"/>
                  <PipeMini label="Shortlisted" count={31} max={247} color="var(--stage-shortlisted)"/>
                  <PipeMini label="Interviewing" count={12} max={247} color="var(--stage-inprogress)"/>
                  <PipeMini label="Hired" count={0} max={247} color="var(--stage-hired)"/>
                </div>
              </div>
              <div className="ai-border" style={{ padding: 14, borderRadius: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <AIPill>AI summary</AIPill>
                </div>
                <div className="small" style={{ color: "var(--text-2)", lineHeight: 1.5 }}>
                  Strong pipeline — top 5 candidates average <b style={{ color: "var(--text)" }}>88% match</b>. Consider opening a 2nd technical screen this week to keep momentum.
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* Right: Filters + Candidates */}
        <main className="tsCands-main">
          {/* Filter rail */}
          <CandidateFilters filters={filters} setFilters={setFilters}/>

          <div className="tsCands-list">
            {/* Toolbar */}
            <div className="tsCands-toolbar">
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{filtered.length} candidates</div>
                <div className="small" style={{ color: "var(--muted)" }}>Sorted by overall score · {CANDIDATES.length - filtered.length} hidden by filters</div>
              </div>
              <div style={{ flex: 1 }}/>
              <Button variant="secondary" icon={<Icon.Upload size={13}/>} size="sm" onClick={() => setShowUpload(true)}>Upload resumes</Button>
              <select className="tsSelect">
                <option>Sort: Overall score</option>
                <option>Sort: Skills match</option>
                <option>Sort: Recently applied</option>
                <option>Sort: Years of experience</option>
              </select>
              <div className="tsViewToggle">
                <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")}><Icon.Grid size={14}/></button>
                <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}><Icon.List size={14}/></button>
                <button onClick={() => router.push("/pipeline")}><Icon.Kanban size={14}/></button>
              </div>
            </div>

            {/* Cards */}
            <div className={view === "grid" ? "tsCands-grid" : "tsCands-listView"}>
              {filtered.slice(0, 12).map((c, i) => (
                view === "grid"
                  ? <CandidateCard key={c.id} c={c} idx={i} onView={() => setDetailCand(c)} onProfile={() => router.push("/candidates/c1")}/>
                  : <CandidateListRow key={c.id} c={c} onClick={() => router.push("/candidates/c1")}/>
              ))}
            </div>
          </div>
        </main>
      </div>

      {/* View Details Modal */}
      {detailCand && <CandidateQuickModal c={detailCand} onClose={() => setDetailCand(null)} onProfile={() => router.push("/candidates/c1")}/>}
      {showUpload && <ResumeBatchModal onClose={() => setShowUpload(false)}/>}
    </div>
  );
};

// ===== Helpers =====
const MetaRow = ({ label, val }: any) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
    <span style={{ color: "var(--muted)" }}>{label}</span>
    <span style={{ color: "var(--text)", textAlign: "right" }}>{val}</span>
  </div>
);

const PipeMini = ({ label, count, max, color }: any) => (
  <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 36px", gap: 10, alignItems: "center", fontSize: 12 }}>
    <span style={{ color: "var(--text-2)" }}>{label}</span>
    <div style={{ height: 4, background: "var(--surface-3)", borderRadius: 999 }}>
      <div style={{ height: "100%", borderRadius: 999, background: color, width: `${(count/max)*100}%` }}/>
    </div>
    <span className="mono" style={{ textAlign: "right" }}>{count}</span>
  </div>
);

// ===== Filters =====
function CandidateFilters({ filters, setFilters }: any) {
    return (
    <aside className="tsFilters">
      <div className="tsFilters-head">
        <div className="h4" style={{ fontWeight: 500, fontSize: 13 }}>Filters</div>
        <button className="tsBtn tsBtn-ghost tsBtn-sm" onClick={() => setFilters({ minOverall: 0, minSkills: 0, minExp: 0, minEdu: 0, minAch: 0, required: [], nice: [], minYears: 0, industries: {}, leadership: false, degrees: {} })}>Clear</button>
      </div>

      <FilterGroup title="Scores">
        <FilterSlider label="Overall" value={filters.minOverall} onChange={v => setFilters(f => ({ ...f, minOverall: v }))}/>
        <FilterSlider label="Skills match" value={filters.minSkills} onChange={v => setFilters(f => ({ ...f, minSkills: v }))} color="var(--primary)"/>
        <FilterSlider label="Experience" value={filters.minExp} onChange={v => setFilters(f => ({ ...f, minExp: v }))} color="var(--info)"/>
        <FilterSlider label="Education" value={filters.minEdu} onChange={v => setFilters(f => ({ ...f, minEdu: v }))} color="var(--success)"/>
        <FilterSlider label="Achievements" value={filters.minAch} onChange={v => setFilters(f => ({ ...f, minAch: v }))} color="var(--warning)"/>
      </FilterGroup>

      <FilterGroup title="Required skills">
        <div className="tsChips">
          {filters.required.map(s => (
            <span key={s} className="tsChip tsChip-required">
              <Icon.Check size={10} stroke={3}/>{s}
              <button onClick={() => setFilters(f => ({ ...f, required: f.required.filter(x => x !== s) }))}><Icon.X size={10}/></button>
            </span>
          ))}
          <button className="tsChip tsChip-add">+ Add</button>
        </div>
      </FilterGroup>

      <FilterGroup title="Nice-to-have">
        <div className="tsChips">
          {filters.nice.map(s => (
            <span key={s} className="tsChip">
              {s}
              <button onClick={() => setFilters(f => ({ ...f, nice: f.nice.filter(x => x !== s) }))}><Icon.X size={10}/></button>
            </span>
          ))}
          <button className="tsChip tsChip-add">+ Add</button>
        </div>
      </FilterGroup>

      <FilterGroup title="Experience">
        <FilterSlider label="Min years" value={filters.minYears} onChange={v => setFilters(f => ({ ...f, minYears: v }))} max={20} unit=" yr"/>
        <div className="tiny" style={{ marginTop: 10, marginBottom: 6 }}>Industry</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {Object.keys(filters.industries).map(k => (
            <Checkbox key={k} checked={filters.industries[k]} onChange={v => setFilters(f => ({ ...f, industries: { ...f.industries, [k]: v }}))} label={k}/>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <Toggle checked={filters.leadership} onChange={v => setFilters(f => ({ ...f, leadership: v }))} label="Must have led a team" size="sm"/>
        </div>
      </FilterGroup>

      <FilterGroup title="Education">
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {[{ id: "hs", l: "High school" }, { id: "bachelor", l: "Bachelor's" }, { id: "master", l: "Master's" }, { id: "phd", l: "PhD" }].map(d => (
            <Checkbox key={d.id} checked={filters.degrees[d.id]} onChange={v => setFilters(f => ({ ...f, degrees: { ...f.degrees, [d.id]: v }}))} label={d.l}/>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Certifications">
        <div className="tsChips">
          <span className="tsChip"><Icon.ShieldCheck size={10}/>AWS Solutions Architect <button><Icon.X size={10}/></button></span>
          <button className="tsChip tsChip-add">+ Add</button>
        </div>
      </FilterGroup>
    </aside>
  );
};

function FilterGroup({ title, children }: any) {
  const [open, setOpen] = useS_c(true);
  return (
    <div className="tsFilterGroup">
      <button className="tsFilterGroup-head" onClick={() => setOpen(o => !o)}>
        <Icon.ChevronDown size={12} style={{ transform: open ? "" : "rotate(-90deg)", transition: "transform 0.18s" }}/>
        {title}
      </button>
      {open && <div className="tsFilterGroup-body">{children}</div>}
    </div>
  );
};

const FilterSlider = ({ label, value, onChange, color, max = 100, unit = "%" }: any) => (
  <div style={{ marginBottom: 8 }}>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 4 }}>
      <span style={{ color: "var(--text-2)" }}>{label}</span>
      <span className="mono" style={{ color: value > 0 ? "var(--text)" : "var(--muted)" }}>≥{value}{unit}</span>
    </div>
    <Slider value={value} max={max} onChange={onChange} color={color}/>
  </div>
);

// ===== Candidate Card =====
function CandidateCard({ c, idx, onView, onProfile }: any) {
    const tone = c.score >= 80 ? "success" : c.score >= 60 ? "warning" : "danger";
  return (
    <div className="tsCandCard" style={{ animationDelay: `${idx * 30}ms` }}>
      <div className="tsCandCard-head">
        <Avatar name={c.name} color={c.avatar} size={40}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 14 }}>{c.name}</div>
          <div className="small" style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
        </div>
        <div className={`tsCandCard-score tsCandCard-score-${tone}`}>
          <span className="mono">{c.score}</span>
          <span style={{ fontSize: 10, opacity: 0.7 }}>%</span>
        </div>
      </div>

      <div className="tsCandCard-bars">
        <ScoreBar label="Skills" value={c.skillsScore}/>
        <ScoreBar label="Experience" value={c.expScore}/>
        <ScoreBar label="Education" value={c.eduScore}/>
        <ScoreBar label="Achievements" value={c.achScore}/>
      </div>

      <div className="tsCandCard-chips">
        {c.skills.slice(0, 4).map((s, i) => (
          <span key={s} className={`tsChip ${i < 2 ? "tsChip-required" : ""}`} style={{ fontSize: 10.5 }}>
            {i < 2 && <Icon.Check size={9} stroke={3}/>}
            {s}
          </span>
        ))}
        {c.skills.length > 4 && <span className="tsChip" style={{ fontSize: 10.5, color: "var(--muted)" }}>+{c.skills.length - 4}</span>}
      </div>

      {c.concerns.length > 0 && (
        <div className="tsCandCard-flags tsCandCard-flags-warn">
          <div className="tiny" style={{ color: "var(--warning)", display: "flex", alignItems: "center", gap: 4 }}>
            <Icon.AlertTriangle size={10}/>Concerns
          </div>
          {c.concerns.slice(0, 2).map((s, i) => <div key={i} className="small">{s}</div>)}
        </div>
      )}
      {c.strengths.length > 0 && (
        <div className="tsCandCard-flags tsCandCard-flags-good">
          <div className="tiny" style={{ color: "var(--success)", display: "flex", alignItems: "center", gap: 4 }}>
            <Icon.Check size={10} stroke={3}/>Strengths
          </div>
          {c.strengths.slice(0, 2).map((s, i) => <div key={i} className="small">{s}</div>)}
        </div>
      )}

      <div className="tsCandCard-foot">
        <button className="tsBtn tsBtn-ghost tsBtn-sm" onClick={onView}>View details</button>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="tsIconBtn" title="Shortlist" style={{ color: "var(--success)" }}><Icon.Check size={15} stroke={2.5}/></button>
          <button className="tsIconBtn" title="Reject" style={{ color: "var(--danger)" }}><Icon.X size={15} stroke={2.5}/></button>
          <button className="tsBtn tsBtn-primary tsBtn-sm" onClick={onProfile}>Open <Icon.ArrowRight size={11}/></button>
        </div>
      </div>
    </div>
  );
};

function CandidateListRow({ c, onClick }: any) {
    return (
    <div className="tsCandRowFull" onClick={onClick}>
      <Avatar name={c.name} color={c.avatar} size={36}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500 }}>{c.name}</div>
        <div className="small" style={{ color: "var(--muted)" }}>{c.title} · {c.years} yr · {c.location}</div>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {c.skills.slice(0, 3).map(s => <span key={s} className="tsChip" style={{ fontSize: 10 }}>{s}</span>)}
      </div>
      <div style={{ width: 140 }}>
        <ScoreBar label="" value={c.score}/>
      </div>
      <ScorePill score={c.score}/>
      <StagePill stage={c.stage}/>
    </div>
  );
};

// ===== Quick view modal =====
function CandidateQuickModal({ c, onClose, onProfile }: any) {
    return (
    <Modal open={true} onClose={onClose} width={580}
      title={<div style={{ display: "flex", alignItems: "center", gap: 12 }}><Avatar name={c.name} color={c.avatar} size={40}/><div><div>{c.name}</div><div className="small" style={{ color: "var(--muted)" }}>{c.title}</div></div></div>}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="secondary" icon={<Icon.Check size={13} stroke={3}/>}>Shortlist</Button>
          <Button variant="primary" icon={<Icon.ArrowRight size={13}/>} onClick={() => { onClose(); onProfile(); }}>View full profile</Button>
        </>
      }>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 24, alignItems: "center" }}>
        <ScoreRing score={c.score} size={120} label="Overall"/>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <ScoreBar label="Technical skills" value={c.skillsScore}/>
          <ScoreBar label="Experience relevance" value={c.expScore}/>
          <ScoreBar label="Education fit" value={c.eduScore}/>
          <ScoreBar label="Achievements impact" value={c.achScore}/>
        </div>
      </div>
      <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="tsFlagBox tsFlagBox-warn">
          <div className="tiny" style={{ color: "var(--warning)", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
            <Icon.AlertTriangle size={11}/> Concerns
          </div>
          {c.concerns.length ? c.concerns.map((s, i) => <div key={i} className="small" style={{ marginBottom: 4 }}>• {s}</div>) : <div className="small" style={{ color: "var(--muted)" }}>None flagged.</div>}
        </div>
        <div className="tsFlagBox tsFlagBox-good">
          <div className="tiny" style={{ color: "var(--success)", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
            <Icon.Check size={11} stroke={3}/> Strengths
          </div>
          {c.strengths.map((s, i) => <div key={i} className="small" style={{ marginBottom: 4 }}>• {s}</div>)}
        </div>
      </div>
    </Modal>
  );
};


export { Candidates, CandidateCard, CandidateListRow, CandidateFilters as FilterPanel };
export default Candidates;
