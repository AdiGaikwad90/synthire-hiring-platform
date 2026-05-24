"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Modal, Button, Avatar, Badge, AIPill, Textarea, useToast, ScorePill } from "@/components/ui";
import { useInterview, useSubmitFeedback } from "@/hooks/queries/useInterviews";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

// Interview Conduct page + Feedback form modal
const { useState: useS_ic, useEffect: useE_ic, useRef: useR_ic } = React;

function InterviewConduct({ interviewId }: { interviewId?: string }) {
  const router = useRouter();
  const { interviewId: paramId } = useParams() as { interviewId?: string };
  const actualId = interviewId ?? paramId ?? '';

  const { data: interview, isLoading } = useInterview(actualId);
  const { user } = useAuth();

  const [tab, setTab] = useS_ic("ai");
  const [seconds, setSeconds] = useS_ic(0);
  const [feedbackOpen, setFeedbackOpen] = useS_ic(false);
  const [scores, setScores] = useS_ic({ tech: 0, comm: 0, problem: 0, culture: 0 });
  const [notes, setNotes] = useS_ic("");
  const [savedAt, setSavedAt] = useS_ic(new Date());

  useE_ic(() => {
    const t = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useE_ic(() => {
    const t = setTimeout(() => setSavedAt(new Date()), 1500);
    return () => clearTimeout(t);
  }, [notes]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  if (isLoading) return <div style={{padding:32,color:'var(--muted)'}}>Loading interview...</div>;
  if (!interview) return <div style={{padding:32,color:'var(--danger)'}}>Interview not found</div>;

  const c = {
    id: interview.candidate_id,
    name: interview.candidate_name ?? interview.candidate_id,
    email: '',
    avatar: '',
    title: '',
    score: 0,
    stage: interview.status,
  };

  return (
    <div className="tsConduct">
      <div className="tsConduct-head">
        <button className="tsIconBtn" onClick={() => router.push("/interviewer")}><Icon.ArrowLeft size={16}/></button>
        <Avatar name={c.name} color={c.avatar} size={36}/>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="h3" style={{ fontWeight: 500 }}>{c.name}</span>
            <Badge variant="warning" dot>{interview.status}</Badge>
          </div>
          <div className="small" style={{ color: "var(--muted)" }}>Interviewer: {user?.name ?? 'You'}{c.title ? ` · ${c.title}` : ''}</div>
        </div>
        <div className="tsConduct-timer">
          <span className="tsConduct-timer-dot"/>
          <span className="tsConduct-timer-time">{mm}:{ss}</span>
          <span className="small" style={{ color: "var(--muted)" }}>/ {String(interview.duration_minutes ?? 60).padStart(2,'0')}:00</span>
        </div>
        <Button variant="secondary" icon={<Icon.Video size={14}/>}>Open Zoom</Button>
        <Button variant="primary" icon={<Icon.Check size={14} stroke={3}/>} onClick={() => setFeedbackOpen(true)}>Complete feedback</Button>
      </div>

      <div className="tsConduct-body">
        {/* Left: Resume / JD / AI questions */}
        <div className="tsConduct-left">
          <div className="tsConduct-tabs">
            <button className={`tsTab ${tab === "resume" ? "tsTab-active" : ""}`} onClick={() => setTab("resume")}><Icon.FileText size={13}/> Resume</button>
            <button className={`tsTab ${tab === "jd" ? "tsTab-active" : ""}`} onClick={() => setTab("jd")}><Icon.Briefcase size={13}/> Job description</button>
            <button className={`tsTab ${tab === "ai" ? "tsTab-active" : ""}`} onClick={() => setTab("ai")}><Icon.Sparkles size={13}/> AI questions</button>
            <button className={`tsTab ${tab === "prev" ? "tsTab-active" : ""}`} onClick={() => setTab("prev")}>Previous feedback</button>
          </div>
          <div className="tsConduct-tabBody">
            {tab === "resume" && <div style={{ display: "flex", justifyContent: "center" }}><ScorePill score={c.score}/> <div style={{ marginLeft: 12 }} className="small">(Full resume — see candidate profile)</div></div>}
            {tab === "resume" && <div style={{ marginTop: 14 }}><div className="tsResume"><div className="tsResume-doc"><div className="tsResume-name">{c.name}</div></div></div></div>}
            {tab === "jd" && <JobDescTab/>}
            {tab === "ai" && <AIQuestionsTab/>}
            {tab === "prev" && <PrevFeedbackTab/>}
          </div>
        </div>

        {/* Right: Notes + Scoring */}
        <div className="tsConduct-right">
          <div className="tsNotes">
            <div className="tsNotes-head">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="h3" style={{ fontWeight: 500 }}>Interview notes</span>
                <span className="tsNotes-saved"><Icon.Check size={11} stroke={3}/> Auto-saved {Math.max(1, Math.floor((Date.now() - savedAt.getTime()) / 60000))} min ago</span>
              </div>
              <Button variant="ai" size="sm" icon={<Icon.Sparkles size={11}/>}>Summarize</Button>
            </div>
            <div className="tsNotes-toolbar">
              <button title="Bold"><Icon.Bold size={13}/></button>
              <button title="Italic"><Icon.Italic size={13}/></button>
              <div style={{ width: 1, background: "var(--border)", margin: "4px 4px" }}/>
              <button title="Bullet list"><Icon.ListUl size={13}/></button>
              <button title="Numbered list"><Icon.ListOl size={13}/></button>
              <div style={{ width: 1, background: "var(--border)", margin: "4px 4px" }}/>
              <button title="Code"><Icon.Code size={13}/></button>
              <div style={{ flex: 1 }}/>
              <span className="tiny" style={{ color: "var(--muted)" }}>{notes.length} chars</span>
            </div>
            <div className="tsNotes-body">
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                style={{ width: "100%", height: "100%", background: "transparent", border: 0, outline: "none", color: "var(--text)", fontFamily: "inherit", fontSize: 14, lineHeight: 1.6, resize: "none" }}
                placeholder="Take notes during interview…"/>
            </div>
          </div>

          <div className="tsScoring">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span className="h3" style={{ fontWeight: 500, fontSize: 15 }}>Quick scoring</span>
              <span className="small" style={{ color: "var(--muted)" }}>Round-specific (Technical)</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { id: "tech", label: "Technical knowledge", hint: "Deep dives, fundamentals, edge cases" },
                { id: "comm", label: "Communication", hint: "Clarity, listening, structure" },
                { id: "problem", label: "Problem solving", hint: "Decomposes problems, trade-offs" },
                { id: "culture", label: "Culture & collaboration", hint: "Teamwork, humility, learning" },
              ].map(q => (
                <div key={q.id} className="tsScoring-q">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 500 }}>{q.label}</span>
                    <span className="mono small" style={{ color: "var(--muted)" }}>{scores[q.id]}/5</span>
                  </div>
                  <Stars value={scores[q.id]} onChange={v => setScores(s => ({ ...s, [q.id]: v }))}/>
                  <div className="small" style={{ color: "var(--muted)", marginTop: 2, fontSize: 11 }}>{q.hint}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {feedbackOpen && <FeedbackForm c={c} interviewId={actualId} initialScores={scores} onClose={() => setFeedbackOpen(false)}/>}
    </div>
  );
};

// ----- AI Questions Tab -----
function AIQuestionsTab() {
  const items: { q: string; ctx: string; followups: string[]; why: string }[] = [];
  const [open, setOpen] = useS_ic(0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <AIPill>Tailored questions</AIPill>
        <span className="small" style={{ color: "var(--muted)" }}>AI question generation coming soon.</span>
      </div>
      {items.length === 0 && (
        <div style={{ padding: 16, color: 'var(--muted)', fontSize: 13 }}>No questions generated yet.</div>
      )}
      {items.map((it, i) => (
        <div key={i} className="tsAIQCard">
          <button className="tsAIQCard-head" onClick={() => setOpen(o => o === i ? -1 : i)}>
            <span className="tsAIQ-num mono">{String(i+1).padStart(2,"0")}</span>
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.45 }}>{it.q}</div>
              <div className="small" style={{ color: "var(--muted)", marginTop: 4 }}>{it.why}</div>
            </div>
            <Icon.ChevronDown size={14} style={{ transform: open === i ? "rotate(180deg)" : "", transition: "transform 0.18s", marginTop: 6 }}/>
          </button>
          {open === i && (
            <div className="tsAIQCard-body">
              <div>
                <div className="tiny" style={{ marginBottom: 4 }}>Context</div>
                <div className="small">{it.ctx}</div>
              </div>
              {it.followups.length > 0 && (
                <div>
                  <div className="tiny" style={{ marginBottom: 4 }}>Suggested follow-ups</div>
                  <ul style={{ margin: 0, padding: "0 0 0 18px", fontSize: 12.5, color: "var(--text-2)" }}>
                    {it.followups.map((f, j) => <li key={j} style={{ marginBottom: 2 }}>{f}</li>)}
                  </ul>
                </div>
              )}
              <div style={{ display: "flex", gap: 6 }}>
                <button className="tsBtn tsBtn-ghost tsBtn-sm"><Icon.Copy size={11}/> Copy</button>
                <button className="tsBtn tsBtn-ghost tsBtn-sm"><Icon.Sparkles size={11}/> Regenerate</button>
                <button className="tsBtn tsBtn-ghost tsBtn-sm">Mark as asked</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

const JobDescTab = () => (
  <div>
    <div className="h3" style={{ marginBottom: 4 }}>Senior Software Engineer</div>
    <div className="small" style={{ color: "var(--muted)", marginBottom: 18 }}>Engineering · Remote (US) · $160–210k</div>
    <div className="tsResume-doc" style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", boxShadow: "none", padding: 22 }}>
      <div className="tiny" style={{ marginBottom: 8 }}>About the role</div>
      <p style={{ fontSize: 13, lineHeight: 1.6, margin: "0 0 16px", color: "var(--text-2)" }}>We're hiring a senior engineer to join our Platform team. You'll own large parts of our payment infrastructure, work closely with product and SRE, and mentor mid-level engineers.</p>
      <div className="tiny" style={{ marginBottom: 8 }}>Must have</div>
      <ul style={{ fontSize: 13, lineHeight: 1.7, margin: "0 0 16px", paddingLeft: 18, color: "var(--text-2)" }}>
        <li>5+ years building production systems in TypeScript and Python</li>
        <li>Hands-on experience with AWS and event-driven architectures</li>
        <li>Bachelor's in CS or equivalent practical experience</li>
        <li>Demonstrated experience scaling systems past 10M daily requests</li>
      </ul>
      <div className="tiny" style={{ marginBottom: 8 }}>Nice to have</div>
      <ul style={{ fontSize: 13, lineHeight: 1.7, margin: 0, paddingLeft: 18, color: "var(--text-2)" }}>
        <li>Kubernetes, Terraform, gRPC experience</li>
        <li>Open-source contributions</li>
        <li>Rust or Go (we're slowly migrating hot paths)</li>
      </ul>
    </div>
  </div>
);

const PrevFeedbackTab = () => (
  <div style={{ padding: 16, color: 'var(--muted)', fontSize: 13 }}>No previous feedback available.</div>
);

// ----- Stars -----
const Stars = ({ value, onChange, max = 5 }: any) => (
  <div className="tsStars">
    {Array.from({ length: max }, (_, i) => (
      <button key={i} className={i < value ? "active" : ""} onClick={() => onChange(i + 1)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill={i < value ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
      </button>
    ))}
  </div>
);

// ===== Feedback Form Modal =====
function FeedbackForm({ c, interviewId, initialScores, onClose }: any) {
  const toast = useToast();
  const { mutate: submitFeedback } = useSubmitFeedback(interviewId ?? '');
  const [scores, setScores] = useS_ic(initialScores);
  const [rec, setRec] = useS_ic(null);
  const [strengths, setStrengths] = useS_ic("");
  const [gaps, setGaps] = useS_ic("");
  const [impact, setImpact] = useS_ic("");
  const [aiGenerating] = useS_ic(false);
  const [aiSummary, setAiSummary] = useS_ic(null);

  const generate = () => {
    // AI summary generation requires a dedicated backend endpoint (coming soon)
    setAiSummary("AI summary generation is available after the interview is submitted.");
  };

  const recOptions = [
    { id: "strong_yes", label: "Strong Yes", desc: "Definitely hire" },
    { id: "yes", label: "Yes", desc: "Move forward" },
    { id: "maybe", label: "Maybe", desc: "Mixed signals" },
    { id: "no", label: "No", desc: "Not a fit" },
    { id: "strong_no", label: "Strong No", desc: "Do not hire" },
  ];

  return (
    <Modal open={true} onClose={onClose} width={680}
      title="Complete interview feedback"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" icon={<Icon.Save size={13}/>}>Save draft</Button>
          <Button variant="primary" icon={<Icon.Send size={13}/>} disabled={!rec} onClick={() => {
            submitFeedback({
              technical_score: scores.tech,
              communication_score: scores.comm,
              problem_solving_score: scores.problem,
              culture_score: scores.culture,
              strengths: strengths || undefined,
              weaknesses: gaps || undefined,
              notes: impact || undefined,
              recommendation: rec,
            });
            toast({ message: "Feedback submitted. Candidate moved to next stage." });
            onClose();
          }}>Submit feedback</Button>
        </>
      }>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {/* Confirmation */}
        <div style={{ padding: 14, background: "var(--surface-2)", borderRadius: 10, display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar name={c.name} color={c.avatar} size={36}/>
          <div style={{ flex: 1 }}>
            <div className="small" style={{ color: "var(--muted)" }}>You're completing feedback for</div>
            <div style={{ fontWeight: 500 }}><b>{c.name}</b></div>
          </div>
          <Badge variant="warning" dot>In progress</Badge>
        </div>

        {/* Star ratings */}
        <div>
          <div className="h4" style={{ marginBottom: 12, fontWeight: 500, fontSize: 13 }}>Round-specific scoring</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[
              { id: "tech", label: "Technical knowledge" },
              { id: "comm", label: "Communication" },
              { id: "problem", label: "Problem solving" },
              { id: "culture", label: "Culture & collaboration" },
            ].map(q => (
              <div key={q.id} style={{ padding: 12, background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 6 }}>{q.label}</div>
                <Stars value={scores[q.id]} onChange={v => setScores(s => ({ ...s, [q.id]: v }))}/>
              </div>
            ))}
          </div>
        </div>

        <Textarea label="What are this candidate's key strengths?" value={strengths} onChange={e => setStrengths(e.target.value)} maxLength={500} rows={3}
          placeholder="E.g., Strong system-design thinking, clear communication, deep payment-domain knowledge…"/>

        <Textarea label="What skills or experience were missing?" value={gaps} onChange={e => setGaps(e.target.value)} maxLength={500} rows={3}
          placeholder="Be specific — gaps surfaced during the round."/>

        <Textarea label="Quantified achievements or impact mentioned?" value={impact} onChange={e => setImpact(e.target.value)} maxLength={300} rows={2}
          hint="E.g., 'Led team of 5', 'Scaled system 10x' — helps with calibration across candidates."/>

        {/* AI summary */}
        <div className="ai-border" style={{ padding: 16, borderRadius: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: aiSummary ? 12 : 4 }}>
            <AIPill>AI-assisted summary</AIPill>
            <Button variant="ai" size="sm" icon={<Icon.Sparkles size={12}/>} loading={aiGenerating} onClick={generate}>
              {aiSummary ? "Regenerate" : "Generate summary"}
            </Button>
          </div>
          {aiSummary && (
            <div className="small" style={{ lineHeight: 1.6, color: "var(--text-2)" }}>{aiSummary}</div>
          )}
          {!aiSummary && !aiGenerating && (
            <div className="small" style={{ color: "var(--muted)" }}>Synthesizes your notes, ratings, and the candidate's resume into a 3-4 sentence summary.</div>
          )}
        </div>

        {/* Recommendation */}
        <div>
          <div className="h4" style={{ marginBottom: 10, fontWeight: 500, fontSize: 13 }}>Overall recommendation</div>
          <div className="tsRec">
            {recOptions.map(o => (
              <button key={o.id} className={`tsRec-opt ${rec === o.id ? `tsRec-opt-active ${o.id}` : ""}`} onClick={() => setRec(o.id)}>
                {o.label}
                <div className="tsRec-opt-desc">{o.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
};


export { InterviewConduct, FeedbackForm, Stars };
export default InterviewConduct;
