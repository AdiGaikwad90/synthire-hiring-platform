"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Card, Button, Badge, SearchInput } from "@/components/ui";
import { useJobs } from "@/hooks/queries/useJobs";
import { ResumeBatchModal } from "./ResumeBatchModal";

// Jobs list screen
const { useState: useS_jobs, useMemo: useM_jobs } = React;

function Jobs() {
  const router = useRouter();
  const [filter, setFilter] = useS_jobs("all");
  const [search, setSearch] = useS_jobs("");
  const [view, setView] = useS_jobs("table");
  const [showUpload, setShowUpload] = useS_jobs(false);

  const { data, isLoading } = useJobs();

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
          <div className="small" style={{ color: "var(--muted)" }}>{data?.pagination?.total ?? 0} positions · 1,247 total applicants this quarter</div>
        </div>
        <div className="tsPage-actions">
          <Button variant="secondary" icon={<Icon.Upload size={14}/>} onClick={() => setShowUpload(true)}>Upload resumes</Button>
          <Button variant="secondary" icon={<Icon.Download size={14}/>} size="md">Export</Button>
          <Button variant="primary" icon={<Icon.Plus size={14}/>} onClick={() => router.push("/jobs/new")}>New job</Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="tsFilterBar">
        <div className="tsTabs tsTabs-pill">
          <button className={`tsTab ${filter === "all" ? "tsTab-active" : ""}`} onClick={() => setFilter("all")}>All <span className="tsTab-count">{data?.pagination?.total ?? 0}</span></button>
          <button className={`tsTab ${filter === "active" ? "tsTab-active" : ""}`} onClick={() => setFilter("active")}>Active <span className="tsTab-count">{(data?.items ?? []).filter(j => j.status === "active").length}</span></button>
          <button className={`tsTab ${filter === "paused" ? "tsTab-active" : ""}`} onClick={() => setFilter("paused")}>Paused <span className="tsTab-count">{(data?.items ?? []).filter(j => j.status === "paused").length}</span></button>
          <button className={`tsTab ${filter === "closed" ? "tsTab-active" : ""}`} onClick={() => setFilter("closed")}>Closed <span className="tsTab-count">0</span></button>
        </div>
        <div style={{ flex: 1 }}/>
        <SearchInput value={search} onChange={setSearch} placeholder="Search jobs…" kbd=""/>
        <div className="tsViewToggle">
          <button className={view === "table" ? "active" : ""} onClick={() => setView("table")} aria-label="Table"><Icon.List size={14}/></button>
          <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label="Grid"><Icon.Grid size={14}/></button>
        </div>
      </div>

      {/* Table */}
      {view === "table" ? (
        <Card padded={false}>
          <div className="tsJobsTable">
            <div className="tsJobsTable-head">
              <div>Role</div>
              <div>Department</div>
              <div>Location</div>
              <div style={{ textAlign: "right" }}>Applicants</div>
              <div>Pipeline</div>
              <div></div>
            </div>
            {filtered.map((j, i) => (
              <div key={j.id} className="tsJobsTable-row" onClick={() => router.push(`/jobs/${j.id}`)} style={{ animationDelay: `${i * 30}ms` }}>
                <div>
                  <div className="tsJobsTable-title">{j.title}</div>
                  <div className="small">
                    <Badge variant={j.status === "active" ? "success" : "warning"} dot>{j.status === "active" ? "Active" : "Paused"}</Badge>
                    <span style={{ marginLeft: 8, color: "var(--muted)" }}>Posted {new Date(j.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div>{j.department ?? ''}</div>
                <div className="small">{j.location ?? ''}</div>
                <div style={{ textAlign: "right" }}>
                  <div className="mono" style={{ fontWeight: 600 }}>—</div>
                  <div className="small">applicants</div>
                </div>
                <div><div className="tsPipeBar"/></div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button className="tsIconBtn"><Icon.MoreH size={16}/></button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <div className="tsGrid tsGrid-3">
          {filtered.map(j => <JobCard key={j.id} job={{ ...j, department: j.department ?? '', location: j.location ?? '', applicants: 0, shortlisted: 0, interviewing: 0, hired: 0, posted: new Date(j.created_at).toLocaleDateString(), salary: j.salary_range ?? '' }} onClick={() => router.push(`/jobs/${j.id}`)}/>)}
        </div>
      )}
      {showUpload && <ResumeBatchModal onClose={() => setShowUpload(false)}/>}
    </div>
  );
};

const JobPipelineBar = ({ job }: any) => {
  const total = job.applicants;
  const segments = [
    { count: job.applicants - job.shortlisted - job.interviewing - job.hired, color: "var(--stage-new)" },
    { count: job.shortlisted, color: "var(--stage-shortlisted)" },
    { count: job.interviewing, color: "var(--stage-inprogress)" },
    { count: job.hired, color: "var(--stage-hired)" },
  ];
  return (
    <div className="tsPipeBar">
      {segments.map((s, i) => s.count > 0 && (
        <div key={i} className="tsPipeBar-seg" style={{ flex: s.count, background: s.color }}/>
      ))}
    </div>
  );
};

const JobCard = ({ job, onClick }: any) => {
    return (
    <Card hoverable onClick={onClick}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <Badge variant={job.status === "active" ? "success" : "warning"} dot>{job.status === "active" ? "Active" : "Paused"}</Badge>
        <button className="tsIconBtn" onClick={e => e.stopPropagation()}><Icon.MoreH size={14}/></button>
      </div>
      <div className="h3" style={{ marginBottom: 4 }}>{job.title}</div>
      <div className="small" style={{ color: "var(--muted)", marginBottom: 14 }}>{job.department} · {job.location}</div>
      <div style={{ display: "flex", gap: 18, marginBottom: 14 }}>
        <div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 600 }}>{job.applicants}</div>
          <div className="tiny">Applicants</div>
        </div>
        <div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 600, color: "var(--stage-shortlisted)" }}>{job.shortlisted}</div>
          <div className="tiny">Shortlisted</div>
        </div>
        <div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 600, color: "var(--stage-inprogress)" }}>{job.interviewing}</div>
          <div className="tiny">Interviewing</div>
        </div>
      </div>
      <JobPipelineBar job={job}/>
      <div className="small" style={{ marginTop: 12, color: "var(--muted)" }}>Posted {job.posted} · {job.salary}</div>
    </Card>
  );
};


export { Jobs, JobCard, JobPipelineBar };
export default Jobs;
