"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Modal, Button, Card, Badge, Avatar, ScoreRing, ScoreBar, ScorePill, StagePill, AIPill } from "@/components/ui";
import { CANDIDATES } from "@/lib/data";
import { ScheduleModal } from "./ScheduleModal";
import { ActivityRow } from "./Dashboard";

// Candidate Detail — Resume + AI Analysis
const { useState: useS_cd } = React;

function CandidateDetail() {
  const router = useRouter();
    const c = CANDIDATES[0]; // Priya Sharma
  const [tab, setTab] = useS_cd("overview");
  const [zoom, setZoom] = useS_cd(100);
  const [showSchedule, setShowSchedule] = useS_cd(false);

  return (
    <div className="tsCD">
      {/* Header */}
      <div className="tsCD-header">
        <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1, minWidth: 0 }}>
          <button className="tsIconBtn" onClick={() => router.push("/candidates")}><Icon.ArrowLeft size={16}/></button>
          <Avatar name={c.name} color={c.avatar} size={42}/>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="h2" style={{ fontSize: 20 }}>{c.name}</div>
              <StagePill stage={c.stage}/>
              <Badge variant="ai"><Icon.Sparkles size={10}/>AI-screened</Badge>
            </div>
            <div className="small" style={{ color: "var(--muted)" }}>
              {c.title} · {c.location} · <span className="mono">{c.email}</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="tsCD-overall">
            <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: "var(--success)" }}>{c.score}</div>
            <div className="tiny">Overall</div>
          </div>
          <div className="tsCD-divider"/>
          <Button variant="ghost" icon={<Icon.X size={14}/>}>Reject</Button>
          <Button variant="secondary" icon={<Icon.Check size={14} stroke={3}/>}>Shortlist</Button>
          <Button variant="primary" icon={<Icon.Calendar size={14}/>} onClick={() => setShowSchedule(true)}>Schedule interview</Button>
        </div>
      </div>

      {/* Body */}
      <div className="tsCD-body">
        {/* Left: Resume */}
        <div className="tsCD-resume">
          <div className="tsCD-resumeBar">
            <div className="small" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon.FileText size={14}/>
              <span>Priya_Sharma_Resume.pdf</span>
              <span style={{ color: "var(--muted)" }}>· 2 pages · 142 KB</span>
            </div>
            <div className="tsZoom">
              <button className="tsIconBtn" onClick={() => setZoom(z => Math.max(50, z - 10))}><Icon.ChevronDown size={14}/></button>
              <span className="mono small" style={{ width: 40, textAlign: "center" }}>{zoom}%</span>
              <button className="tsIconBtn" onClick={() => setZoom(z => Math.min(200, z + 10))}><Icon.ChevronUp size={14}/></button>
              <button className="tsIconBtn"><Icon.Download size={14}/></button>
            </div>
          </div>
          <div className="tsCD-resumeView">
            <div className="tsResume" style={{ transform: `scale(${zoom/100})`, transformOrigin: "top center" }}>
              <ResumePreview c={c}/>
            </div>
          </div>
        </div>

        {/* Right: Analysis */}
        <div className="tsCD-analysis">
          <div className="tsCD-tabs">
            <button className={`tsTab ${tab === "overview" ? "tsTab-active" : ""}`} onClick={() => setTab("overview")}>Overview</button>
            <button className={`tsTab ${tab === "breakdown" ? "tsTab-active" : ""}`} onClick={() => setTab("breakdown")}>Resume breakdown <span className="tsTab-count">12</span></button>
            <button className={`tsTab ${tab === "ai" ? "tsTab-active" : ""}`} onClick={() => setTab("ai")}>AI analysis</button>
            <button className={`tsTab ${tab === "activity" ? "tsTab-active" : ""}`} onClick={() => setTab("activity")}>Activity</button>
          </div>

          <div className="tsCD-tabBody">
            {tab === "overview" && <OverviewTab c={c}/>}
            {tab === "breakdown" && <BreakdownTab c={c}/>}
            {tab === "ai" && <AITab c={c}/>}
            {tab === "activity" && <ActivityTab c={c}/>}
          </div>
        </div>
      </div>

      {showSchedule && <ScheduleModal c={c} onClose={() => setShowSchedule(false)}/>}
    </div>
  );
};

// ===== Resume preview (faux PDF) =====
const ResumePreview = ({ c }: any) => (
  <div className="tsResume-doc">
    <div className="tsResume-name">{c.name}</div>
    <div className="tsResume-contact">
      <span>{c.email}</span><span>· {c.location}</span><span>· linkedin.com/in/priya-sharma</span><span>· github.com/priyasharma</span>
    </div>
    <div className="tsResume-section">
      <div className="tsResume-h">Summary</div>
      <div className="tsResume-p">Senior software engineer with {c.years}+ years building payment infrastructure at Stripe and Plaid. Specialized in distributed systems, event-driven architectures, and high-throughput APIs. Led teams of 3-7 engineers shipping customer-critical features at scale.</div>
    </div>
    <div className="tsResume-section">
      <div className="tsResume-h">Experience</div>
      {c.experience.map((e, i) => (
        <div key={i} className="tsResume-exp">
          <div className="tsResume-expHead">
            <span className="tsResume-expRole">{e.role}</span>
            <span className="tsResume-expDates">{e.from} – {e.to}</span>
          </div>
          <div className="tsResume-expCo">{e.company}</div>
          <div className="tsResume-p">{e.desc}</div>
          <ul className="tsResume-bullets">
            <li>Scaled core payment API from 5M to 80M daily requests with 99.99% uptime SLA</li>
            <li>Led migration to event-driven architecture, reducing p99 latency by 38%</li>
            <li>Mentored 4 engineers; 2 promoted to senior under tenure</li>
          </ul>
        </div>
      ))}
    </div>
    <div className="tsResume-section">
      <div className="tsResume-h">Education</div>
      {c.education.map((e, i) => (
        <div key={i} className="tsResume-edu">
          <span><b>{e.degree}</b>, {e.school}</span>
          <span className="tsResume-dates">{e.year}</span>
        </div>
      ))}
    </div>
    <div className="tsResume-section">
      <div className="tsResume-h">Technical skills</div>
      <div className="tsResume-p">
        <b>Languages:</b> TypeScript, Python, Go, Rust, SQL<br/>
        <b>Frameworks:</b> React, Next.js, Node.js, FastAPI, gRPC<br/>
        <b>Infrastructure:</b> AWS, Terraform, Docker, Kafka, Postgres, Redis, DynamoDB
      </div>
    </div>
  </div>
);

// ===== Overview tab =====
function OverviewTab({ c }: any) {
    const skillsTable = [
    { name: "TypeScript", required: true, level: "Senior", years: 6, status: "met" },
    { name: "React", required: true, level: "Senior", years: 7, status: "met" },
    { name: "Python", required: true, level: "Mid", years: 4, status: "met" },
    { name: "AWS", required: true, level: "Senior", years: 5, status: "met" },
    { name: "Distributed systems", required: true, level: "Senior", years: 4, status: "met" },
    { name: "Kubernetes", required: false, level: "Mid", years: 2, status: "partial" },
    { name: "Rust", required: false, level: "—", years: 0, status: "missing" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Score panel */}
      <Card padded={false} className="ai-border">
        <div style={{ padding: 22, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <AIPill>AI score breakdown</AIPill>
            <span className="small" style={{ color: "var(--muted)" }}>Last scored 2 hr ago</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 24, alignItems: "center" }}>
            <ScoreRing score={c.score} size={132} stroke={9} label="Match"/>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <ScoreBar label="Technical skills (40%)" value={c.skillsScore}/>
              <ScoreBar label="Experience relevance (30%)" value={c.expScore}/>
              <ScoreBar label="Education & certs (20%)" value={c.eduScore}/>
              <ScoreBar label="Achievements (10%)" value={c.achScore}/>
            </div>
          </div>
        </div>
      </Card>

      {/* Skills heatmap */}
      <Card padded={false}>
        <div className="tsCardHead" style={{ paddingBottom: 8 }}>
          <div className="h3">Skills match</div>
          <span className="small" style={{ color: "var(--muted)" }}>5 of 5 required met</span>
        </div>
        <div className="tsSkillTable">
          <div className="tsSkillTable-head">
            <div>Skill</div>
            <div>Required</div>
            <div>Level</div>
            <div style={{ textAlign: "right" }}>Years</div>
            <div></div>
          </div>
          {skillsTable.map(s => (
            <div key={s.name} className="tsSkillTable-row">
              <div style={{ fontWeight: 500 }}>{s.name}</div>
              <div>{s.required ? <Badge variant="primary">Required</Badge> : <span className="small" style={{ color: "var(--muted)" }}>Nice-to-have</span>}</div>
              <div className="small">{s.level}</div>
              <div className="mono" style={{ textAlign: "right", fontSize: 12 }}>{s.years || "—"}</div>
              <div>
                {s.status === "met" && <span className="tsSkillStatus tsSkillStatus-met"><Icon.Check size={11} stroke={3}/></span>}
                {s.status === "partial" && <span className="tsSkillStatus tsSkillStatus-partial"><Icon.AlertTriangle size={11}/></span>}
                {s.status === "missing" && <span className="tsSkillStatus tsSkillStatus-missing"><Icon.X size={11} stroke={3}/></span>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Experience timeline */}
      <Card padded={false}>
        <div className="tsCardHead"><div className="h3">Experience</div></div>
        <div className="tsXp">
          {c.experience.map((e, i) => (
            <div key={i} className="tsXp-row">
              <div className="tsXp-dot"/>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontWeight: 500 }}>{e.role} <span style={{ color: "var(--muted)", fontWeight: 400 }}>· {e.company}</span></div>
                  <div className="mono small" style={{ color: "var(--muted)" }}>{e.from} – {e.to}</div>
                </div>
                <div className="small" style={{ color: "var(--text-2)", margin: "4px 0 8px", lineHeight: 1.5 }}>{e.desc}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {e.stack.map(s => <span key={s} className="tsChip" style={{ fontSize: 10.5 }}>{s}</span>)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Education */}
      <Card padded={false}>
        <div className="tsCardHead"><div className="h3">Education</div></div>
        <div style={{ padding: "0 24px 20px", display: "grid", gridTemplateColumns: c.education.length > 1 ? "1fr 1fr" : "1fr", gap: 10 }}>
          {c.education.map((e, i) => (
            <div key={i} className="tsEduCard">
              <Icon.Book size={20} style={{ color: "var(--primary-3)" }}/>
              <div>
                <div style={{ fontWeight: 500, fontSize: 13.5 }}>{e.degree}</div>
                <div className="small" style={{ color: "var(--muted)" }}>{e.school} · <span className="mono">{e.year}</span></div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Flags */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className="tsFlagBox tsFlagBox-good">
          <div className="tiny" style={{ color: "var(--success)", marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
            <Icon.Check size={12} stroke={3}/> Strengths
          </div>
          {c.strengths.map((s, i) => <div key={i} className="tsFlag-row"><Icon.Check size={11} stroke={3} style={{ color: "var(--success)" }}/>{s}</div>)}
        </div>
        <div className="tsFlagBox tsFlagBox-warn">
          <div className="tiny" style={{ color: "var(--warning)", marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
            <Icon.AlertTriangle size={12}/> Concerns
          </div>
          {c.concerns.length ? c.concerns.map((s, i) => <div key={i} className="tsFlag-row"><Icon.AlertTriangle size={11} style={{ color: "var(--warning)" }}/>{s}</div>) :
            <div className="small" style={{ color: "var(--muted)" }}>No major concerns identified.</div>}
        </div>
      </div>
    </div>
  );
};

// ===== Resume breakdown tab =====
function BreakdownTab({ c }: any) {
  const sections = [
    { id: "skills", title: "Technical skills", count: 18, icon: <Icon.Code size={14}/>,
      groups: [
        { name: "Languages", items: [
          { v: "TypeScript", years: 6, match: "met" },
          { v: "Python", years: 4, match: "met" },
          { v: "Go", years: 2, match: "partial" },
          { v: "Rust", years: 0, match: "missing" },
        ]},
        { name: "Frameworks", items: [
          { v: "React / Next.js", years: 7, match: "met" },
          { v: "Node.js / FastAPI", years: 5, match: "met" },
          { v: "gRPC", years: 3, match: "partial" },
        ]},
        { name: "Infrastructure", items: [
          { v: "AWS (Lambda, ECS, RDS)", years: 5, match: "met" },
          { v: "Terraform", years: 4, match: "met" },
          { v: "Kafka", years: 3, match: "met" },
          { v: "Kubernetes", years: 2, match: "partial" },
        ]},
        { name: "Databases", items: [
          { v: "Postgres", years: 6, match: "met" },
          { v: "Redis", years: 5, match: "met" },
          { v: "DynamoDB", years: 3, match: "met" },
        ]},
      ]},
    { id: "exp", title: "Professional experience", count: 2, icon: <Icon.Briefcase size={14}/>, content: "expanded" },
    { id: "edu", title: "Education", count: 2, icon: <Icon.Book size={14}/> },
    { id: "certs", title: "Certifications", count: 3, icon: <Icon.ShieldCheck size={14}/>,
      certs: [
        { name: "AWS Solutions Architect Professional", issuer: "Amazon Web Services", date: "Mar 2024", match: "met" },
        { name: "Certified Kubernetes Administrator", issuer: "CNCF", date: "Sep 2023", match: "partial" },
        { name: "PostgreSQL Database Administration", issuer: "EnterpriseDB", date: "Jan 2023", match: "neutral" },
      ]},
    { id: "ach", title: "Achievements", count: 5, icon: <Icon.Award size={14}/>,
      items: [
        "Scaled payment API from 5M → 80M daily requests at Stripe",
        "Reduced p99 latency by 38% via event-driven refactor",
        "Led team of 5 engineers on Plaid Link integration",
        "Open-sourced 3 internal libraries (5,200+ GitHub stars combined)",
        "Speaker at React Summit 2024 — 'State management at scale'",
      ]},
    { id: "lang", title: "Languages", count: 3, icon: <Icon.Globe size={14}/>,
      items: [
        { v: "English — Native" },
        { v: "Hindi — Native" },
        { v: "Spanish — Conversational" },
      ]},
    { id: "os", title: "Open-source contributions", count: 4, icon: <Icon.Github size={14}/>,
      items: [
        { v: "vercel/next.js — 12 PRs merged (perf optimizations)" },
        { v: "stripe/stripe-node — Maintainer, 2022–2024" },
        { v: "tanstack/query — 4 PRs (cache invalidation fix)" },
        { v: "rust-lang/rust — 1 PR (docs)" },
      ]},
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {sections.map(s => <BreakdownSection key={s.id} s={s}/>)}
    </div>
  );
};

function BreakdownSection({ s }: any) {
  const [open, setOpen] = useS_cd(s.id === "skills" || s.id === "certs");
  return (
    <div className="tsBreakdown">
      <button className="tsBreakdown-head" onClick={() => setOpen(o => !o)}>
        <Icon.ChevronDown size={14} style={{ transform: open ? "" : "rotate(-90deg)", transition: "transform 0.18s" }}/>
        <div className="tsBreakdown-icon">{s.icon}</div>
        <span style={{ flex: 1, fontWeight: 500 }}>{s.title}</span>
        <span className="tiny mono" style={{ color: "var(--muted)" }}>{s.count} items</span>
      </button>
      {open && (
        <div className="tsBreakdown-body">
          {s.groups && s.groups.map(g => (
            <div key={g.name} className="tsBreakdown-group">
              <div className="tiny" style={{ marginBottom: 6 }}>{g.name}</div>
              <div className="tsBreakdown-items">
                {g.items.map(it => (
                  <div key={it.v} className={`tsBreakdown-item tsBreakdown-item-${it.match}`}>
                    <span>{it.v}</span>
                    {it.years > 0 && <span className="mono tiny" style={{ color: "var(--muted)" }}>{it.years}y</span>}
                    {it.match === "met" && <Icon.Check size={11} stroke={3} style={{ color: "var(--success)" }}/>}
                    {it.match === "partial" && <Icon.AlertTriangle size={11} style={{ color: "var(--warning)" }}/>}
                    {it.match === "missing" && <Icon.X size={11} stroke={3} style={{ color: "var(--danger)" }}/>}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {s.certs && (
            <div className="tsBreakdown-items" style={{ flexDirection: "column", gap: 8 }}>
              {s.certs.map(cert => (
                <div key={cert.name} className="tsCertCard">
                  <Icon.Award size={16} style={{ color: cert.match === "met" ? "var(--success)" : cert.match === "partial" ? "var(--warning)" : "var(--text-2)" }}/>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{cert.name}</div>
                    <div className="small" style={{ color: "var(--muted)" }}>{cert.issuer} · {cert.date}</div>
                  </div>
                  {cert.match === "met" && <Badge variant="success">Required</Badge>}
                  {cert.match === "partial" && <Badge variant="warning">Nice-to-have</Badge>}
                </div>
              ))}
            </div>
          )}
          {s.items && Array.isArray(s.items) && s.items[0]?.v && (
            <div className="tsBreakdown-items" style={{ flexDirection: "column", gap: 6 }}>
              {s.items.map((it, i) => (
                <div key={i} className="small" style={{ padding: "6px 10px", background: "var(--surface-2)", borderRadius: 6 }}>{it.v}</div>
              ))}
            </div>
          )}
          {s.items && Array.isArray(s.items) && typeof s.items[0] === "string" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {s.items.map((it, i) => (
                <div key={i} className="small" style={{ display: "flex", gap: 8, padding: "6px 10px", background: "var(--surface-2)", borderRadius: 6 }}>
                  <Icon.Check size={12} stroke={3} style={{ color: "var(--success)", flexShrink: 0, marginTop: 2 }}/>
                  <span>{it}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ===== AI tab =====
function AITab({ c }: any) {
    return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card padded={false} className="ai-border">
        <div style={{ padding: 22, position: "relative" }}>
          <AIPill>AI summary</AIPill>
          <div style={{ marginTop: 14, fontSize: 14, lineHeight: 1.65 }}>
            <span className="ai-text">Strong technical match.</span> Priya brings deep payment-infrastructure experience from Stripe and Plaid that aligns directly with the role's distributed-systems requirements. Her React + Python + AWS skills are at senior level (5-7 years each). The only meaningful gap is Rust (listed as nice-to-have).
          </div>
          <div style={{ marginTop: 14, fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>
            <b style={{ color: "var(--text)" }}>Recommendation:</b> Proceed to technical interview. Focus questions on system design at 80M+ rps scale, cache invalidation patterns, and her gRPC migration experience.
          </div>
        </div>
      </Card>

      <Card padded={false}>
        <div className="tsCardHead">
          <div className="h3">Suggested interview questions</div>
          <Badge variant="ai"><Icon.Sparkles size={10}/> Tailored to gaps</Badge>
        </div>
        <div style={{ padding: "0 24px 22px", display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { q: "Walk me through scaling your payment API from 5M → 80M daily requests. What broke first?", why: "Validates resume claim of 16x scale. Probes failure-mode thinking and observability instincts." },
            { q: "You mention reducing p99 latency by 38% with an event-driven refactor. What patterns did you reach for?", why: "Tests system-design depth, specifically pub/sub and idempotency reasoning at scale." },
            { q: "We use Kubernetes heavily. Your resume shows 2 years — talk about a real incident you debugged in prod.", why: "Closes the K8s gap (nice-to-have but valuable). Looks for operational maturity." },
            { q: "Mentorship: you grew 2 engineers to senior. What's your model for that?", why: "Validates leadership claim — important for the level we're hiring at." },
          ].map((it, i) => (
            <div key={i} className="tsAIQ">
              <div style={{ display: "flex", gap: 10 }}>
                <span className="tsAIQ-num mono">{String(i+1).padStart(2,"0")}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.45 }}>{it.q}</div>
                  <div className="small" style={{ color: "var(--muted)", marginTop: 6 }}><b style={{ color: "var(--text-2)" }}>Why:</b> {it.why}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

// ===== Activity tab =====
const ActivityTab = ({ c }: any) => (
  <Card padded={false}>
    <div className="tsCardHead"><div className="h3">Activity</div></div>
    <div className="tsTimeline" style={{ padding: "0 24px 22px" }}>
      {[
        { who: "AI", action: "scored candidate at 92%", target: "Senior Software Engineer", time: "2 hours ago", type: "ai" },
        { who: "Sarah Chen", action: "moved candidate from New to Shortlisted", time: "5 hours ago", type: "move" },
        { who: "Priya Sharma", action: "submitted application", time: "Yesterday at 4:12 PM", type: "neutral" },
      ].map((a, i) => <ActivityRow key={i} a={a}/>)}
    </div>
  </Card>
);


export { CandidateDetail };
export default CandidateDetail;
