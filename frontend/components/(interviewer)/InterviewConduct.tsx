"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Modal, Button, Avatar, Badge, AIPill, Textarea, useToast, ScorePill } from "@/components/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useInterview, useSubmitFeedback, useInterviewFeedback } from "@/hooks/queries/useInterviews";
import { useCandidate, useGenerateQuestions, useInterviewQuestions } from "@/hooks/queries/useCandidates";
import { useJob } from "@/hooks/queries/useJobs";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const { useState: useS_ic, useEffect: useE_ic, useRef: useR_ic } = React;

function InterviewConduct({ interviewId }: { interviewId?: string }) {
  const router = useRouter();
  const { interviewId: paramId } = useParams() as { interviewId?: string };
  const actualId = interviewId ?? paramId ?? '';

  const { data: interview, isLoading } = useInterview(actualId);
  const { data: candidate } = useCandidate(interview?.candidate_id ?? '');
  const { data: job } = useJob(interview?.job_id ?? '');
  const { data: existingFeedback } = useInterviewFeedback(actualId);
  const { user } = useAuth();

  const [tab, setTab] = useS_ic("resume");
  const [timerStarted, setTimerStarted] = useS_ic(false);
  const [seconds, setSeconds] = useS_ic(0);
  const [feedbackOpen, setFeedbackOpen] = useS_ic(false);
  const [scores, setScores] = useS_ic({ tech: 0, comm: 0, problem: 0, culture: 0 });
  const [notes, setNotes] = useS_ic("");
  const [savedAt, setSavedAt] = useS_ic<Date | null>(null);

  useE_ic(() => {
    if (!timerStarted) return;
    const t = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [timerStarted]);

  useE_ic(() => {
    if (!notes) return;
    const t = setTimeout(() => setSavedAt(new Date()), 1500);
    return () => clearTimeout(t);
  }, [notes]);

  const totalSeconds = (interview?.duration_minutes ?? 60) * 60;
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const durMM = String(interview?.duration_minutes ?? 60).padStart(2, "0");
  const progress = Math.min(seconds / totalSeconds, 1);
  const overTime = seconds > totalSeconds;

  if (isLoading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "var(--muted)", gap: 10 }}>
      <Icon.Refresh size={18} style={{ animation: "spin 1s linear infinite" }}/> Loading interview…
    </div>
  );
  if (!interview) return <div style={{ padding: 32, color: "var(--danger)" }}>Interview not found.</div>;

  const candidateName = candidate?.name ?? interview.candidate_name ?? 'Candidate';

  const c = {
    id: interview.candidate_id,
    name: candidateName,
    score: candidate?.overall_score ?? 0,
    stage: interview.status,
  };

  const scheduledDate = new Date(interview.scheduled_at);
  const formattedDate = scheduledDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="tsConduct">
      <div className="tsConduct-head">
        <button className="tsIconBtn" onClick={() => router.back()}><Icon.ArrowLeft size={16}/></button>
        <Avatar name={c.name} size={36}/>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="h3" style={{ fontWeight: 600 }}>{c.name}</span>
            <Badge variant={interview.status === 'scheduled' ? 'warning' : interview.status === 'completed' ? 'success' : 'neutral'} dot>
              {interview.status}
            </Badge>
          </div>
          <div className="small" style={{ color: "var(--muted)" }}>
            {job?.title ?? 'Interview'} · Interviewer: {user?.name ?? 'You'} · {formattedDate}
          </div>
        </div>

        {/* Timer */}
        <div className="tsConduct-timer" style={{ position: "relative" }}>
          {timerStarted ? (
            <>
              <span className="tsConduct-timer-dot" style={{ background: overTime ? "var(--danger)" : "var(--success)" }}/>
              <span className="tsConduct-timer-time" style={{ color: overTime ? "var(--danger)" : undefined }}>
                {mm}:{ss}
              </span>
              <span className="small" style={{ color: "var(--muted)" }}>/ {durMM}:00</span>
            </>
          ) : (
            <Button variant="secondary" size="sm" icon={<Icon.Play size={12}/>} onClick={() => setTimerStarted(true)}>
              Start interview
            </Button>
          )}
        </div>

        {interview.video_link ? (
          <Button
            variant="secondary"
            icon={<Icon.Video size={14}/>}
            onClick={() => window.open(interview.video_link!, '_blank')}
          >
            Open Zoom
          </Button>
        ) : (
          <Button variant="secondary" icon={<Icon.Video size={14}/>} disabled title="No meeting link provided">
            Open Zoom
          </Button>
        )}

        <Button
          variant="primary"
          icon={<Icon.Check size={14} stroke={3}/>}
          onClick={() => setFeedbackOpen(true)}
          disabled={interview.status === 'completed'}
        >
          {interview.status === 'completed' ? 'Feedback submitted' : 'Complete feedback'}
        </Button>
      </div>

      {/* Timer progress bar */}
      {timerStarted && (
        <div style={{ height: 3, background: "var(--border)", position: "relative" }}>
          <div style={{
            height: "100%",
            width: `${progress * 100}%`,
            background: overTime ? "var(--danger)" : progress > 0.8 ? "var(--warning)" : "var(--success)",
            transition: "width 1s linear, background 0.3s",
          }}/>
        </div>
      )}

      <div className="tsConduct-body">
        {/* Left panel */}
        <div className="tsConduct-left">
          <div className="tsConduct-tabs">
            <button className={`tsTab ${tab === "resume" ? "tsTab-active" : ""}`} onClick={() => setTab("resume")}>
              <Icon.FileText size={13}/> Resume
            </button>
            <button className={`tsTab ${tab === "jd" ? "tsTab-active" : ""}`} onClick={() => setTab("jd")}>
              <Icon.Briefcase size={13}/> Job description
            </button>
            <button className={`tsTab ${tab === "ai" ? "tsTab-active" : ""}`} onClick={() => setTab("ai")}>
              <Icon.Sparkles size={13}/> AI questions
            </button>
            <button className={`tsTab ${tab === "prev" ? "tsTab-active" : ""}`} onClick={() => setTab("prev")}>
              Previous feedback
            </button>
          </div>
          <div className="tsConduct-tabBody">
            {tab === "resume" && <ResumeTab candidate={candidate} score={c.score}/>}
            {tab === "jd" && <JobDescTab job={job}/>}
            {tab === "ai" && <AIQuestionsTab candidateId={c.id} candidateName={c.name}/>}
            {tab === "prev" && <PrevFeedbackTab feedback={existingFeedback ?? null}/>}
          </div>
        </div>

        {/* Right panel: Notes + Scoring */}
        <div className="tsConduct-right">
          <div className="tsNotes">
            <div className="tsNotes-head">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="h3" style={{ fontWeight: 500 }}>Interview notes</span>
                {savedAt && (
                  <span className="tsNotes-saved">
                    <Icon.Check size={11} stroke={3}/>
                    Auto-saved {Math.max(1, Math.floor((Date.now() - savedAt.getTime()) / 60000))} min ago
                  </span>
                )}
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
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                style={{ width: "100%", height: "100%", background: "transparent", border: 0, outline: "none", color: "var(--text)", fontFamily: "inherit", fontSize: 14, lineHeight: 1.6, resize: "none" }}
                placeholder="Take notes during interview…"
              />
            </div>
          </div>

          <div className="tsScoring">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span className="h3" style={{ fontWeight: 500, fontSize: 15 }}>Quick scoring</span>
              <span className="small" style={{ color: "var(--muted)" }}>
                {interview.interview_type_id ? 'Round-specific' : 'General'}
              </span>
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
                    <span className="mono small" style={{ color: scores[q.id] > 0 ? "var(--primary-3)" : "var(--muted)" }}>
                      {scores[q.id]}/5
                    </span>
                  </div>
                  <Stars value={scores[q.id]} onChange={v => setScores(s => ({ ...s, [q.id]: v }))}/>
                  <div className="small" style={{ color: "var(--muted)", marginTop: 2, fontSize: 11 }}>{q.hint}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {feedbackOpen && (
        <FeedbackForm
          c={c}
          interviewId={actualId}
          initialScores={scores}
          notes={notes}
          onClose={() => setFeedbackOpen(false)}
        />
      )}
    </div>
  );
}

// ----- Resume Tab -----
function ResumeTab({ candidate, score }: { candidate: any; score: number }) {
  const [blobUrl, setBlobUrl] = useS_ic<string | null>(null);
  const [loadError, setLoadError] = useS_ic(false);
  const [loading, setLoading] = useS_ic(false);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';
  const isPdf = candidate?.resume_url && !candidate.resume_url.endsWith('.docx');

  useE_ic(() => {
    if (!candidate?.id || !isPdf || blobUrl) return;
    setLoading(true);
    import('@/lib/auth').then(({ getToken }) => {
      const token = getToken();
      fetch(`${apiUrl}/api/candidates/${candidate.id}/resume`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(r => r.ok ? r.blob() : Promise.reject(r.status))
        .then(blob => setBlobUrl(URL.createObjectURL(blob)))
        .catch(() => setLoadError(true))
        .finally(() => setLoading(false));
    });
  }, [candidate?.id]);

  useE_ic(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  if (!candidate) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "var(--muted)", gap: 8 }}>
      <Icon.Refresh size={16} style={{ animation: "spin 1s linear infinite" }}/> Loading resume…
    </div>
  );

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, color: "var(--muted)", gap: 8 }}>
      <Icon.Refresh size={16} style={{ animation: "spin 1s linear infinite" }}/> Loading PDF…
    </div>
  );

  // PDF viewer
  if (blobUrl && !loadError) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ScorePill score={score}/>
          <span className="small" style={{ color: "var(--muted)" }}>Match score</span>
          <span style={{ flex: 1 }}/>
          <a href={blobUrl} download={`${candidate.name}_Resume.pdf`}>
            <Button variant="ghost" size="sm" icon={<Icon.Download size={12}/>}>Download</Button>
          </a>
        </div>
        <iframe src={blobUrl} style={{ flex: 1, minHeight: 560, border: "1px solid var(--border)", borderRadius: 8, background: "#fff" }} title="Resume"/>
      </div>
    );
  }

  // Fallback: parsed structured data (DOCX or fetch failed)
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <ScorePill score={score}/>
        <span className="small" style={{ color: "var(--muted)" }}>Match score</span>
      </div>
      <div className="tsResume"><div className="tsResume-doc">
        <div className="tsResume-name">{candidate.name}</div>
        {(candidate.email || candidate.location) && (
          <div className="small" style={{ color: "var(--muted)", marginBottom: 14 }}>
            {[candidate.email, candidate.location].filter(Boolean).join(' · ')}
          </div>
        )}
        {candidate.technical_skills?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div className="tiny" style={{ marginBottom: 8 }}>Skills</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {candidate.technical_skills.map((s: string) => (
                <span key={s} className="tsBadge tsBadge-default" style={{ fontSize: 11 }}>{s}</span>
              ))}
            </div>
          </div>
        )}
        {(candidate.professional_experience as any[])?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div className="tiny" style={{ marginBottom: 8 }}>Experience</div>
            {(candidate.professional_experience as any[]).map((e: any, i: number) => (
              <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < candidate.professional_experience.length - 1 ? "1px solid var(--border)" : "none" }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{e.title ?? e.role}</div>
                {e.company && <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>{e.company}</div>}
                {(e.from || e.to) && <div className="small" style={{ color: "var(--muted)" }}>{e.from} – {e.to ?? 'Present'}</div>}
              </div>
            ))}
          </div>
        )}
        {(candidate.education_details as any[])?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div className="tiny" style={{ marginBottom: 8 }}>Education</div>
            {(candidate.education_details as any[]).map((e: any, i: number) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{e.institution ?? e.school}</div>
                <div className="small" style={{ color: "var(--muted)" }}>
                  {e.degree}{(e.from || e.to) ? ` · ${e.from ?? ''} – ${e.to ?? ''}` : (e.year ? ` · ${e.year}` : '')}
                </div>
              </div>
            ))}
          </div>
        )}
        {candidate.achievements?.length > 0 && (
          <div>
            <div className="tiny" style={{ marginBottom: 8 }}>Achievements</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {candidate.achievements.map((a: string, i: number) => (
                <li key={i} style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 4 }}>{a}</li>
              ))}
            </ul>
          </div>
        )}
      </div></div>
    </div>
  );
}

// ----- Job Description Tab -----
function JobDescTab({ job }: { job: any }) {
  const [blobUrl, setBlobUrl] = useS_ic<string | null>(null);
  const [loadError, setLoadError] = useS_ic(false);
  const [loading, setLoading] = useS_ic(false);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

  useE_ic(() => {
    if (!job?.id || !job.jd_url || blobUrl) return;
    setLoading(true);
    import('@/lib/auth').then(({ getToken }) => {
      const token = getToken();
      fetch(`${apiUrl}/api/jobs/${job.id}/jd`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(r => r.ok ? r.blob() : Promise.reject(r.status))
        .then(blob => setBlobUrl(URL.createObjectURL(blob)))
        .catch(() => setLoadError(true))
        .finally(() => setLoading(false));
    });
  }, [job?.id]);

  useE_ic(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  if (!job) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "var(--muted)", gap: 8 }}>
      <Icon.Refresh size={16} style={{ animation: "spin 1s linear infinite" }}/> Loading…
    </div>
  );

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, color: "var(--muted)", gap: 8 }}>
      <Icon.Refresh size={16} style={{ animation: "spin 1s linear infinite" }}/> Loading JD…
    </div>
  );

  // PDF viewer
  if (blobUrl && !loadError) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="h3" style={{ fontWeight: 600 }}>{job.title}</span>
          <span style={{ flex: 1 }}/>
          <a href={blobUrl} download="JobDescription.pdf">
            <Button variant="ghost" size="sm" icon={<Icon.Download size={12}/>}>Download</Button>
          </a>
        </div>
        <iframe src={blobUrl} style={{ flex: 1, minHeight: 560, border: "1px solid var(--border)", borderRadius: 8, background: "#fff" }} title="Job Description"/>
      </div>
    );
  }

  // Fallback: structured data (no JD file uploaded)
  const meta = [job.department, job.location, job.employment_type, job.salary_range].filter(Boolean).join(' · ');
  return (
    <div>
      <div className="h3" style={{ marginBottom: 4, fontWeight: 600 }}>{job.title}</div>
      {meta && <div className="small" style={{ color: "var(--muted)", marginBottom: 18 }}>{meta}</div>}
      <div className="tsResume-doc" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "none", padding: 22 }}>
        {job.description && (
          <>
            <div className="tiny" style={{ marginBottom: 8 }}>About the role</div>
            <p style={{ fontSize: 13, lineHeight: 1.7, margin: "0 0 18px", color: "var(--text-2)", whiteSpace: "pre-wrap" }}>{job.description}</p>
          </>
        )}
        {job.required_skills?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div className="tiny" style={{ marginBottom: 8 }}>Required skills</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {job.required_skills.map((s: string) => (
                <span key={s} className="tsBadge tsBadge-primary" style={{ fontSize: 11 }}>{s}</span>
              ))}
            </div>
          </div>
        )}
        {job.nice_to_have_skills?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div className="tiny" style={{ marginBottom: 8 }}>Nice to have</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {job.nice_to_have_skills.map((s: string) => (
                <span key={s} className="tsBadge tsBadge-default" style={{ fontSize: 11 }}>{s}</span>
              ))}
            </div>
          </div>
        )}
        {job.min_years_experience > 0 && (
          <div className="small" style={{ color: "var(--muted)", marginTop: 8 }}>
            Minimum {job.min_years_experience} year{job.min_years_experience !== 1 ? 's' : ''} of experience required
          </div>
        )}
      </div>
    </div>
  );
}

// ----- AI Questions Tab -----
function AIQuestionsTab({ candidateId, candidateName }: { candidateId: string; candidateName: string }) {
  const [open, setOpen] = useS_ic(-1);
  const [asked, setAsked] = useS_ic<Set<number>>(new Set());
  const qc = useQueryClient();
  const cacheKey = ['candidates', candidateId, 'questions'];
  const { data: cached } = useInterviewQuestions(candidateId);
  const { mutate: generate, isPending } = useGenerateQuestions(candidateId);

  const questions: { q: string; why: string }[] = (cached?.questions as any) ?? [];

  const handleGenerate = () => {
    generate(undefined, {
      onSuccess: (data) => qc.setQueryData(cacheKey, data),
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="ai-border" style={{ padding: 14, borderRadius: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: questions.length > 0 ? 0 : 8 }}>
          <AIPill>Tailored questions</AIPill>
          <span className="small" style={{ color: "var(--muted)", flex: 1 }}>
            {questions.length > 0
              ? `${questions.length} questions generated for ${candidateName}`
              : `Generate questions tailored to ${candidateName}'s resume and this role`}
          </span>
          <Button
            variant="ai"
            size="sm"
            icon={<Icon.Sparkles size={12}/>}
            loading={isPending}
            onClick={handleGenerate}
          >
            {questions.length > 0 ? 'Regenerate' : 'Generate questions'}
          </Button>
        </div>
      </div>

      {questions.length === 0 && !isPending && (
        <div style={{ padding: "32px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
          <Icon.Sparkles size={28} style={{ display: "block", margin: "0 auto 10px", opacity: 0.4 }}/>
          Click "Generate questions" to get AI-tailored interview questions<br/>based on this candidate's resume and the job requirements.
        </div>
      )}

      {isPending && (
        <div style={{ padding: "32px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
          <Icon.Refresh size={20} style={{ display: "block", margin: "0 auto 10px", animation: "spin 1s linear infinite" }}/>
          Generating tailored questions…
        </div>
      )}

      {questions.map((it, i) => (
        <div key={i} className="tsAIQCard" style={{ opacity: asked.has(i) ? 0.5 : 1, transition: "opacity 0.2s" }}>
          <button className="tsAIQCard-head" onClick={() => setOpen(o => o === i ? -1 : i)}>
            <span className="tsAIQ-num mono">{String(i + 1).padStart(2, "0")}</span>
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.45 }}>{it.q}</div>
              {it.why && <div className="small" style={{ color: "var(--muted)", marginTop: 4 }}>{it.why}</div>}
            </div>
            {asked.has(i) && <span className="tsBadge tsBadge-success" style={{ fontSize: 10, marginRight: 4 }}>Asked</span>}
            <Icon.ChevronDown size={14} style={{ transform: open === i ? "rotate(180deg)" : "", transition: "transform 0.18s", marginTop: 4, flexShrink: 0 }}/>
          </button>
          {open === i && (
            <div className="tsAIQCard-body">
              <div style={{ display: "flex", gap: 6 }}>
                <button className="tsBtn tsBtn-ghost tsBtn-sm" onClick={() => navigator.clipboard.writeText(it.q)}>
                  <Icon.Copy size={11}/> Copy
                </button>
                <button
                  className={`tsBtn tsBtn-sm ${asked.has(i) ? 'tsBtn-ghost' : 'tsBtn-secondary'}`}
                  onClick={() => setAsked(prev => {
                    const next = new Set(prev);
                    next.has(i) ? next.delete(i) : next.add(i);
                    return next;
                  })}
                >
                  {asked.has(i) ? 'Unmark' : 'Mark as asked'}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ----- Previous Feedback Tab -----
function PrevFeedbackTab({ feedback }: { feedback: any }) {
  if (!feedback) return (
    <div style={{ padding: "32px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
      <Icon.Bell size={28} style={{ display: "block", margin: "0 auto 10px", opacity: 0.4 }}/>
      No feedback submitted yet for this interview.
    </div>
  );

  const recColors: Record<string, string> = {
    strong_yes: "var(--success)", yes: "var(--success)",
    maybe: "var(--warning)", no: "var(--danger)", strong_no: "var(--danger)",
  };
  const recLabels: Record<string, string> = {
    strong_yes: "Strong Yes", yes: "Yes", maybe: "Maybe", no: "No", strong_no: "Strong No",
  };
  const scores = [
    { label: "Technical", value: feedback.technical_score },
    { label: "Communication", value: feedback.communication_score },
    { label: "Problem solving", value: feedback.problem_solving_score },
    { label: "Culture fit", value: feedback.culture_score },
  ].filter(s => s.value != null);
  const avg = scores.length > 0 ? Math.round(scores.reduce((a, s) => a + s.value, 0) / scores.length * 20) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, background: "var(--surface-2)", borderRadius: 10 }}>
        <div style={{ flex: 1 }}>
          <div className="small" style={{ color: "var(--muted)", marginBottom: 2 }}>Submitted {new Date(feedback.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 15, color: recColors[feedback.recommendation] ?? "var(--text)" }}>
              {recLabels[feedback.recommendation] ?? feedback.recommendation}
            </span>
            {avg != null && (
              <span className="mono small" style={{ color: "var(--muted)" }}>· {avg}% avg score</span>
            )}
          </div>
        </div>
        <Badge variant={['strong_yes','yes'].includes(feedback.recommendation) ? 'success' : feedback.recommendation === 'maybe' ? 'warning' : 'danger'}>
          {recLabels[feedback.recommendation] ?? feedback.recommendation}
        </Badge>
      </div>

      {/* Score grid */}
      {scores.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {scores.map(s => (
            <div key={s.label} style={{ padding: 12, background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>{s.label}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Stars value={s.value} onChange={() => {}} max={5}/>
                <span className="mono small" style={{ color: "var(--text-2)" }}>{s.value}/5</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {feedback.strengths && (
        <div>
          <div className="tiny" style={{ marginBottom: 6 }}>Key strengths</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-2)", padding: "10px 14px", background: "var(--surface-2)", borderRadius: 8, borderLeft: "3px solid var(--success)" }}>
            {feedback.strengths}
          </div>
        </div>
      )}

      {feedback.weaknesses && (
        <div>
          <div className="tiny" style={{ marginBottom: 6 }}>Gaps / concerns</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-2)", padding: "10px 14px", background: "var(--surface-2)", borderRadius: 8, borderLeft: "3px solid var(--warning)" }}>
            {feedback.weaknesses}
          </div>
        </div>
      )}

      {feedback.notes && (
        <div>
          <div className="tiny" style={{ marginBottom: 6 }}>Notes</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-2)", padding: "10px 14px", background: "var(--surface-2)", borderRadius: 8 }}>
            {feedback.notes}
          </div>
        </div>
      )}
    </div>
  );
}

// ----- Stars -----
const Stars = ({ value, onChange, max = 5 }: any) => (
  <div className="tsStars">
    {Array.from({ length: max }, (_, i) => (
      <button key={i} className={i < value ? "active" : ""} onClick={() => onChange(i + 1)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill={i < value ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      </button>
    ))}
  </div>
);

// ===== Feedback Form Modal =====
function FeedbackForm({ c, interviewId, initialScores, notes: initialNotes, onClose }: any) {
  const toast = useToast();
  const { mutate: submitFeedback, isPending } = useSubmitFeedback(interviewId ?? '');
  const [scores, setScores] = useS_ic(initialScores);
  const [rec, setRec] = useS_ic<string | null>(null);
  const [strengths, setStrengths] = useS_ic("");
  const [gaps, setGaps] = useS_ic("");
  const [impact, setImpact] = useS_ic(initialNotes ?? "");

  const recOptions = [
    { id: "strong_yes", label: "Strong Yes", desc: "Definitely hire" },
    { id: "yes", label: "Yes", desc: "Move forward" },
    { id: "maybe", label: "Maybe", desc: "Mixed signals" },
    { id: "no", label: "No", desc: "Not a fit" },
    { id: "strong_no", label: "Strong No", desc: "Do not hire" },
  ];

  const totalScore = Math.round((scores.tech + scores.comm + scores.problem + scores.culture) / 4 * 20);

  return (
    <Modal open={true} onClose={onClose} width={680}
      title="Complete interview feedback"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            variant="primary"
            icon={<Icon.Send size={13}/>}
            disabled={!rec}
            loading={isPending}
            onClick={() => {
              submitFeedback({
                technical_score: scores.tech,
                communication_score: scores.comm,
                problem_solving_score: scores.problem,
                culture_score: scores.culture,
                strengths: strengths || undefined,
                weaknesses: gaps || undefined,
                notes: impact || undefined,
                recommendation: rec,
              }, {
                onSuccess: () => {
                  toast({ message: "Feedback submitted successfully." });
                  onClose();
                },
                onError: () => {
                  toast({ message: "Failed to submit feedback. Please try again.", variant: "error" });
                },
              });
            }}
          >
            Submit feedback
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {/* Header */}
        <div style={{ padding: 14, background: "var(--surface-2)", borderRadius: 10, display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar name={c.name} size={36}/>
          <div style={{ flex: 1 }}>
            <div className="small" style={{ color: "var(--muted)" }}>Completing feedback for</div>
            <div style={{ fontWeight: 600 }}>{c.name}</div>
          </div>
          {totalScore > 0 && (
            <div style={{ textAlign: "right" }}>
              <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: totalScore >= 70 ? "var(--success)" : totalScore >= 50 ? "var(--warning)" : "var(--danger)" }}>
                {totalScore}%
              </div>
              <div className="tiny" style={{ color: "var(--muted)" }}>avg score</div>
            </div>
          )}
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 500 }}>{q.label}</span>
                  <span className="mono small" style={{ color: scores[q.id] > 0 ? "var(--primary-3)" : "var(--muted)" }}>{scores[q.id]}/5</span>
                </div>
                <Stars value={scores[q.id]} onChange={v => setScores((s: any) => ({ ...s, [q.id]: v }))}/>
              </div>
            ))}
          </div>
        </div>

        <Textarea label="Key strengths" value={strengths} onChange={e => setStrengths(e.target.value)} maxLength={500} rows={3}
          placeholder="Strong system-design thinking, clear communication, deep domain knowledge…"/>

        <Textarea label="Skills or experience gaps" value={gaps} onChange={e => setGaps(e.target.value)} maxLength={500} rows={3}
          placeholder="Be specific about gaps surfaced during the round."/>

        <Textarea label="Notes / quantified impact" value={impact} onChange={e => setImpact(e.target.value)} maxLength={500} rows={2}
          hint="E.g. 'Led team of 5', 'Scaled system 10×' — helps with calibration."/>

        {/* Recommendation */}
        <div>
          <div style={{ marginBottom: 10, fontWeight: 500, fontSize: 13 }}>
            Overall recommendation <span style={{ color: "var(--danger)" }}>*</span>
          </div>
          <div className="tsRec">
            {recOptions.map(o => (
              <button
                key={o.id}
                className={`tsRec-opt ${rec === o.id ? `tsRec-opt-active ${o.id}` : ""}`}
                onClick={() => setRec(o.id)}
              >
                {o.label}
                <div className="tsRec-opt-desc">{o.desc}</div>
              </button>
            ))}
          </div>
          {!rec && <div className="small" style={{ color: "var(--muted)", marginTop: 6 }}>Select a recommendation to enable submit.</div>}
        </div>
      </div>
    </Modal>
  );
}

export { InterviewConduct, FeedbackForm, Stars };
export default InterviewConduct;
