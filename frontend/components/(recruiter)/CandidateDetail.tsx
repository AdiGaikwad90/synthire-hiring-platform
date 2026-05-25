"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Modal, Button, Card, Badge, Avatar, ScoreRing, ScoreBar, ScorePill, StagePill, AIPill } from "@/components/ui";
import { useCandidate, useUpdateCandidateStage, useGenerateQuestions } from "@/hooks/queries/useCandidates";
import { useJob } from "@/hooks/queries/useJobs";
import { useParams } from "next/navigation";
import { ScheduleModal } from "./ScheduleModal";
import { ActivityRow } from "./Dashboard";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui";

// Candidate Detail — Resume + AI Analysis
const { useState: useS_cd, useEffect: useE_cd } = React;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'

async function downloadResume(candidateId: string, filename: string) {
  const { getToken } = await import('@/lib/auth')
  const token = getToken()
  const res = await fetch(`${API_URL}/api/candidates/${candidateId}/resume`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) return
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function CandidateDetail({ candidateId }: { candidateId?: string }) {
  const router = useRouter();
  const { candidateId: paramId } = useParams() as { candidateId?: string };
  const actualId = candidateId ?? paramId ?? '';

  const { data: apiCandidate, isLoading } = useCandidate(actualId);
  const { mutate: updateStage } = useUpdateCandidateStage();
  const { user } = useAuth();
  const { data: appliedJob } = useJob(apiCandidate?.job_id ?? '');
  const toast = useToast();

  const [tab, setTab] = useS_cd("overview");
  const [zoom, setZoom] = useS_cd(100);
  const [showSchedule, setShowSchedule] = useS_cd(false);
  const [resumeBlobUrl, setResumeBlobUrl] = useS_cd<string | null>(null);

  useE_cd(() => {
    if (!actualId) return;
    let revoked = false;
    (async () => {
      try {
        const { getToken } = await import('@/lib/auth');
        const token = getToken();
        const res = await fetch(`${API_URL}/api/candidates/${actualId}/resume`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok || revoked) return;
        const blob = await res.blob();
        if (!revoked) setResumeBlobUrl(URL.createObjectURL(blob));
      } catch {}
    })();
    return () => {
      revoked = true;
      setResumeBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    };
  }, [actualId]);

  if (isLoading) return <div style={{padding:32,color:'var(--muted)'}}>Loading candidate...</div>;
  if (!apiCandidate) return <div style={{padding:32,color:'var(--danger)'}}>Candidate not found</div>;

  // Map API fields to the shape the UI expects
  const c = {
    ...apiCandidate,
    score: apiCandidate.overall_score ?? 0,
    skillsScore: apiCandidate.skills_score ?? 0,
    expScore: apiCandidate.experience_score ?? 0,
    eduScore: apiCandidate.education_score ?? 0,
    achScore: apiCandidate.achievements_score ?? 0,
    stage: apiCandidate.status as any,
    skills: apiCandidate.technical_skills ?? [],
    experience: (apiCandidate.professional_experience as any[]) ?? [],
    education: (apiCandidate.education_details as any[]) ?? [],
    ...(() => {
      let summary = apiCandidate.ai_analysis ?? '';
      let strengths: string[] = [];
      let concerns: string[] = [];
      try {
        const parsed = JSON.parse(apiCandidate.ai_analysis ?? '');
        if (parsed && typeof parsed === 'object' && parsed.summary) {
          summary = parsed.summary;
          strengths = Array.isArray(parsed.strengths) ? parsed.strengths : [];
          concerns = Array.isArray(parsed.concerns) ? parsed.concerns : [];
        }
      } catch {}
      return { ai_analysis: summary, strengths, concerns };
    })(),
    avatar: '',
    title: '',
    years: 0,
  };

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
            {appliedJob && (
              <div className="small" style={{ color: "var(--muted)", marginTop: 2 }}>
                Applied for: <span style={{ color: "var(--text-2)", fontWeight: 500 }}>{appliedJob.title}</span>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="tsCD-overall">
            <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: "var(--success)" }}>{c.score}</div>
            <div className="tiny">Overall</div>
          </div>
          <div className="tsCD-divider"/>
          {user?.role === 'recruiter' && (
            <>
              <Button variant="ghost" icon={<Icon.X size={14}/>} onClick={() => updateStage({ id: actualId, status: 'rejected' }, {
                onSuccess: () => toast({ message: 'Candidate rejected', variant: 'info' }),
                onError: () => toast({ message: 'Failed to update status', variant: 'error' }),
              })}>Reject</Button>
              <Button variant="secondary" icon={<Icon.Check size={14} stroke={3}/>} onClick={() => updateStage({ id: actualId, status: 'shortlisted' }, {
                onSuccess: () => toast({ message: 'Candidate shortlisted' }),
                onError: () => toast({ message: 'Failed to update status', variant: 'error' }),
              })}>Shortlist</Button>
              <Button variant="primary" icon={<Icon.Calendar size={14}/>} onClick={() => setShowSchedule(true)}>Schedule interview</Button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="tsCD-body">
        {/* Left: Resume */}
        <div className="tsCD-resume">
          <div className="tsCD-resumeBar">
            <div className="small" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon.FileText size={14}/>
              <span>{c.name.replace(/\s+/g, '_')}_Resume.pdf</span>
            </div>
            <div className="tsZoom">
              <button className="tsIconBtn" onClick={() => setZoom(z => Math.max(50, z - 10))}><Icon.ChevronDown size={14}/></button>
              <span className="mono small" style={{ width: 40, textAlign: "center" }}>{zoom}%</span>
              <button className="tsIconBtn" onClick={() => setZoom(z => Math.min(200, z + 10))}><Icon.ChevronUp size={14}/></button>
              <button className="tsIconBtn" title="Download resume" onClick={() => downloadResume(actualId, `${c.name.replace(/\s+/g, '_')}_Resume.pdf`)}><Icon.Download size={14}/></button>
            </div>
          </div>
          <div className="tsCD-resumeView">
            {resumeBlobUrl ? (
              <iframe
                src={resumeBlobUrl}
                style={{ width: `${zoom}%`, height: '100%', border: 'none', display: 'block', margin: '0 auto' }}
                title="Resume"
              />
            ) : (
              <div className="tsResume" style={{ transform: `scale(${zoom/100})`, transformOrigin: "top center" }}>
                <ResumePreview c={c}/>
              </div>
            )}
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
      <span>{c.email}</span>{c.location && <span>· {c.location}</span>}
    </div>
    {c.ai_analysis && (
      <div className="tsResume-section">
        <div className="tsResume-h">Summary</div>
        <div className="tsResume-p">{c.ai_analysis}</div>
      </div>
    )}
    {c.experience.length > 0 && (
      <div className="tsResume-section">
        <div className="tsResume-h">Experience</div>
        {c.experience.map((e: any, i: number) => (
          <div key={i} className="tsResume-exp">
            <div className="tsResume-expHead">
              <span className="tsResume-expRole">{e.role}</span>
              <span className="tsResume-expDates">{e.from}{e.to ? ` – ${e.to}` : ''}</span>
            </div>
            <div className="tsResume-expCo">{e.company}</div>
            {e.description && <div className="tsResume-p">{e.description}</div>}
          </div>
        ))}
      </div>
    )}
    {c.education.length > 0 && (
      <div className="tsResume-section">
        <div className="tsResume-h">Education</div>
        {c.education.map((e: any, i: number) => (
          <div key={i} className="tsResume-edu">
            <span><b>{e.degree}</b>{(e.institution ?? e.school) ? `, ${e.institution ?? e.school}` : ''}</span>
            <span className="tsResume-dates">{e.from ? `${e.from}${e.to ? ` – ${e.to}` : ''}` : (e.year ?? '')}</span>
          </div>
        ))}
      </div>
    )}
    {c.skills.length > 0 && (
      <div className="tsResume-section">
        <div className="tsResume-h">Technical skills</div>
        <div className="tsResume-p">{c.skills.join(', ')}</div>
      </div>
    )}
  </div>
);

// ===== Overview tab =====
function OverviewTab({ c }: any) {
    const skillsTable = c.skills.map((skill: string) => ({
    name: skill,
    required: true,
    status: 'met' as const,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Score panel */}
      <Card padded={false} className="ai-border">
        <div style={{ padding: 22, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <AIPill>AI score breakdown</AIPill>
            <span className="small" style={{ color: "var(--muted)" }}>{c.updated_at ? `Scored ${new Date(c.updated_at).toLocaleDateString()}` : 'Scored recently'}</span>
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
          <span className="small" style={{ color: "var(--muted)" }}>{c.skills.length} skills detected</span>
        </div>
        <div className="tsSkillTable">
          <div className="tsSkillTable-head">
            <div>Skill</div>
            <div>Required</div>
            <div></div>
          </div>
          {skillsTable.map(s => (
            <div key={s.name} className="tsSkillTable-row">
              <div style={{ fontWeight: 500 }}>{s.name}</div>
              <div>{s.required ? <Badge variant="primary">Required</Badge> : <span className="small" style={{ color: "var(--muted)" }}>Nice-to-have</span>}</div>
              <div>
                {s.status === "met" && <span className="tsSkillStatus tsSkillStatus-met"><Icon.Check size={11} stroke={3}/></span>}
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
                <div className="small" style={{ color: "var(--text-2)", margin: "4px 0 8px", lineHeight: 1.5 }}>{e.description}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {(e.stack ?? e.technologies ?? []).map((s: string) => <span key={s} className="tsChip" style={{ fontSize: 10.5 }}>{s}</span>)}
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
                <div className="small" style={{ color: "var(--muted)" }}>{e.institution ?? e.school ?? ''} · <span className="mono">{e.from ? `${e.from}${e.to ? ' – ' + e.to : ''}` : (e.year ?? '')}</span></div>
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
  const skills: string[] = c.skills ?? [];
  const certs: string[] = (c as any).certifications ?? [];
  const achievements: string[] = (c as any).achievements ?? [];
  const sections = [
    skills.length > 0 && { id: "skills", title: "Technical skills", count: skills.length, icon: <Icon.Code size={14}/>,
      groups: [
        { name: "Detected skills", items: skills.map(s => ({ v: s, years: 0, match: "met" })) },
      ]},
    c.experience?.length > 0 && { id: "exp", title: "Professional experience", count: c.experience.length, icon: <Icon.Briefcase size={14}/>, experience: c.experience },
    c.education?.length > 0 && { id: "edu", title: "Education", count: c.education.length, icon: <Icon.Book size={14}/>, education: c.education },
    certs.length > 0 && { id: "certs", title: "Certifications", count: certs.length, icon: <Icon.ShieldCheck size={14}/>,
      certs: certs.map(name => ({ name, issuer: '', date: '', match: 'met' })) },
    achievements.length > 0 && { id: "ach", title: "Achievements", count: achievements.length, icon: <Icon.Award size={14}/>,
      items: achievements },
  ].filter(Boolean) as any[];
  if (sections.length === 0) {
    return <div style={{ padding: 24, color: 'var(--muted)', fontSize: 13 }}>No detailed breakdown available yet.</div>;
  }
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
          {s.experience && Array.isArray(s.experience) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0' }}>
              {s.experience.map((e: any, i: number) => (
                <div key={i} style={{ borderLeft: '2px solid var(--border)', paddingLeft: 14 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{e.role} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {e.company}</span></div>
                  <div className="small mono" style={{ color: 'var(--muted)', marginBottom: 4 }}>{e.from ?? ''}{e.to ? ' – ' + e.to : ''}</div>
                  {e.description && <div className="small" style={{ color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 6 }}>{e.description}</div>}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(e.stack ?? e.technologies ?? []).map((t: string) => <span key={t} className="tsChip" style={{ fontSize: 10.5 }}>{t}</span>)}
                  </div>
                </div>
              ))}
            </div>
          )}
          {s.education && Array.isArray(s.education) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {s.education.map((e: any, i: number) => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8 }}>
                  <Icon.Book size={18} style={{ color: 'var(--primary-3)', flexShrink: 0, marginTop: 2 }}/>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{e.degree}{e.field ? ` · ${e.field}` : ''}</div>
                    <div className="small" style={{ color: 'var(--muted)' }}>{e.institution ?? e.school ?? ''}{(e.from || e.year) ? ` · ${e.from ?? e.year ?? ''}${e.to ? ' – ' + e.to : ''}` : ''}</div>
                  </div>
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
  const [questions, setQuestions] = React.useState<{ q: string; why: string }[]>([]);
  const { mutate: generateQs, isPending } = useGenerateQuestions(c.id);

  const handleGenerate = () => {
    generateQs(undefined, {
      onSuccess: (data) => setQuestions(data.questions ?? []),
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card padded={false} className="ai-border">
        <div style={{ padding: 22, position: "relative" }}>
          <AIPill>AI summary</AIPill>
          <div style={{ marginTop: 14, fontSize: 14, lineHeight: 1.65 }}>
            {c.ai_analysis ? (
              <span style={{ color: 'var(--text-2)' }}>{c.ai_analysis}</span>
            ) : (
              <span className="small" style={{ color: 'var(--muted)' }}>AI analysis will appear here once the resume is scored.</span>
            )}
          </div>
        </div>
      </Card>

      <Card padded={false}>
        <div className="tsCardHead">
          <div className="h3">Suggested interview questions</div>
          <Badge variant="ai"><Icon.Sparkles size={10}/> Tailored to gaps</Badge>
        </div>
        <div style={{ padding: "0 24px 22px", display: "flex", flexDirection: "column", gap: 10 }}>
          {questions.length === 0 && !isPending && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="small" style={{ color: 'var(--muted)', flex: 1 }}>Generate tailored questions based on this candidate's profile and the job requirements.</div>
              <Button variant="secondary" size="sm" icon={<Icon.Sparkles size={12}/>} onClick={handleGenerate}>Generate</Button>
            </div>
          )}
          {isPending && <div className="small" style={{ color: 'var(--muted)' }}>Generating questions...</div>}
          {questions.map((it, i) => (
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
        c.overall_score != null && { who: "AI", action: `scored candidate at ${c.overall_score}%`, time: c.updated_at ? new Date(c.updated_at).toLocaleString() : '', type: "ai" },
        c.created_at && { who: c.name, action: "submitted application", time: new Date(c.created_at).toLocaleString(), type: "neutral" },
      ].filter(Boolean).map((a, i) => <ActivityRow key={i} a={a}/>)}
    </div>
  </Card>
);


export { CandidateDetail };
export default CandidateDetail;
