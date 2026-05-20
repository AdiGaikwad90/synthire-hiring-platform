"use client";
import * as React from "react";
import { Icon } from "@/lib/icons";
import { ScorePill, AIPill } from "@/components/ui";

interface DropzoneProps {
  onFiles: (files: File[] | { name: string }[]) => void;
  multiple?: boolean;
  accept?: string;
  hint?: string;
}

export function Dropzone({ onFiles, multiple, accept = ".pdf,.docx,.doc,.txt", hint }: DropzoneProps) {
  const [over, setOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const handleFiles = (files: FileList | null) => {
    const arr = Array.from(files || []);
    if (arr.length) onFiles(multiple ? arr : [arr[0]]);
  };

  return (
    <label
      className={`tsDrop ${over ? "tsDrop-over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="tsDrop-icon">
        <Icon.Upload size={22} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 500 }}>
        {over ? "Drop to upload" : multiple ? "Drag & drop resumes here" : "Drag & drop a JD here"}
      </div>
      <div className="small" style={{ color: "var(--muted)", marginTop: 4 }}>
        {hint || (multiple ? "PDFs, Word docs, or plain text — up to 200 files" : "PDF, DOCX, or paste text")}
      </div>
      <button type="button" className="tsBtn tsBtn-secondary tsBtn-sm" style={{ marginTop: 14, pointerEvents: "none" }}>
        <Icon.FileText size={12} /> Browse files
      </button>
    </label>
  );
}

interface FileRowProps {
  name: string;
  size: string;
  status: "queued" | "parsing" | "scoring" | "done" | "error";
  score?: number | null;
  sub?: string;
}

export function FileRow({ name, size, status, score, sub }: FileRowProps) {
  return (
    <div className="tsFileRow">
      <div className="tsFileRow-icon">
        <Icon.FileText size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </div>
        <div className="small" style={{ color: "var(--muted)" }}>
          {size} · {sub || status}
        </div>
      </div>
      {status === "parsing" && (
        <div className="tsFileRow-status">
          <span className="tsFileRow-spin" />
          <span className="small">Parsing</span>
        </div>
      )}
      {status === "scoring" && (
        <div className="tsFileRow-status">
          <span className="tsFileRow-spin" style={{ borderRightColor: "#A855F7" }} />
          <AIPill>Scoring</AIPill>
        </div>
      )}
      {status === "done" && score != null && <ScorePill score={score} />}
      {status === "done" && score == null && <Icon.Check size={14} stroke={3} style={{ color: "var(--success)" }} />}
      {status === "error" && <span className="tsBadge tsBadge-danger">Failed</span>}
    </div>
  );
}
