"use client";
import * as React from "react";
import { Icon } from "@/lib/icons";
import { Modal, Button, AIPill } from "@/components/ui";
import { Dropzone, FileRow } from "./Dropzone";
import { apiUpload, apiFetch } from "@/lib/api";

interface ParsedJD {
  title: string;
  department?: string | null;
  location?: string | null;
  employment_type?: string | null;
  experience_level?: string | null;
  salary_range?: string | null;
  required_skills: string[];
  nice_to_have_skills: string[];
  mustHave?: string[];
}

interface JDUploadModalProps {
  onClose: () => void;
  onParsed?: (jd: ParsedJD) => void;
}

const PARSE_STEPS = [
  { icon: "FileText", label: "Extracting document text…" },
  { icon: "Cpu",      label: "Reading job structure…" },
  { icon: "Target",   label: "Identifying required skills…" },
  { icon: "Sparkles", label: "Extracting role & compensation…" },
  { icon: "Check",    label: "Structuring extracted data…" },
];

export function JDUploadModal({ onClose, onParsed }: JDUploadModalProps) {
  const [stage, setStage] = React.useState<"drop" | "parsing" | "done" | "error">("drop");
  const [file, setFile] = React.useState<File | null>(null);
  const [progress, setProgress] = React.useState(0);
  const [parsed, setParsed] = React.useState<ParsedJD | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [stepIdx, setStepIdx] = React.useState(0);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const stepRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Advance steps linearly — stop at last step, never loop
  React.useEffect(() => {
    if (stage !== "parsing") {
      if (stepRef.current) { clearInterval(stepRef.current); stepRef.current = null; }
      return;
    }
    setStepIdx(0);
    stepRef.current = setInterval(() => {
      setStepIdx((i) => {
        if (i >= PARSE_STEPS.length - 1) {
          clearInterval(stepRef.current!);
          return i;
        }
        return i + 1;
      });
    }, 2200);
    return () => { if (stepRef.current) clearInterval(stepRef.current); };
  }, [stage]);

  // Clear polling on unmount
  React.useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (stepRef.current) clearInterval(stepRef.current);
    };
  }, []);

  const handleFiles = async (files: any[]) => {
    const f = files[0];
    setFile(f);
    setStage("parsing");
    setProgress(15);

    try {
      const formData = new FormData();
      formData.append("file", f);
      const { parseId } = await apiUpload<{ parseId: string }>("/api/jobs/parse-jd", formData);
      setProgress(30);

      let ticks = 0;
      pollRef.current = setInterval(async () => {
        ticks++;
        setProgress(Math.min(88, 30 + ticks * 6));

        try {
          const state = await apiFetch<{ status: string; result?: ParsedJD; error?: string }>(
            `/api/jobs/parse-jd/${parseId}`
          );

          if (state.status === "done" && state.result) {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setProgress(100);
            setParsed(state.result);
            setStage("done");
          } else if (state.status === "error") {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setError(state.error ?? "Parsing failed");
            setStage("error");
          }
        } catch {
          // network error during poll — keep trying
        }
      }, 2000);
    } catch (err: any) {
      setError(err?.message ?? "Failed to parse job description");
      setStage("error");
    }
  };

  const step = PARSE_STEPS[stepIdx];

  return (
    <Modal
      open
      onClose={onClose}
      width={620}
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span>Upload job description</span>
          <AIPill>AI-parsed</AIPill>
        </div>
      }
      subtitle="Upload a PDF or DOCX and we'll auto-fill the role, requirements, and scoring rubric."
      footer={
        stage === "done" ? (
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="secondary" onClick={() => { setStage("drop"); setParsed(null); setFile(null); }}>
              Re-upload
            </Button>
            <Button variant="primary" icon={<Icon.ArrowRight size={13} />} onClick={() => { onParsed?.(parsed!); onClose(); }}>
              Continue with these fields
            </Button>
          </>
        ) : stage === "error" ? (
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="secondary" onClick={() => { onParsed?.(null as any); onClose(); }}>
              Skip — start from scratch
            </Button>
          </>
        )
      }
    >
      {stage === "drop" && (
        <div>
          <Dropzone onFiles={handleFiles} />
          <div style={{ marginTop: 16, padding: 14, background: "var(--surface-2)", borderRadius: 10, display: "flex", gap: 12, alignItems: "flex-start" }}>
            <Icon.Info size={16} style={{ color: "var(--primary-3)", flexShrink: 0, marginTop: 1 }} />
            <div className="small" style={{ color: "var(--text-2)", lineHeight: 1.5 }}>
              <b style={{ color: "var(--text)" }}>What we extract:</b> role title, department, location, comp band, required & nice-to-have skills, must-haves, and a starting set of scoring weights. Everything is editable in the next steps.
            </div>
          </div>
        </div>
      )}

      {stage === "parsing" && (
        <div>
          <FileRow
            name={file?.name || "job-description.pdf"}
            size=""
            status="parsing"
            sub={`${progress}% · ${step.label}`}
          />
          <div className="tsBigProgress" style={{ marginTop: 10 }}>
            <div
              className="tsBigProgress-fill"
              style={{ width: `${progress}%`, transition: "width 0.6s ease" }}
            />
          </div>

          {/* Animated step list */}
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {PARSE_STEPS.map((s, i) => {
              const done = i < stepIdx;
              const active = i === stepIdx;
              return (
                <div
                  key={s.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: active ? "var(--surface-2)" : "transparent",
                    opacity: done ? 0.4 : active ? 1 : 0.25,
                    transition: "all 0.3s ease",
                  }}
                >
                  {done ? (
                    <Icon.Check size={13} stroke={3} style={{ color: "var(--success)", flexShrink: 0 }} />
                  ) : active ? (
                    <span className="tsFileRow-spin" style={{ flexShrink: 0 }} />
                  ) : (
                    <span style={{ width: 13, height: 13, flexShrink: 0 }} />
                  )}
                  <span className="small" style={{ color: active ? "var(--text)" : "var(--muted)" }}>
                    {s.label}
                  </span>
                  {active && <span style={{ marginLeft: "auto" }}><AIPill>Running</AIPill></span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {stage === "error" && (
        <div style={{ padding: 32, textAlign: "center" }}>
          <Icon.X size={32} style={{ color: "var(--danger)", marginBottom: 12 }} />
          <div style={{ fontWeight: 500, marginBottom: 8 }}>Parsing failed</div>
          <div className="small" style={{ color: "var(--muted)", marginBottom: 16 }}>{error}</div>
          <Button variant="secondary" onClick={() => { setStage("drop"); setFile(null); setError(null); }}>
            Try again
          </Button>
        </div>
      )}

      {stage === "done" && parsed && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Icon.Check size={16} stroke={3} style={{ color: "var(--success)" }} />
            <span style={{ fontWeight: 500 }}>Parsed successfully</span>
            <span className="small" style={{ color: "var(--muted)" }}>· edit any field on the next steps</span>
          </div>

          <div className="tsParsed">
            <div className="tsParsed-row">
              <span className="tiny">Role</span>
              <div style={{ fontWeight: 500 }}>{parsed.title}</div>
            </div>
            {parsed.department && (
              <div className="tsParsed-row">
                <span className="tiny">Department</span>
                <div>{parsed.department}</div>
              </div>
            )}
            {parsed.location && (
              <div className="tsParsed-row">
                <span className="tiny">Location</span>
                <div>{parsed.location}</div>
              </div>
            )}
            {parsed.salary_range && (
              <div className="tsParsed-row">
                <span className="tiny">Comp band</span>
                <div className="mono">{parsed.salary_range}</div>
              </div>
            )}
            {(parsed.employment_type || parsed.experience_level) && (
              <div className="tsParsed-row">
                <span className="tiny">Type · Level</span>
                <div>{[parsed.employment_type, parsed.experience_level].filter(Boolean).join(" · ")}</div>
              </div>
            )}
          </div>

          {parsed.required_skills.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="tiny" style={{ marginBottom: 8 }}>
                Required skills <span style={{ color: "var(--success)" }}>· {parsed.required_skills.length} extracted</span>
              </div>
              <div className="tsChips">
                {parsed.required_skills.map((s) => (
                  <span key={s} className="tsChip tsChip-required">
                    <Icon.Check size={10} stroke={3} />
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {parsed.nice_to_have_skills.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="tiny" style={{ marginBottom: 8 }}>Nice-to-have</div>
              <div className="tsChips">
                {parsed.nice_to_have_skills.map((s) => (
                  <span key={s} className="tsChip">{s}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export type { ParsedJD };
