"use client";
import * as React from "react";
import { Icon } from "@/lib/icons";
import { Modal, Button, Badge, AIPill, useToast } from "@/components/ui";
import { Dropzone, FileRow } from "./Dropzone";
import { JOBS, CANDIDATES, NAMES } from "@/lib/data";

interface BatchFile {
  id: string;
  name: string;
  size: string;
  status: "queued" | "parsing" | "scoring" | "done" | "error";
  score: number | null;
  cand: any;
  sub?: string;
}

interface ResumeBatchModalProps {
  onClose: () => void;
  onMatched?: (files: BatchFile[]) => void;
  defaultJobId?: string;
}

export function ResumeBatchModal({ onClose, onMatched, defaultJobId = "j1" }: ResumeBatchModalProps) {
  const [stage, setStage] = React.useState<"drop" | "processing" | "done">("drop");
  const [files, setFiles] = React.useState<BatchFile[]>([]);
  const [job, setJob] = React.useState(defaultJobId);
  const toast = useToast();

  const handleFiles = (fileList: any[]) => {
    const seedNames = NAMES.slice(0, fileList.length).map((n) => `${n.replace(" ", "_")}_resume.pdf`);
    const initial: BatchFile[] = fileList.map((f: any, i: number) => ({
      id: "f" + i,
      name: f.name && f.name !== "untitled" ? f.name : seedNames[i] || `resume_${i + 1}.pdf`,
      size: ((40 + Math.random() * 240) | 0) + " KB",
      status: "queued",
      score: null,
      cand: null,
    }));
    setFiles(initial);
    setStage("processing");

    // Animate per-file. Replace with real parse + score API calls.
    initial.forEach((f, i) => {
      setTimeout(() => setFiles((arr) => arr.map((x) => (x.id === f.id ? { ...x, status: "parsing" } : x))), 200 + i * 90);
      setTimeout(() => setFiles((arr) => arr.map((x) => (x.id === f.id ? { ...x, status: "scoring" } : x))), 700 + i * 90);
      setTimeout(() => {
        const c = CANDIDATES[i % CANDIDATES.length];
        setFiles((arr) =>
          arr.map((x) =>
            x.id === f.id
              ? { ...x, status: "done", score: c.score, cand: c, sub: `Matched to ${c.name}` }
              : x
          )
        );
      }, 1200 + i * 110);
    });
    setTimeout(() => setStage("done"), 1300 + initial.length * 110);
  };

  const seedDemo = () => {
    handleFiles(Array.from({ length: 12 }, () => ({ name: "" })));
  };

  const sortedFiles = [...files].sort((a, b) => (b.score || 0) - (a.score || 0));
  const highMatches = sortedFiles.filter((f) => (f.score || 0) >= 80).length;
  const mediumMatches = sortedFiles.filter((f) => (f.score || 0) >= 60 && (f.score || 0) < 80).length;

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
            <Button variant="secondary" onClick={() => { setFiles([]); setStage("drop"); }}>Upload more</Button>
            <Button
              variant="primary"
              icon={<Icon.ArrowRight size={13} />}
              onClick={() => {
                toast({ message: `${highMatches} candidates added to ${JOBS.find((j) => j.id === job)?.title}` });
                onMatched?.(sortedFiles);
                onClose();
              }}
            >
              Add {highMatches} to pipeline
            </Button>
          </>
        ) : stage === "processing" ? (
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="secondary" onClick={seedDemo} icon={<Icon.Sparkles size={13} />}>
              Try with sample batch
            </Button>
          </>
        )
      }
    >
      {stage === "drop" && (
        <div>
          <div style={{ marginBottom: 14 }}>
            <div className="tiny" style={{ marginBottom: 6 }}>Score against</div>
            <select
              className="tsSelect"
              value={job}
              onChange={(e) => setJob(e.target.value)}
              style={{ width: "100%", padding: 10 }}
            >
              {JOBS.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title} · {j.department}
                </option>
              ))}
            </select>
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
                  {files.filter((f) => f.status === "done").length}/{files.length} scored
                </span>
                <span style={{ flex: 1 }} />
                <span className="small" style={{ color: "var(--muted)" }}>
                  ~{Math.max(1, (files.filter((f) => f.status !== "done").length * 0.4) | 0)}s remaining
                </span>
              </div>
              <div className="tsBigProgress" style={{ height: 6 }}>
                <div
                  className="tsBigProgress-fill"
                  style={{ width: `${(files.filter((f) => f.status === "done").length / Math.max(1, files.length)) * 100}%` }}
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
                  {files.length - highMatches - mediumMatches}
                </div>
                <div className="small" style={{ color: "var(--muted)" }}>Below threshold</div>
              </div>
            </div>
          )}

          <div className="tsFileList">
            {(stage === "done" ? sortedFiles : files).map((f) => (
              <FileRow key={f.id} name={f.name} size={f.size} status={f.status} score={f.score} sub={f.sub} />
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
