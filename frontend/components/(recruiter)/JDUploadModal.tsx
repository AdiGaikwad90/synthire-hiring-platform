"use client";
import * as React from "react";
import { Icon } from "@/lib/icons";
import { Modal, Button, AIPill, Badge } from "@/components/ui";
import { Dropzone, FileRow } from "./Dropzone";

interface ParsedJD {
  title: string;
  dept: string;
  location: string;
  type: string;
  level: string;
  salary: string;
  required: string[];
  nice: string[];
  mustHave: string[];
  niceHave: string[];
}

interface JDUploadModalProps {
  onClose: () => void;
  onParsed?: (jd: ParsedJD) => void;
}

export function JDUploadModal({ onClose, onParsed }: JDUploadModalProps) {
  const [stage, setStage] = React.useState<"drop" | "parsing" | "done">("drop");
  const [file, setFile] = React.useState<File | null>(null);
  const [progress, setProgress] = React.useState(0);
  const [parsed, setParsed] = React.useState<ParsedJD | null>(null);

  const handleFiles = (files: any[]) => {
    const f = files[0];
    setFile(f);
    setStage("parsing");
    setProgress(0);

    // Simulated parsing pipeline — replace with real PDF parse + LLM extraction
    const ticks = [
      { p: 15, msg: "Extracting text from PDF…" },
      { p: 35, msg: "Identifying sections…" },
      { p: 55, msg: "Extracting required skills…" },
      { p: 75, msg: "Parsing compensation & location…" },
      { p: 92, msg: "Detecting interview rounds…" },
      { p: 100, msg: "Done" },
    ];
    let i = 0;
    const tick = () => {
      if (i >= ticks.length) {
        setStage("done");
        setParsed({
          title: "Senior Backend Engineer",
          dept: "Engineering",
          location: "Remote · US",
          type: "Full-time",
          level: "Senior",
          salary: "$170-220k",
          required: ["Python", "Go", "AWS", "PostgreSQL", "Distributed systems"],
          nice: ["Kubernetes", "gRPC", "Rust"],
          mustHave: [
            "5+ years building production backend systems",
            "Strong CS fundamentals (data structures, algorithms, distributed systems)",
            "Experience with cloud platforms (AWS preferred)",
            "Bachelor's degree in CS or equivalent practical experience",
          ],
          niceHave: [
            "Open-source contributions",
            "Experience scaling systems past 10M daily requests",
            "Mentorship of mid-level engineers",
          ],
        });
        return;
      }
      setProgress(ticks[i].p);
      i++;
      setTimeout(tick, 220 + Math.random() * 180);
    };
    setTimeout(tick, 180);
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
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="secondary" disabled>Skip — start from scratch</Button>
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
          <FileRow name={file?.name || "Senior_Backend_Engineer_JD.pdf"} size="142 KB" status="parsing" sub={`${progress}% · ${progress < 100 ? "analyzing" : "almost done"}`} />
          <div className="tsBigProgress">
            <div className="tsBigProgress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="ai-border" style={{ padding: 16, borderRadius: 12, marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <AIPill>Live extraction</AIPill>
              <span className="small" style={{ color: "var(--muted)" }}>Streaming…</span>
            </div>
            <div className="tsParse-stream">
              {progress >= 15 && (
                <div className="tsParse-line">
                  ✓ Detected role: <b className="ai-text">Senior Backend Engineer</b>
                </div>
              )}
              {progress >= 35 && (
                <div className="tsParse-line">
                  ✓ Found 7 sections: summary, requirements, nice-to-haves, comp, benefits, process, location
                </div>
              )}
              {progress >= 55 && (
                <div className="tsParse-line">
                  ✓ Required skills: Python, Go, AWS, PostgreSQL, Distributed systems
                </div>
              )}
              {progress >= 75 && (
                <div className="tsParse-line">
                  ✓ Compensation: <span className="mono">$170-220k</span> · Location: <span className="mono">Remote · US</span>
                </div>
              )}
              {progress >= 92 && (
                <div className="tsParse-line">
                  ✓ 4 interview rounds inferred (matches your Engineering template)
                </div>
              )}
            </div>
          </div>
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
            <div className="tsParsed-row">
              <span className="tiny">Department</span>
              <div>{parsed.dept}</div>
            </div>
            <div className="tsParsed-row">
              <span className="tiny">Location</span>
              <div>{parsed.location}</div>
            </div>
            <div className="tsParsed-row">
              <span className="tiny">Comp band</span>
              <div className="mono">{parsed.salary}</div>
            </div>
            <div className="tsParsed-row">
              <span className="tiny">Type · Level</span>
              <div>
                {parsed.type} · {parsed.level}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <div className="tiny" style={{ marginBottom: 8 }}>
              Required skills <span style={{ color: "var(--success)" }}>· {parsed.required.length} extracted</span>
            </div>
            <div className="tsChips">
              {parsed.required.map((s) => (
                <span key={s} className="tsChip tsChip-required">
                  <Icon.Check size={10} stroke={3} />
                  {s}
                </span>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="tiny" style={{ marginBottom: 8 }}>
              Nice-to-have
            </div>
            <div className="tsChips">
              {parsed.nice.map((s) => (
                <span key={s} className="tsChip">{s}</span>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="tiny" style={{ marginBottom: 8 }}>
              Must-have requirements ({parsed.mustHave.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {parsed.mustHave.map((m, i) => (
                <div key={i} className="small" style={{ display: "flex", gap: 8, padding: "8px 10px", background: "var(--surface-2)", borderRadius: 6 }}>
                  <Icon.Check size={11} stroke={3} style={{ color: "var(--success)", flexShrink: 0, marginTop: 3 }} />
                  <span>{m}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export type { ParsedJD };
