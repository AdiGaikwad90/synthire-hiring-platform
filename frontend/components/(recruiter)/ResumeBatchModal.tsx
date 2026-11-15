"use client";
import * as React from "react";
import { Icon } from "@/lib/icons";
import { Modal, Button, Badge, AIPill, Select, useToast } from "@/components/ui";
import { Dropzone, FileRow } from "./Dropzone";
import { useJobs } from "@/hooks/queries/useJobs";
import { useUploadResume, useUploadProgress } from "@/hooks/queries/useCandidates";
import { ApiError } from "@/lib/api";
import { uploadRow, isSettledUploadStatus } from "@/lib/upload-status";

/** What the dialog itself knows about a file; everything shown is derived from this plus the candidate record. */
interface BatchFile {
  id: string;
  name: string;
  size: string;
  candidateId: string | null;
  uploadError: string | null;
}

interface ResumeBatchModalProps {
  onClose: () => void;
  jobId?: string;
}

export function ResumeBatchModal({ onClose, jobId }: ResumeBatchModalProps) {
  const [files, setFiles] = React.useState<BatchFile[]>([]);
  const [job, setJob] = React.useState(jobId ?? "");
  const toast = useToast();
  const { data: jobsData } = useJobs();
  const upload = useUploadResume();
  // Progress checks and the list/count refreshes live in the hook; nothing here
  // owns a timer, so closing the dialog stops them (SYN-005).
  const progress = useUploadProgress(files.flatMap((f) => (f.candidateId ? [f.candidateId] : [])));

  const handleFiles = (fileList: File[]) => {
    const batch = fileList.map((f, i) => ({
      file: f,
      entry: {
        id: `f${Date.now()}-${i}`,
        name: f.name || `resume_${i + 1}.pdf`,
        size: ((f.size / 1024) | 0) + " KB",
        candidateId: null,
        // Resumes are scored against a job; without one the server refuses the
        // file with a field error, so say it plainly and skip the request.
        uploadError: job ? null : "Choose a job first — resumes are scored against a job",
      } as BatchFile,
    }));
    setFiles(batch.map((b) => b.entry));
    if (!job) return;

    const patch = (id: string, change: Partial<BatchFile>) =>
      setFiles((arr) => arr.map((x) => (x.id === id ? { ...x, ...change } : x)));

    batch.forEach(({ file, entry }) => {
      upload.mutateAsync({ file, jobId: job })
        .then(({ candidateId }) => patch(entry.id, { candidateId }))
        .catch((err) => patch(entry.id, { uploadError: err instanceof ApiError && err.message ? err.message : "Upload failed" }));
    });
  };

  const rows = files.map((f) => {
    const seen = f.candidateId ? progress.get(f.candidateId) : undefined;
    return {
      ...f,
      ...uploadRow({ accepted: !!f.candidateId, uploadError: f.uploadError, candidate: seen?.candidate ?? null, ticks: seen?.ticks ?? 0 }),
    };
  });

  const stage: "drop" | "processing" | "done" =
    rows.length === 0 ? "drop" : rows.every((r) => isSettledUploadStatus(r.status)) ? "done" : "processing";

  const sortedFiles = [...rows].sort((a, b) => (b.score || 0) - (a.score || 0));
  const highMatches = sortedFiles.filter((f) => (f.score || 0) >= 80).length;
  const mediumMatches = sortedFiles.filter((f) => (f.score || 0) >= 60 && (f.score || 0) < 80).length;
  // Only files that were actually scored — a failed upload is not a low score.
  const belowThreshold = sortedFiles.filter((f) => f.score != null && f.score < 60).length;

  return (
    <Modal
      open
      onClose={onClose}
      width={720}
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span>Upload resumes</span>
          {stage === "processing" && <Badge variant="warning" dot>Processing</Badge>}
          {stage === "done" && <Badge variant="success" dot>Complete</Badge>}
        </div>
      }
      subtitle={
        stage === "drop"
          ? "Drop a batch of resumes — we'll parse each one and score it against the job."
          : stage === "processing"
            ? "Parsing & scoring in parallel. Top matches will surface as they complete."
            : `Done — ${highMatches} strong matches (≥80%), ${mediumMatches} medium (60–79%).`
      }
      footer={
        stage === "done" ? (
          <>
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button variant="secondary" onClick={() => setFiles([])}>Upload more</Button>
            <Button
              variant="primary"
              icon={<Icon.ArrowRight size={13} />}
              onClick={() => {
                const jobTitle = jobsData?.items.find((j) => j.id === job)?.title ?? "pipeline";
                const addedCount = sortedFiles.filter(f => f.status === 'done').length;
                toast({ message: `${addedCount} candidate${addedCount !== 1 ? 's' : ''} added to ${jobTitle}` });
                onClose();
              }}
            >
              Add {sortedFiles.filter(f => f.status === 'done').length} to pipeline
            </Button>
          </>
        ) : stage === "processing" ? (
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
          </>
        )
      }
    >
      {stage === "drop" && (
        <div>
          <div style={{ marginBottom: 14 }}>
            <div className="tiny" style={{ marginBottom: 6 }}>Score against</div>
            <Select
              value={job}
              onChange={(e) => setJob(e.target.value)}
              options={[
                { value: "", label: "Select a job…" },
                ...(jobsData?.items ?? []).map((j) => ({
                  value: j.id,
                  label: j.department ? `${j.title} · ${j.department}` : j.title,
                })),
              ]}
            />
          </div>
          <Dropzone onFiles={handleFiles} multiple />
          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[
              { icon: <Icon.Cpu size={14} />, t: "Parse 100/min", s: "Concurrent OCR + LLM extraction" },
              { icon: <Icon.Target size={14} />, t: "Score live", s: "Against your job's scoring weights" },
              { icon: <Icon.ShieldCheck size={14} />, t: "PII-safe", s: "Resumes encrypted at rest" },
            ].map((it) => (
              <div key={it.t} className="tsCapsule">
                <div style={{ color: "var(--primary-3)" }}>{it.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 500, marginTop: 6 }}>{it.t}</div>
                <div className="small" style={{ color: "var(--muted)" }}>{it.s}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(stage === "processing" || stage === "done") && (
        <div>
          {stage === "processing" && (
            <div className="ai-border" style={{ padding: 14, borderRadius: 12, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <AIPill>Live progress</AIPill>
                <span className="mono small">
                  {rows.filter((f) => f.status === "done").length}/{rows.length} scored
                </span>
                <span style={{ flex: 1 }} />
                <span className="small" style={{ color: "var(--muted)" }}>
                  ~{Math.max(1, (rows.filter((f) => f.status !== "done").length * 0.4) | 0)}s remaining
                </span>
              </div>
              <div className="tsBigProgress" style={{ height: 6 }}>
                <div
                  className="tsBigProgress-fill"
                  style={{ width: `${(rows.filter((f) => f.status === "done").length / Math.max(1, rows.length)) * 100}%` }}
                />
              </div>
            </div>
          )}

          {stage === "done" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
              <div className="tsResStat">
                <div className="mono" style={{ fontSize: 24, fontWeight: 600, color: "var(--success)" }}>{highMatches}</div>
                <div className="small" style={{ color: "var(--muted)" }}>Strong (≥80%)</div>
              </div>
              <div className="tsResStat">
                <div className="mono" style={{ fontSize: 24, fontWeight: 600, color: "var(--warning)" }}>{mediumMatches}</div>
                <div className="small" style={{ color: "var(--muted)" }}>Medium (60-79%)</div>
              </div>
              <div className="tsResStat">
                <div className="mono" style={{ fontSize: 24, fontWeight: 600, color: "var(--muted)" }}>
                  {belowThreshold}
                </div>
                <div className="small" style={{ color: "var(--muted)" }}>Below threshold</div>
              </div>
            </div>
          )}

          <div className="tsFileList">
            {(stage === "done" ? sortedFiles : rows).map((f) => (
              <FileRow key={f.id} name={f.name} size={f.size} status={f.status} score={f.score} sub={f.sub} />
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
