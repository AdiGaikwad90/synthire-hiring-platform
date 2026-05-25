"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Modal, Button, Card, Badge, Avatar, ScoreRing, ScoreBar, ScorePill, StagePill, Slider, Toggle, Checkbox, SearchInput, AIPill, Select, useToast } from "@/components/ui";
import { useCandidates, useUpdateCandidateStage } from "@/hooks/queries/useCandidates";
import { useJob, useJobs } from "@/hooks/queries/useJobs";
import { useParams } from "next/navigation";
import { ResumeBatchModal } from "./ResumeBatchModal";
import type { ApiJob } from "@/lib/api";

const { useState: useS_c } = React;

// ── Entry point ───────────────────────────────────────────────────────────────

function Candidates({ jobId, hideUpload }: { jobId?: string; hideUpload?: boolean }) {
  const { jobId: paramId } = useParams() as { jobId?: string };
  const actualJobId = jobId ?? paramId;

  if (!actualJobId) return <CandidatesGlobal />;
  return <CandidatesScoped jobId={actualJobId} hideUpload={hideUpload} />;
}

// ── Global /candidates — job-grouped layout ───────────────────────────────────

const STAGE_OPTIONS = [
  { value: "", label: "All Stages" },
  { value: "applied", label: "Applied" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "interviewing", label: "Interviewing" },
  { value: "rejected", label: "Rejected" },
];

function CandidatesGlobal() {
  const router = useRouter();
  const [search, setSearch] = useS_c("");
  const [stageFilter, setStageFilter] = useS_c("");
  const [jobFilter, setJobFilter] = useS_c("");
  const [showUpload, setShowUpload] = useS_c(false);
  const [uploadJobId, setUploadJobId] = useS_c("");
  const { data: jobsData, isLoading } = useJobs();
  const jobs = jobsData?.items ?? [];

  const jobOptions = [
    { value: "", label: "All Jobs" },
    ...jobs.map(j => ({ value: j.id, label: j.title })),
  ];

  if (isLoading) return <div className="tsPage"><div style={{ padding: 32, color: "var(--muted)" }}>Loading...</div></div>;

  return (
    <div className="tsPage">
      <div className="tsPage-head">
        <div className="tsPage-headMain">
          <div className="h1">Candidates</div>
          <div className="small" style={{ color: "var(--muted)" }}>
            {jobs.reduce((sum, j) => sum + (j.candidate_count ?? 0), 0)} candidates across {jobs.length} jobs
          </div>
        </div>
        <div className="tsPage-actions">
          <SearchInput value={search} onChange={setSearch} placeholder="Search candidates…" kbd=""/>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <Select
          value={stageFilter}
          onChange={e => setStageFilter(e.target.value)}
          options={STAGE_OPTIONS}
        />
        <Select
          value={jobFilter}
          onChange={e => setJobFilter(e.target.value)}
          options={jobOptions}
        />
      </div>

      {jobs.length === 0 ? (
        <Card padded>
          <div style={{ padding: "60px 0", textAlign: "center" }}>
            <Icon.Users size={40} style={{ color: "var(--muted)", marginBottom: 16 }}/>
            <div className="h3" style={{ marginBottom: 8 }}>No jobs yet</div>
            <div className="small" style={{ color: "var(--muted)", marginBottom: 20 }}>
              Create a job first, then upload resumes to start reviewing candidates.
            </div>
            <Button variant="primary" onClick={() => router.push("/jobs/new")}>Create your first job</Button>
          </div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {jobs.filter(job => !jobFilter || job.id === jobFilter).map(job => (
            <JobCandidateSection
              key={job.id}
              job={job}
              search={search}
              stageFilter={stageFilter}
              onUpload={() => { setUploadJobId(job.id); setShowUpload(true); }}
              onViewJob={() => router.push(`/jobs/${job.id}?tab=candidates`)}
            />
          ))}
        </div>
      )}

      {showUpload && (
        <ResumeBatchModal
          jobId={uploadJobId}
          onClose={() => setShowUpload(false)}
        />
      )}
    </div>
  );
}

function JobCandidateSection({ job, search, stageFilter, onUpload, onViewJob }: {
  job: ApiJob; search: string; stageFilter?: string; onUpload: () => void; onViewJob: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [detailCand, setDetailCand] = useS_c<any>(null);
  const queryParams: Record<string, string> = { job_id: job.id };
  if (stageFilter) queryParams.status = stageFilter;
  const { data, isLoading } = useCandidates(queryParams);
  const updateStage = useUpdateCandidateStage();
  const candidates = data?.items ?? [];
  const filtered = search
    ? candidates.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : candidates;

  return (
    <div>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <Badge variant={job.status === "active" ? "success" : "warning"} dot>
          {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
        </Badge>
        <button
          onClick={onViewJob}
          className="h3"
          style={{ fontWeight: 600, fontSize: 16, cursor: "pointer", background: "none", border: "none", color: "var(--text)", padding: 0 }}
        >
          {job.title}
        </button>
        {job.department && <span className="small" style={{ color: "var(--muted)" }}>{job.department}</span>}
        <span className="small" style={{ color: "var(--muted)" }}>·</span>
        <span className="small" style={{ color: "var(--muted)" }}>{candidates.length} candidate{candidates.length !== 1 ? "s" : ""}</span>
        <div style={{ flex: 1 }}/>
        <button className="tsLink small" onClick={onViewJob}>View all →</button>
        <Button variant="secondary" icon={<Icon.Upload size={13}/>} size="sm" onClick={onUpload}>
          Upload resumes
        </Button>
      </div>

      {/* Cards or empty state */}
      {isLoading ? (
        <div style={{ padding: "20px 0", color: "var(--muted)", fontSize: 13 }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{
          border: "1px dashed var(--border)",
          borderRadius: 12,
          padding: "28px 24px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          color: "var(--muted)",
        }}>
          <Icon.Upload size={20} style={{ flexShrink: 0 }}/>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--text-2)", marginBottom: 2 }}>
              {search ? "No candidates match your search" : "No candidates yet"}
            </div>
            <div className="small">
              {search ? "Try a different name." : (
                <span>Upload resumes to start reviewing candidates for <strong>{job.title}</strong>.</span>
              )}
            </div>
          </div>
          {!search && (
            <Button variant="ghost" size="sm" icon={<Icon.Upload size={12}/>} onClick={onUpload} style={{ marginLeft: "auto" }}>
              Upload
            </Button>
          )}
        </div>
      ) : (
        <div className="tsCands-grid">
          {filtered.slice(0, 6).map((c, i) => {
            const mapped = {
              ...c,
              score: c.overall_score ?? 0,
              skillsScore: c.skills_score ?? 0,
              expScore: c.experience_score ?? 0,
              eduScore: c.education_score ?? 0,
              achScore: c.achievements_score ?? 0,
              name: c.name && c.name !== 'Not Provided' ? c.name : 'Unknown Candidate',
              skills: c.technical_skills ?? [],
              stage: c.status,
              strengths: [],
              concerns: [],
              avatar: "",
              title: "",
              years: 0,
            };
            return (
              <CandidateCard
                key={c.id}
                c={mapped}
                idx={i}
                onView={() => setDetailCand(mapped)}
                onProfile={() => router.push(`/candidates/${c.id}`)}
                onShortlist={() => updateStage.mutate({ id: c.id, status: "shortlisted" }, {
                  onSuccess: () => toast({ message: "Candidate moved to Shortlisted." }),
                  onError: () => toast({ message: "Failed to update.", variant: "error" }),
                })}
                onReject={() => updateStage.mutate({ id: c.id, status: "rejected" }, {
                  onSuccess: () => toast({ message: "Candidate marked as Rejected." }),
                  onError: () => toast({ message: "Failed to update.", variant: "error" }),
                })}
              />
            );
          })}
          {filtered.length > 6 && (
            <div
              onClick={onViewJob}
              style={{
                border: "1px dashed var(--border)",
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: 6,
                cursor: "pointer",
                minHeight: 120,
                color: "var(--muted)",
                fontSize: 13,
                transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-2)")}
              onMouseLeave={e => (e.currentTarget.style.background = "")}
            >
              <Icon.ArrowRight size={18}/>
              <span>+{filtered.length - 6} more</span>
              <span className="small">View all →</span>
            </div>
          )}
        </div>
      )}

      {detailCand && (
        <CandidateQuickModal
          c={detailCand}
          onClose={() => setDetailCand(null)}
          onProfile={() => { setDetailCand(null); router.push(`/candidates/${detailCand.id}`); }}
        />
      )}
    </div>
  );
}

// ── Job-scoped layout (inside Job detail → Candidates tab) ────────────────────

function CandidatesScoped({ jobId, hideUpload }: { jobId: string; hideUpload?: boolean }) {
  const router = useRouter();
  const { data: job } = useJob(jobId);
  const [view, setView] = useS_c("grid");
  const [filters, setFilters] = useS_c({
    minOverall: 0, minSkills: 0, minExp: 0, minEdu: 0, minAch: 0,
    required: [] as string[], nice: [] as string[],
    minYears: 0,
    industries: { Tech: false, Finance: false, Healthcare: false, Consumer: false },
    leadership: false,
    degrees: { hs: false, bachelor: false, master: false, phd: false },
  });
  const [detailCand, setDetailCand] = useS_c<any>(null);
  const [showUpload, setShowUpload] = useS_c(false);
  const [sortBy, setSortBy] = useS_c("overall");
  const toast = useToast();
  const updateStage = useUpdateCandidateStage();

  const candidateParams = Object.fromEntries(
    Object.entries({
      job_id: jobId,
      min_score: filters.minOverall > 0 ? String(filters.minOverall) : undefined,
    }).filter(([, v]) => v !== undefined) as [string, string][]
  );
  const { data: candidateData, isLoading: candidatesLoading } = useCandidates(candidateParams);
  const candidates = candidateData?.items ?? [];
  const totalCands = candidates.length;

  if (view === "pipeline") { router.push("/pipeline"); return null; }

  return (
    <div className="tsCands-page">
      <div className="tsCands-layout">
        {/* Left: Job summary */}
        <aside className="tsJobDetail">
          {job ? (
            <>
              <div style={{ marginBottom: 8 }}>
                <Badge variant={job.status === "active" ? "success" : "warning"} dot>
                  {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                </Badge>
              </div>
              <div className="h2" style={{ marginBottom: 6 }}>{job.title}</div>
              <div className="small" style={{ color: "var(--muted)", marginBottom: 18 }}>
                {[job.department, job.location].filter(Boolean).join(" · ")}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {job.salary_range && <MetaRow label="Compensation" val={job.salary_range}/>}
                <MetaRow label="Type" val={[job.employment_type?.replace(/_/g, " "), job.experience_level].filter(Boolean).join(" · ")}/>
                <MetaRow label="Posted" val={new Date(job.created_at).toLocaleDateString()}/>
                <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }}/>
                <div>
                  <div className="tiny" style={{ marginBottom: 8 }}>Candidates</div>
                  <PipeMini label="Total" count={totalCands} max={Math.max(totalCands, 1)} color="var(--stage-new)"/>
                </div>
                {job.required_skills?.length > 0 && (
                  <div>
                    <div className="tiny" style={{ marginBottom: 8 }}>Required skills</div>
                    <div className="tsChips" style={{ gap: 4 }}>
                      {job.required_skills.slice(0, 6).map(s => (
                        <span key={s} className="tsChip" style={{ fontSize: 11 }}>{s}</span>
                      ))}
                      {job.required_skills.length > 6 && (
                        <span className="tsChip" style={{ fontSize: 11 }}>+{job.required_skills.length - 6}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading...</div>
          )}
        </aside>

        {/* Right: Filters + Candidates */}
        <main className="tsCands-main">
          <CandidateFilters filters={filters} setFilters={setFilters}/>

          <div className="tsCands-list">
            <div className="tsCands-toolbar">
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>
                  {candidatesLoading ? "…" : totalCands} candidates
                </div>
                <div className="small" style={{ color: "var(--muted)" }}>Sorted by overall score</div>
              </div>
              <div style={{ flex: 1 }}/>
              {!hideUpload && (
                <Button variant="secondary" icon={<Icon.Upload size={13}/>} size="sm" onClick={() => setShowUpload(true)}>
                  Upload resumes
                </Button>
              )}
              <Select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                options={[
                  { value: "overall", label: "Sort: Overall score" },
                  { value: "skills", label: "Sort: Skills match" },
                  { value: "recent", label: "Sort: Recently applied" },
                  { value: "years", label: "Sort: Years of experience" },
                ]}
              />
              <div className="tsViewToggle">
                <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")}><Icon.Grid size={14}/></button>
                <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}><Icon.List size={14}/></button>
                <button onClick={() => router.push("/pipeline")}><Icon.Kanban size={14}/></button>
              </div>
            </div>

            {candidatesLoading && <div style={{ padding: 32, color: "var(--muted)" }}>Loading candidates...</div>}

            {!candidatesLoading && candidates.length === 0 && (
              <div style={{ padding: "48px 0", textAlign: "center", color: "var(--muted)" }}>
                <Icon.Users size={32} style={{ marginBottom: 12 }}/>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>No candidates yet</div>
                <div className="small" style={{ marginBottom: 16 }}>Upload resumes to start reviewing candidates for this job.</div>
                {!hideUpload && (
                  <Button variant="secondary" icon={<Icon.Upload size={13}/>} size="sm" onClick={() => setShowUpload(true)}>
                    Upload resumes
                  </Button>
                )}
              </div>
            )}

            <div className={view === "grid" ? "tsCands-grid" : "tsCands-listView"}>
              {candidates.map((c, i) => {
                const mapped = {
                  ...c,
                  score: c.overall_score ?? 0,
                  skillsScore: c.skills_score ?? 0,
                  expScore: c.experience_score ?? 0,
                  eduScore: c.education_score ?? 0,
                  achScore: c.achievements_score ?? 0,
                  skills: c.technical_skills ?? [],
                  stage: c.status,
                  strengths: [],
                  concerns: [],
                  avatar: "",
                  title: "",
                  years: 0,
                };
                return view === "grid"
                  ? <CandidateCard key={c.id} c={mapped} idx={i} onView={() => setDetailCand(mapped)} onProfile={() => router.push(`/candidates/${c.id}`)}
                      onShortlist={() => updateStage.mutate({ id: c.id, status: "shortlisted" }, {
                        onSuccess: () => toast({ message: `${c.name} shortlisted.` }),
                        onError: () => toast({ message: "Failed to update.", variant: "error" }),
                      })}
                      onReject={() => updateStage.mutate({ id: c.id, status: "rejected" }, {
                        onSuccess: () => toast({ message: `${c.name} rejected.` }),
                        onError: () => toast({ message: "Failed to update.", variant: "error" }),
                      })}
                    />
                  : <CandidateListRow key={c.id} c={mapped} onClick={() => router.push(`/candidates/${c.id}`)}/>;
              })}
            </div>
          </div>
        </main>
      </div>

      {detailCand && (
        <CandidateQuickModal
          c={detailCand}
          onClose={() => setDetailCand(null)}
          onProfile={() => { setDetailCand(null); router.push(`/candidates/${detailCand.id}`); }}
        />
      )}
      {showUpload && <ResumeBatchModal jobId={jobId} onClose={() => setShowUpload(false)}/>}
    </div>
  );
}

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
      <div style={{ height: "100%", borderRadius: 999, background: color, width: `${(count / max) * 100}%` }}/>
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
        <button className="tsBtn tsBtn-ghost tsBtn-sm" onClick={() => setFilters({
          minOverall: 0, minSkills: 0, minExp: 0, minEdu: 0, minAch: 0,
          required: [], nice: [], minYears: 0,
          industries: { Tech: false, Finance: false, Healthcare: false, Consumer: false },
          leadership: false,
          degrees: { hs: false, bachelor: false, master: false, phd: false },
        })}>Clear</button>
      </div>

      <FilterGroup title="Scores">
        <FilterSlider label="Overall" value={filters.minOverall} onChange={v => setFilters((f: any) => ({ ...f, minOverall: v }))}/>
        <FilterSlider label="Skills match" value={filters.minSkills} onChange={v => setFilters((f: any) => ({ ...f, minSkills: v }))} color="var(--primary)"/>
        <FilterSlider label="Experience" value={filters.minExp} onChange={v => setFilters((f: any) => ({ ...f, minExp: v }))} color="var(--info)"/>
        <FilterSlider label="Education" value={filters.minEdu} onChange={v => setFilters((f: any) => ({ ...f, minEdu: v }))} color="var(--success)"/>
        <FilterSlider label="Achievements" value={filters.minAch} onChange={v => setFilters((f: any) => ({ ...f, minAch: v }))} color="var(--warning)"/>
      </FilterGroup>

      <FilterGroup title="Experience">
        <FilterSlider label="Min years" value={filters.minYears} onChange={v => setFilters((f: any) => ({ ...f, minYears: v }))} max={20} unit=" yr"/>
        <div className="tiny" style={{ marginTop: 10, marginBottom: 6 }}>Industry</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {Object.keys(filters.industries).map(k => (
            <Checkbox key={k} checked={filters.industries[k]} onChange={v => setFilters((f: any) => ({ ...f, industries: { ...f.industries, [k]: v } }))} label={k}/>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <Toggle checked={filters.leadership} onChange={v => setFilters((f: any) => ({ ...f, leadership: v }))} label="Must have led a team" size="sm"/>
        </div>
      </FilterGroup>

      <FilterGroup title="Education">
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {[{ id: "hs", l: "High school" }, { id: "bachelor", l: "Bachelor's" }, { id: "master", l: "Master's" }, { id: "phd", l: "PhD" }].map(d => (
            <Checkbox key={d.id} checked={filters.degrees[d.id]} onChange={v => setFilters((f: any) => ({ ...f, degrees: { ...f.degrees, [d.id]: v } }))} label={d.l}/>
          ))}
        </div>
      </FilterGroup>
    </aside>
  );
}

function FilterGroup({ title, children }: any) {
  const [open, setOpen] = useS_c(true);
  return (
    <div className="tsFilterGroup">
      <button className="tsFilterGroup-head" onClick={() => setOpen((o: boolean) => !o)}>
        <Icon.ChevronDown size={12} style={{ transform: open ? "" : "rotate(-90deg)", transition: "transform 0.18s" }}/>
        {title}
      </button>
      {open && <div className="tsFilterGroup-body">{children}</div>}
    </div>
  );
}

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
function stageBadgeVariant(stage: string): "success" | "danger" | "neutral" | "primary" {
  if (stage === "shortlisted") return "success";
  if (stage === "rejected") return "danger";
  if (stage === "interviewing") return "primary";
  return "neutral";
}

function CandidateCard({ c, idx, onView, onProfile, onShortlist, onReject }: any) {
  const tone = c.score >= 80 ? "success" : c.score >= 60 ? "warning" : "danger";
  return (
    <div className="tsCandCard" style={{ animationDelay: `${idx * 30}ms` }}>
      <div className="tsCandCard-head">
        <Avatar name={c.name} color={c.avatar} size={40}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 500, fontSize: 14 }}>{c.name}</div>
            {c.stage && (
              <Badge variant={stageBadgeVariant(c.stage)} style={{ fontSize: 10, padding: "1px 6px" }}>
                {c.stage.charAt(0).toUpperCase() + c.stage.slice(1)}
              </Badge>
            )}
          </div>
          <div className="small" style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title || "—"}</div>
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

      {c.skills.length > 0 && (
        <div className="tsCandCard-chips">
          {c.skills.slice(0, 4).map((s: string, i: number) => (
            <span key={s} className={`tsChip ${i < 2 ? "tsChip-required" : ""}`} style={{ fontSize: 10.5 }}>
              {i < 2 && <Icon.Check size={9} stroke={3}/>}
              {s}
            </span>
          ))}
          {c.skills.length > 4 && <span className="tsChip" style={{ fontSize: 10.5, color: "var(--muted)" }}>+{c.skills.length - 4}</span>}
        </div>
      )}

      {c.concerns.length > 0 && (
        <div className="tsCandCard-flags tsCandCard-flags-warn">
          <div className="tiny" style={{ color: "var(--warning)", display: "flex", alignItems: "center", gap: 4 }}>
            <Icon.AlertTriangle size={10}/>Concerns
          </div>
          {c.concerns.slice(0, 2).map((s: string, i: number) => <div key={i} className="small">{s}</div>)}
        </div>
      )}
      {c.strengths.length > 0 && (
        <div className="tsCandCard-flags tsCandCard-flags-good">
          <div className="tiny" style={{ color: "var(--success)", display: "flex", alignItems: "center", gap: 4 }}>
            <Icon.Check size={10} stroke={3}/>Strengths
          </div>
          {c.strengths.slice(0, 2).map((s: string, i: number) => <div key={i} className="small">{s}</div>)}
        </div>
      )}

      <div className="tsCandCard-foot">
        <button className="tsBtn tsBtn-ghost tsBtn-sm" onClick={onView}>View details</button>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="tsIconBtn" title="Shortlist" style={{ color: "var(--success)" }} onClick={onShortlist}><Icon.Check size={15} stroke={2.5}/></button>
          <button className="tsIconBtn" title="Reject" style={{ color: "var(--danger)" }} onClick={onReject}><Icon.X size={15} stroke={2.5}/></button>
          <button className="tsBtn tsBtn-primary tsBtn-sm" onClick={onProfile}>Open <Icon.ArrowRight size={11}/></button>
        </div>
      </div>
    </div>
  );
}

function CandidateListRow({ c, onClick }: any) {
  return (
    <div className="tsCandRowFull" onClick={onClick}>
      <Avatar name={c.name} color={c.avatar} size={36}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500 }}>{c.name}</div>
        <div className="small" style={{ color: "var(--muted)" }}>{c.title} · {c.years} yr</div>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {c.skills.slice(0, 3).map((s: string) => <span key={s} className="tsChip" style={{ fontSize: 10 }}>{s}</span>)}
      </div>
      <div style={{ width: 140 }}>
        <ScoreBar label="" value={c.score}/>
      </div>
      <ScorePill score={c.score}/>
      <StagePill stage={c.stage}/>
    </div>
  );
}

// ===== Quick view modal =====
function CandidateQuickModal({ c, onClose, onProfile }: any) {
  return (
    <Modal open={true} onClose={onClose} width={580}
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar name={c.name} color={c.avatar} size={40}/>
          <div>
            <div>{c.name}</div>
            <div className="small" style={{ color: "var(--muted)" }}>{c.title || "—"}</div>
          </div>
        </div>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="secondary" icon={<Icon.Check size={13} stroke={3}/>}>Shortlist</Button>
          <Button variant="primary" icon={<Icon.ArrowRight size={13}/>} onClick={() => { onClose(); onProfile(); }}>View full profile</Button>
        </>
      }
    >
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
          {c.concerns.length
            ? c.concerns.map((s: string, i: number) => <div key={i} className="small" style={{ marginBottom: 4 }}>• {s}</div>)
            : <div className="small" style={{ color: "var(--muted)" }}>None flagged.</div>}
        </div>
        <div className="tsFlagBox tsFlagBox-good">
          <div className="tiny" style={{ color: "var(--success)", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
            <Icon.Check size={11} stroke={3}/> Strengths
          </div>
          {c.strengths.length
            ? c.strengths.map((s: string, i: number) => <div key={i} className="small" style={{ marginBottom: 4 }}>• {s}</div>)
            : <div className="small" style={{ color: "var(--muted)" }}>None flagged.</div>}
        </div>
      </div>
    </Modal>
  );
}

export { Candidates, CandidateCard, CandidateListRow, CandidateFilters as FilterPanel };
export default Candidates;
