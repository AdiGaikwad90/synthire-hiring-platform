"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Card, Button, Badge, Avatar } from "@/components/ui";
import { CANDIDATES, TODAY_INTERVIEWS } from "@/lib/data";

// Interviewer Portal (minimalist)
const { useState: useS_iv } = React;

function Interviewer() {
  const router = useRouter();
      const [tab, setTab] = useS_iv("today");

  const stats = [
    { label: "Today", val: 3, sub: "interviews" },
    { label: "This week", val: 8, sub: "interviews" },
    { label: "Completed", val: 24, sub: "this month" },
    { label: "Pending", val: 2, sub: "feedbacks" },
  ];

  const pending = CANDIDATES.slice(7, 9).map(c => ({ ...c, completedAt: "2 hours ago", round: "Technical Round" }));
  const upcoming = [
    { id: "u1", candidate: CANDIDATES[5], time: "Tomorrow at 10:00 AM", round: "Culture Fit Round" },
    { id: "u2", candidate: CANDIDATES[6], time: "Tomorrow at 2:30 PM", round: "Technical Round" },
    { id: "u3", candidate: CANDIDATES[10], time: "Thursday at 11:00 AM", round: "Screening" },
  ];
  const past = CANDIDATES.slice(11, 14).map(c => ({ ...c, time: "2 days ago", round: "Technical Round", recommendation: "Yes" }));

  return (
    <div className="tsIvr">
      <div className="tsIvr-head">
        <div>
          <div className="h1">Your interviews</div>
          <div className="small" style={{ color: "var(--muted)" }}>Good afternoon, John. You have <b style={{ color: "var(--text)" }}>3 interviews</b> today and <b style={{ color: "var(--text)" }}>2 pending</b> feedbacks.</div>
        </div>
        <div className="tsIvr-cal">
          <Icon.Calendar size={14}/>
          <span>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
        </div>
      </div>

      <div className="tsIvr-stats">
        {stats.map((s, i) => (
          <div key={s.label} className="tsIvr-stat">
            <div className="mono" style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.02em" }}>{s.val}</div>
            <div className="small" style={{ color: "var(--muted)" }}>{s.label} <span style={{ opacity: 0.6 }}>· {s.sub}</span></div>
          </div>
        ))}
      </div>

      <div className="tsIvr-tabs">
        <div className="tsTabs">
          <button className={`tsTab ${tab === "today" ? "tsTab-active" : ""}`} onClick={() => setTab("today")}>Today <span className="tsTab-count">3</span></button>
          <button className={`tsTab ${tab === "upcoming" ? "tsTab-active" : ""}`} onClick={() => setTab("upcoming")}>Upcoming <span className="tsTab-count">5</span></button>
          <button className={`tsTab ${tab === "pending" ? "tsTab-active" : ""}`} onClick={() => setTab("pending")}>Pending feedback <span className="tsTab-count">2</span></button>
          <button className={`tsTab ${tab === "past" ? "tsTab-active" : ""}`} onClick={() => setTab("past")}>Past</button>
        </div>
      </div>

      {tab === "today" && (
        <div className="tsIvr-list">
          {TODAY_INTERVIEWS.map((iv, i) => <TodayCard key={iv.id} iv={iv} idx={i}/>)}
        </div>
      )}
      {tab === "upcoming" && (
        <div className="tsIvr-list">
          {upcoming.map(iv => (
            <Card key={iv.id} className="tsIvr-card">
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <Avatar name={iv.candidate.name} color={iv.candidate.avatar} size={44}/>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 2 }}>{iv.candidate.name}</div>
                  <div className="small" style={{ color: "var(--muted)" }}>{iv.candidate.title} · {iv.round}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="mono" style={{ fontSize: 13 }}>{iv.time}</div>
                  <div className="small" style={{ color: "var(--muted)" }}>via Zoom</div>
                </div>
                <Button variant="secondary" icon={<Icon.Eye size={13}/>} onClick={() => router.push("/candidates/c1")}>View</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {tab === "pending" && (
        <div className="tsIvr-list">
          {pending.map(c => (
            <Card key={c.id} className="tsIvr-card">
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <Avatar name={c.name} color={c.avatar} size={44}/>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 2 }}>{c.name}</div>
                  <div className="small" style={{ color: "var(--muted)" }}>{c.round} · completed {c.completedAt}</div>
                </div>
                <Badge variant="warning"><Icon.Clock size={11}/> Awaiting feedback</Badge>
                <Button variant="secondary" onClick={() => router.push("/candidates/c1")}>View</Button>
                <Button variant="primary" icon={<Icon.Pencil size={13}/>} onClick={() => router.push("/interviews/i1")}>Complete feedback</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {tab === "past" && (
        <div className="tsIvr-list">
          {past.map(c => (
            <Card key={c.id} className="tsIvr-card">
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <Avatar name={c.name} color={c.avatar} size={44}/>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 2 }}>{c.name}</div>
                  <div className="small" style={{ color: "var(--muted)" }}>{c.round} · {c.time}</div>
                </div>
                <Badge variant="success"><Icon.Check size={11} stroke={3}/> {c.recommendation}</Badge>
                <Button variant="ghost" onClick={() => router.push("/candidates/c1")}>View feedback</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

function TodayCard({ iv, idx }: any) {
  const router = useRouter();
  const urgent = iv.inMin < 60;
  return (
    <Card className="tsIvr-card tsIvr-cardLarge" style={{ animationDelay: `${idx * 60}ms` }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <Avatar name={iv.candidate.name} color={iv.candidate.avatar} size={56}/>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span className="h3" style={{ fontWeight: 500 }}>{iv.candidate.name}</span>
            {urgent && <Badge variant="warning"><Icon.Clock size={11}/> in {iv.inMin}m</Badge>}
          </div>
          <div className="small" style={{ color: "var(--muted)", marginBottom: 12 }}>{iv.candidate.title}</div>
          <div className="tsIvr-meta">
            <span><Icon.Calendar size={12}/> {iv.time}</span>
            <span><Icon.Briefcase size={12}/> {iv.round}</span>
            <span><Icon.Video size={12}/> Zoom call</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 160 }}>
          <Button variant="primary" icon={<Icon.Video size={14}/>}>Join interview</Button>
          <Button variant="secondary" icon={<Icon.FileText size={14}/>} onClick={() => router.push("/interviews/i1")}>Prep & conduct</Button>
        </div>
      </div>
    </Card>
  );
};


export { Interviewer as InterviewerHome };
export default Interviewer;
