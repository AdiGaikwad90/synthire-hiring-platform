"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Card, Button, Badge, SearchInput, useToast } from "@/components/ui";
import { useJobs, useJob, useUpdateJob } from "@/hooks/queries/useJobs";
import { ResumeBatchModal } from "./ResumeBatchModal";
import { Candidates } from "./Candidates";
import type { ApiJob } from "@/lib/api";

const { useState: useS_jobs, useEffect, useRef } = React;

// ── Job context menu ──────────────────────────────────────────────────────────

function JobContextMenu({ job, onEdit, onStatusChange }: { job: ApiJob; onEdit: () => void; onStatusChange: (s: string) => void }) {
  const [open, setOpen] = useS_jobs(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className="tsIconBtn"
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
      >
        <Icon.MoreH size={16}/>
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "100%", zIndex: 100, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 0", minWidth: 160, boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
          <button
            style={{ display: "block", width: "100%", padding: "8px 14px", textAlign: "left", fontSize: 13, background: "none", border: "none", cursor: "pointer", color: "var(--text-1)" }}
            onClick={e => { e.stopPropagation(); setOpen(false); onEdit(); }}
          >
            Edit job
          </button>
          <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }}/>
          {job.status !== "active" && (
            <button
              style={{ display: "block", width: "100%", padding: "8px 14px", textAlign: "left", fontSize: 13, background: "none", border: "none", cursor: "pointer", color: "var(--text-1)" }}
              onClick={e => { e.stopPropagation(); setOpen(false); onStatusChange("active"); }}
            >
              Set Active
            </button>
          )}
          {job.status !== "paused" && (
            <button
              style={{ display: "block", width: "100%", padding: "8px 14px", textAlign: "left", fontSize: 13, background: "none", border: "none", cursor: "pointer", color: "var(--text-1)" }}
              onClick={e => { e.stopPropagation(); setOpen(false); onStatusChange("paused"); }}
            >
              Pause
            </button>
          )}
          {job.status !== "closed" && (
            <button
              style={{ display: "block", width: "100%", padding: "8px 14px", textAlign: "left", fontSize: 13, background: "none", border: "none", cursor: "pointer", color: "var(--text-1)" }}
              onClick={e => { e.stopPropagation(); setOpen(false); onStatusChange("closed"); }}
            >
              Close
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Jobs list (/jobs) ─────────────────────────────────────────────────────────

function Jobs() {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useS_jobs("all");
  const [search, setSearch] = useS_jobs("");
  const [view, setView] = useS_jobs("table");

  const { data, isLoading } = useJobs();
  const updateJob = useUpdateJob();

  const handleStatusChange = (jobId: string, status: string) => {
    updateJob.mutate({ id: jobId, data: { status } }, {
      onSuccess: () => toast({ message: `Job status updated to ${status}.` }),
      onError: () => toast({ message: "Failed to update job status.", variant: "error" }),
    });
  };

  const filtered = (data?.items ?? []).filter(j =>
    (filter === "all" || j.status === filter) &&
    (!search || j.title.toLowerCase().includes(search.toLowerCase()))
  );

  if (isLoading) return <div className="tsPage"><div style={{padding:32,color:'var(--muted)'}}>Loading jobs...</div></div>;

  return (
    <div className="tsPage">
      <div className="tsPage-head">
        <div className="tsPage-headMain">
          <div className="h1">Jobs</div>
          <div className="small" style={{ color: "var(--muted)" }}>{data?.pagination?.total ?? 0} positions open</div>
        </div>
        <div className="tsPage-actions">
          <Button variant="secondary" icon={<Icon.Download size={14}/>} size="md">Export</Button>
          <Button variant="primary" icon={<Icon.Plus size={14}/>} onClick={() => router.push("/jobs/new")}>New job</Button>
        </div>
      </div>

      <div className="tsFilterBar">
        <div className="tsTabs tsTabs-pill">
          {(["all","active","paused","closed"] as const).map(f => (
            <button key={f} className={`tsTab ${filter === f ? "tsTab-active" : ""}`} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}{" "}
              <span className="tsTab-count">{f === "all" ? (data?.pagination?.total ?? 0) : (data?.items ?? []).filter(j => j.status === f).length}</span>
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }}/>
        <SearchInput value={search} onChange={setSearch} placeholder="Search jobs…" kbd=""/>
        <div className="tsViewToggle">
          <button className={view === "table" ? "active" : ""} onClick={() => setView("table")} aria-label="Table"><Icon.List size={14}/></button>
          <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label="Grid"><Icon.Grid size={14}/></button>
        </div>
      </div>

      {view === "table" ? (
        <Card padded={false}>
          <div className="tsJobsTable">
            <div className="tsJobsTable-head">
              <div>Role</div><div>Department</div><div>Location</div>
              <div style={{ textAlign: "right" }}>Applicants</div>
              <div>Pipeline</div><div></div>
            </div>
            {filtered.length === 0 && (
              <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--muted)" }}>
                No jobs found. <button className="tsLink" onClick={() => router.push("/jobs/new")}>Create your first job →</button>
              </div>
            )}
            {filtered.map((j, i) => (
              <div key={j.id} className="tsJobsTable-row" onClick={() => router.push(`/jobs/${j.id}`)} style={{ animationDelay: `${i * 30}ms` }}>
                <div>
                  <div className="tsJobsTable-title">{j.title}</div>
                  <div className="small">
                    <Badge variant={j.status === "active" ? "success" : j.status === "closed" ? "danger" : "warning"} dot>{j.status === "active" ? "Active" : j.status === "paused" ? "Paused" : "Closed"}</Badge>
                    <span style={{ marginLeft: 8, color: "var(--muted)" }}>Posted {new Date(j.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div>{j.department ?? ''}</div>
                <div className="small">{j.location ?? ''}</div>
                <div style={{ textAlign: "right" }}>
                  <div className="mono" style={{ fontWeight: 600 }}>{j.candidate_count ?? '—'}</div>
                  <div className="small">applicants</div>
                </div>
                <div><div className="tsPipeBar"/></div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <JobContextMenu job={j} onEdit={() => router.push(`/jobs/${j.id}/edit`)} onStatusChange={s => handleStatusChange(j.id, s)} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <div className="tsGrid tsGrid-3">
          {filtered.map(j => (
            <JobCard key={j.id} job={j} onClick={() => router.push(`/jobs/${j.id}`)} onEdit={() => router.push(`/jobs/${j.id}/edit`)} onStatusChange={s => handleStatusChange(j.id, s)}/>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Job detail (/jobs/[jobId]) ────────────────────────────────────────────────

function JobDetail({ jobId }: { jobId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { data: job, isLoading } = useJob(jobId);
  const updateJob = useUpdateJob();
  const initialTab = (searchParams.get('tab') as "overview" | "candidates" | "settings") ?? "overview";
  const [tab, setTab] = useS_jobs<"overview" | "candidates" | "settings">(initialTab);
  const [showUpload, setShowUpload] = useS_jobs(false);

  if (isLoading) return <div className="tsPage"><div style={{padding:32,color:'var(--muted)'}}>Loading...</div></div>;
  if (!job) return <div className="tsPage"><div style={{padding:32,color:'var(--muted)'}}>Job not found.</div></div>;

  return (
    <div className="tsPage">
      <div className="tsPage-head">
        <button className="tsBackBtn" onClick={() => router.push("/jobs")}>
          <Icon.ArrowLeft size={14}/> Back to jobs
        </button>
        <div className="tsPage-actions">
          {tab === "candidates" && (
            <Button variant="secondary" icon={<Icon.Upload size={15}/>} onClick={() => setShowUpload(true)}>
              Upload resumes
            </Button>
          )}
          <Button variant="secondary" icon={<Icon.Pencil size={14}/>} onClick={() => router.push(`/jobs/${jobId}/edit`)}>
            Edit job
          </Button>
        </div>
      </div>

      {/* Job header */}
      <div style={{ marginBottom: 20, padding: "18px 24px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: job.status === "active" ? "var(--success)" : "var(--warning)", display: "inline-block", flexShrink: 0 }}/>
              <span className="h2" style={{ fontSize: 20 }}>{job.title}</span>
            </div>
            <div className="small" style={{ color: "var(--muted)" }}>
              {[job.department, job.location, job.employment_type?.replace(/_/g, " ")].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {job.salary_range && <Badge variant="neutral">{job.salary_range}</Badge>}
            <Badge variant={job.status === "active" ? "success" : "warning"}>{job.status}</Badge>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tsTabs" style={{ marginBottom: 20 }}>
        {(["overview", "candidates", "settings"] as const).map(t => (
          <button key={t} className={`tsTab ${tab === t ? "tsTab-active" : ""}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === "candidates" && (job.candidate_count ?? 0) > 0 && (
              <span className="tsTab-badge">{job.candidate_count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "overview" && <JobOverviewTab job={job}/>}
      {tab === "candidates" && <Candidates jobId={job.id} hideUpload/>}
      {tab === "settings" && (
        <JobSettingsTab
          job={job}
          onSave={(data) => updateJob.mutate({ id: jobId, data }, {
            onSuccess: () => toast({ message: "Job updated." }),
          })}
        />
      )}

      {showUpload && <ResumeBatchModal jobId={job.id} onClose={() => setShowUpload(false)}/>}
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function JobOverviewTab({ job }: { job: ApiJob }) {
  const details = [
    { label: "Department", value: job.department },
    { label: "Location", value: job.location },
    { label: "Type", value: job.employment_type?.replace(/_/g, " ") },
    { label: "Level", value: job.experience_level },
    { label: "Salary", value: job.salary_range },
    { label: "Min. experience", value: job.min_years_experience ? `${job.min_years_experience} yrs` : null },
    { label: "Education", value: job.education_requirement },
    { label: "Posted", value: new Date(job.created_at).toLocaleDateString() },
  ].filter(r => r.value);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Card padded>
          <div className="h3" style={{ marginBottom: 14 }}>Job details</div>
          {details.map(row => (
            <div key={row.label} style={{ display: "grid", gridTemplateColumns: "130px 1fr", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <span className="small" style={{ color: "var(--muted)" }}>{row.label}</span>
              <span style={{ fontSize: 13.5, textTransform: "capitalize" }}>{row.value}</span>
            </div>
          ))}
        </Card>

        {job.description && (
          <Card padded>
            <div className="h4" style={{ marginBottom: 10 }}>Description</div>
            <div className="small" style={{ color: "var(--text-2)", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{job.description}</div>
          </Card>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {(job.required_skills?.length > 0) && (
          <Card padded>
            <div className="h4" style={{ marginBottom: 10 }}>Required skills</div>
            <div className="tsChips">
              {job.required_skills.map(s => (
                <span key={s} className="tsChip tsChip-required" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Icon.Check size={10} stroke={3}/>{s}
                </span>
              ))}
            </div>
          </Card>
        )}
        {(job.nice_to_have_skills?.length > 0) && (
          <Card padded>
            <div className="h4" style={{ marginBottom: 10 }}>Nice-to-have skills</div>
            <div className="tsChips">
              {job.nice_to_have_skills.map(s => <span key={s} className="tsChip">{s}</span>)}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Settings tab ──────────────────────────────────────────────────────────────

function JobSettingsTab({ job, onSave }: { job: ApiJob; onSave: (data: any) => void }) {
  const [status, setStatus] = useS_jobs(job.status);

  const handleStatus = (s: string) => {
    setStatus(s);
    onSave({ status: s });
  };

  return (
    <div style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 20 }}>
      <Card padded>
        <div className="h3" style={{ marginBottom: 4 }}>Job status</div>
        <div className="small" style={{ color: "var(--muted)", marginBottom: 16 }}>Control whether this job is accepting applications.</div>
        <div style={{ display: "flex", gap: 8 }}>
          {["active", "paused", "closed"].map(s => (
            <Button key={s} variant={status === s ? "primary" : "secondary"} size="sm"
              onClick={() => handleStatus(s)} style={{ textTransform: "capitalize" }}>{s}</Button>
          ))}
        </div>
      </Card>

      {job.scoring_dimensions && (
        <Card padded>
          <div className="h3" style={{ marginBottom: 4 }}>Scoring priorities</div>
          <div className="small" style={{ color: "var(--muted)", marginBottom: 16 }}>AI scoring weights used to rank candidates for this job.</div>
          {Object.entries(job.scoring_dimensions).map(([key, dim]: [string, any]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 13.5, textTransform: "capitalize", width: 110 }}>{key}</span>
              <div style={{ flex: 1, height: 6, background: "var(--border)", borderRadius: 3 }}>
                <div style={{ width: `${dim.importance}%`, height: "100%", background: "var(--primary)", borderRadius: 3 }}/>
              </div>
              <span className="mono small" style={{ width: 36, textAlign: "right" }}>{dim.importance}%</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ── Job card (grid view) ──────────────────────────────────────────────────────

const JobCard = ({ job, onClick, onEdit, onStatusChange }: { job: ApiJob; onClick: () => void; onEdit: () => void; onStatusChange: (s: string) => void }) => (
  <Card hoverable onClick={onClick}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
      <Badge variant={job.status === "active" ? "success" : job.status === "closed" ? "danger" : "warning"} dot>
        {job.status === "active" ? "Active" : job.status === "paused" ? "Paused" : "Closed"}
      </Badge>
      <JobContextMenu job={job} onEdit={onEdit} onStatusChange={onStatusChange} />
    </div>
    <div className="h3" style={{ marginBottom: 4 }}>{job.title}</div>
    <div className="small" style={{ color: "var(--muted)", marginBottom: 14 }}>
      {[job.department, job.location].filter(Boolean).join(" · ")}
      {job.salary_range && ` · ${job.salary_range}`}
    </div>
    <div style={{ display: "flex", gap: 18, marginBottom: 14 }}>
      <div>
        <div className="mono" style={{ fontSize: 18, fontWeight: 600 }}>{job.candidate_count ?? 0}</div>
        <div className="tiny">Applicants</div>
      </div>
    </div>
    <div className="tsPipeBar"/>
    <div className="small" style={{ marginTop: 12, color: "var(--muted)" }}>
      Posted {new Date(job.created_at).toLocaleDateString()}
    </div>
  </Card>
);

const JobPipelineBar = ({ job }: any) => <div className="tsPipeBar"/>;

export { Jobs, JobDetail, JobCard, JobPipelineBar };
export default Jobs;
