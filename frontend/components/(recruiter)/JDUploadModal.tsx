"use client";
import * as React from "react";
import { Icon } from "@/lib/icons";
import { Modal, Button, AIPill, Badge } from "@/components/ui";
import { Dropzone, FileRow } from "./Dropzone";
import { apiUpload } from "@/lib/api";

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

export function JDUploadModal({ onClose, onParsed }: JDUploadModalProps) {
  const [stage, setStage] = React.useState<"drop" | "parsing" | "done" | "error">("drop");
  const [file, setFile] = React.useState<File | null>(null);
  const [progress, setProgress] = React.useState(0);
  const [parsed, setParsed] = React.useState<ParsedJD | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handleFiles = async (files: any[]) => {
    const f = files[0];
    setFile(f);
    setStage("parsing");
    setProgress(20);

    try {
      setProgress(50);
      const formData = new FormData();
      formData.append("file", f);
      const result = await apiUpload<ParsedJD>("/api/jobs/parse-jd", formData);
      setProgress(100);
      setParsed(result);
      setStage("done");
    } catch (err: any) {
      setError(err?.message ?? "Failed to parse job description");
      setStage("error");
    }
  };

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
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={() => { setStage("drop"); setParsed(null); setFile(null); }}>
              Re-upload
            </Button>
            <Button variant="primary" icon={<Icon.ArrowRight size={13} />} onClick={() => { onParsed?.(parsed!); onClose(); }}>
              Continue with these fields
            </Button>
          </>
        ) : stage === "error" ? (
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="secondary" onClick={() => { onParsed?.(null as any); onClose(); }}>Skip — start from scratch</Button>
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
          <FileRow name={file?.name || "job-description.pdf"} size="" status="parsing" sub={`${progress}% · Extracting with AI…`} />
          <div className="tsBigProgress">
            <div className="tsBigProgress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div style={{ marginTop: 16, padding: 14, background: "var(--surface-2)", borderRadius: 10, display: "flex", gap: 10, alignItems: "center" }}>
            <Icon.Sparkles size={14} style={{ color: "var(--primary-3)" }}/>
            <span className="small" style={{ color: "var(--text-2)" }}>Reading document and extracting job details with AI…</span>
          </div>
        </div>
      )}

      {stage === "error" && (
        <div style={{ padding: 32, textAlign: "center" }}>
          <Icon.X size={32} style={{ color: "var(--danger)", marginBottom: 12 }}/>
          <div style={{ fontWeight: 500, marginBottom: 8 }}>Parsing failed</div>
          <div className="small" style={{ color: "var(--muted)", marginBottom: 16 }}>{error}</div>
          <Button variant="secondary" onClick={() => { setStage("drop"); setFile(null); setError(null); }}>Try again</Button>
        </div>
      )}

      {stage === "done" && parsed && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Icon.Check size={16} stroke={3} style={{ color: "var(--success)" }} />
            <span style={{ fontWeight: 500 }}>Parsed successfully</span>
            <span className="small" style={{ color: "var(--muted)" }}>
              · edit any field on the next steps
            </span>
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
                <div>
                  {[parsed.employment_type, parsed.experience_level].filter(Boolean).join(" · ")}
                </div>
              </div>
            )}
          </div>

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

          {parsed.nice_to_have_skills.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="tiny" style={{ marginBottom: 8 }}>
                Nice-to-have
              </div>
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
