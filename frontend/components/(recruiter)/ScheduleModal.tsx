"use client";
import * as React from "react";
import { Icon } from "@/lib/icons";
import { Modal, Button, Badge, Avatar, Input, Textarea, SearchInput, useToast } from "@/components/ui";
import { INTERVIEW_ROUNDS, TEAM } from "@/lib/data";
import type { Candidate } from "@/lib/types";

interface ScheduleModalProps {
  candidate: Candidate;
  onClose: () => void;
}

export function ScheduleModal({ candidate: c, onClose }: ScheduleModalProps) {
  const toast = useToast();
  const [round, setRound] = React.useState(INTERVIEW_ROUNDS[1].id);
  const [interviewers, setInterviewers] = React.useState<string[]>(["u2"]);
  const [date, setDate] = React.useState(15);
  const [hour, setHour] = React.useState(14);
  const [minute, setMinute] = React.useState(0);
  const [link, setLink] = React.useState("https://zoom.us/j/847-291-6634");
  const [notes, setNotes] = React.useState("");
  const [showPreview, setShowPreview] = React.useState(false);

  const selRound = INTERVIEW_ROUNDS.find((r) => r.id === round);
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const disabledDays = new Set([1, 2, 8, 9, 10, 16, 17, 23, 24, 30]);

  return (
    <Modal
      open
      onClose={onClose}
      side
      width={460}
      title="Schedule interview"
      subtitle={<>Round, interviewers, and time for <b style={{ color: "var(--text)" }}>{c.name}</b></>}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" icon={<Icon.Save size={13} />}>Save template</Button>
          <Button
            variant="primary"
            icon={<Icon.Send size={13} />}
            onClick={() => {
              toast({ message: `Interview scheduled with ${c.name}` });
              onClose();
            }}
          >
            Schedule
          </Button>
        </>
      }
    >
      <div className="tsSched">
        <div className="tsSched-step">
          <div className="tsSched-stepHead">
            <span className="tsSched-stepNum">1</span>
            <span>Which round?</span>
          </div>
          <div className="tsSched-rounds">
            {INTERVIEW_ROUNDS.map((r) => (
              <button key={r.id} className={`tsSched-round ${round === r.id ? "active" : ""}`} onClick={() => setRound(r.id)}>
                <div className="tsSched-roundIcon">{r.num}</div>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{r.name}</div>
                  <div className="small" style={{ color: "var(--muted)" }}>{r.duration} min · {r.interviewer}</div>
                </div>
                {r.required ? <Badge variant="primary">Required</Badge> : <Badge variant="neutral">Optional</Badge>}
              </button>
            ))}
          </div>
          {selRound && (
            <div className="small" style={{ marginTop: 10, color: "var(--text-2)", padding: "8px 12px", background: "var(--surface-2)", borderRadius: 8, borderLeft: "2px solid var(--primary)" }}>
              {selRound.purpose}
            </div>
          )}
        </div>

        <div className="tsSched-step">
          <div className="tsSched-stepHead">
            <span className="tsSched-stepNum">2</span>
            <span>Who will interview?</span>
            {interviewers.length > 0 && <Badge variant="primary">{interviewers.length} selected</Badge>}
          </div>
          <SearchInput value="" onChange={() => {}} placeholder="Find team members…" kbd="" />
          <div className="tsSched-team">
            {TEAM.map((u) => (
              <label key={u.id} className={`tsSched-mem ${interviewers.includes(u.id) ? "active" : ""}`}>
                <input
                  type="checkbox"
                  checked={interviewers.includes(u.id)}
                  onChange={(e) =>
                    setInterviewers((arr) => (e.target.checked ? [...arr, u.id] : arr.filter((x) => x !== u.id)))
                  }
                />
                <Avatar name={u.name} color={u.avatar} size={28} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{u.name}</div>
                  <div className="small" style={{ color: "var(--muted)" }}>{u.role}</div>
                </div>
                <Badge variant="success">{u.trained[0]} trained</Badge>
              </label>
            ))}
          </div>
        </div>

        <div className="tsSched-step">
          <div className="tsSched-stepHead">
            <span className="tsSched-stepNum">3</span>
            <span>Date & time</span>
          </div>

          <div className="tsCal">
            <div className="tsCal-head">
              <button className="tsIconBtn" aria-label="Previous month"><Icon.ChevronLeft size={14} /></button>
              <div style={{ fontSize: 13, fontWeight: 500 }}>May 2026</div>
              <button className="tsIconBtn" aria-label="Next month"><Icon.ChevronRight size={14} /></button>
            </div>
            <div className="tsCal-dow">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i}>{d}</div>)}
            </div>
            <div className="tsCal-grid">
              {[null, null, null, null, ...days].map((d, i) =>
                d == null ? (
                  <div key={i} />
                ) : (
                  <button
                    key={i}
                    className={`tsCal-day ${date === d ? "active" : ""} ${disabledDays.has(d as number) ? "disabled" : "available"}`}
                    disabled={disabledDays.has(d as number)}
                    onClick={() => setDate(d as number)}
                  >
                    {d}
                  </button>
                )
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr", gap: 8, marginTop: 12 }}>
            <select className="tsSelect" value={hour} onChange={(e) => setHour(+e.target.value)}>
              {Array.from({ length: 10 }, (_, i) => i + 9).map((h) => (
                <option key={h} value={h}>
                  {h % 12 || 12}
                  {h >= 12 ? " PM" : " AM"}
                </option>
              ))}
            </select>
            <select className="tsSelect" value={minute} onChange={(e) => setMinute(+e.target.value)}>
              {[0, 15, 30, 45].map((m) => (
                <option key={m} value={m}>
                  :{String(m).padStart(2, "0")}
                </option>
              ))}
            </select>
            <select className="tsSelect">
              <option>America/Los_Angeles</option>
              <option>America/New_York</option>
              <option>Europe/London</option>
            </select>
          </div>
        </div>

        <div className="tsSched-step">
          <div className="tsSched-stepHead">
            <span className="tsSched-stepNum">4</span>
            <span>Meeting details</span>
          </div>
          <Input
            label="Video link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            icon={<Icon.LinkIcon size={14} />}
            hint="Zoom, Google Meet, or any video platform"
          />
          <div style={{ height: 12 }} />
          <Textarea
            label="Notes for interviewer"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="E.g., Focus on system design at scale. Ask about her gRPC migration."
            maxLength={500}
          />
        </div>

        <button className="tsSched-preview" onClick={() => setShowPreview((p) => !p)}>
          <Icon.Mail size={14} />
          <span>Review interview invitation email</span>
          <Icon.ChevronDown
            size={14}
            style={{ transform: showPreview ? "rotate(180deg)" : "", transition: "transform 0.18s", marginLeft: "auto" }}
          />
        </button>
        {showPreview && (
          <div className="tsEmailPreview">
            <div className="small" style={{ color: "var(--muted)", marginBottom: 8 }}>
              <b style={{ color: "var(--text)" }}>To:</b> {c.email}
            </div>
            <div className="small" style={{ color: "var(--muted)", marginBottom: 14 }}>
              <b style={{ color: "var(--text)" }}>Subject:</b> Interview with Acme · {selRound?.name}
            </div>
            <div className="small" style={{ lineHeight: 1.5, color: "var(--text-2)" }}>
              Hi {c.name.split(" ")[0]},<br />
              <br />
              We'd like to invite you to the next stage for the <b>Senior Software Engineer</b> role. Please join us on{" "}
              <b>
                May {date}, {hour % 12 || 12}:{String(minute).padStart(2, "0")} {hour >= 12 ? "PM" : "AM"} PT
              </b>{" "}
              via <b>{link}</b>.<br />
              <br />
              Best,
              <br />
              Sarah & the Acme team
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
