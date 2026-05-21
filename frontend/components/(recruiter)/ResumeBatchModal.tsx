"use client";
import * as React from "react";
import { Icon } from "@/lib/icons";
import { Modal, Button, Badge, AIPill, useToast } from "@/components/ui";
import { Dropzone, FileRow } from "./Dropzone";
import { useJobs } from "@/hooks/queries/useJobs";
import { getToken } from "@/lib/auth";

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

export function ResumeBatchModal({ onClose, onMatched, defaultJobId = "" }: ResumeBatchModalProps) {
  const [stage, setStage] = React.useState<"drop" | "processing" | "done">("drop");
  const [files, setFiles] = React.useState<BatchFile[]>([]);
  const [job, setJob] = React.useState(defaultJobId);
  const toast = useToast();
  const { data: jobsData } = useJobs();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

  const handleFiles = (fileList: File[]) => {
    const initial: BatchFile[] = fileList.map((f, i) => ({
      id: "f" + i,
      name: f.name || `resume_${i + 1}.pdf`,
      size: ((f.size / 1024) | 0) + " KB",
      status: "queued",
      score: null,
      cand: null,
      _file: f,
    } as BatchFile & { _file: File }));
    setFiles(initial);
    setStage("processing");

    // Upload each file via SSE stream
    initial.forEach((entry) => {
      const file = (entry as BatchFile & { _file: File })._file;
      const fd = new FormData();
      fd.append("file", file);
      fd.append("jobId", job);
      const token = getToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      fetch(`${apiUrl}/api/candidates/upload`, { method: "POST", headers, body: fd })
        .then(async (res) => {
          const reader = res.body?.getReader();
          if (!reader) return;
          const decoder = new TextDecoder();
          let buf = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const events = buf.split("\n\n");
            buf = events.pop() ?? "";
            for (const event of events) {
              const dataLine = event.replace(/^data: /, "").trim();
              if (!dataLine) continue;
              try {
                const msg = JSON.parse(dataLine);
                setFiles((arr) =>
                  arr.map((x) =>
                    x.id === entry.id
                      ? {
                          ...x,
                          status: msg.status === "complete" ? "done" : msg.status,
                          score: msg.score ?? x.score,
                          sub: msg.status === "complete" ? `Score: ${msg.score}%` : undefined,
                          cand: msg.candidate ?? x.cand,
                        }
                      : x
                  )
                );
              } catch { /* ignore malformed */ }
            }
          }
        })
        .catch(() => {
          setFiles((arr) =>
            arr.map((x) => (x.id === entry.id ? { ...x, status: "error" } : x))
          );
        });
    });
  };

  // Watch for all done/error to advance stage
  React.useEffect(() => {
    if (stage !== "processing" || files.length === 0) return;
    const allSettled = files.every((f) => f.status === "done" || f.status === "error");
    if (allSettled) setStage("done");
  }, [files, stage]);

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
                const jobTitle = jobsData?.items.find((j) => j.id === job)?.title ?? "pipeline";
                toast({ message: `${highMatches} candidates added to ${jobTitle}` });
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
              <option value="">Select a job…</option>
              {(jobsData?.items ?? []).map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title} · {j.department ?? ""}
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
