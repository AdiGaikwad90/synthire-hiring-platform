"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Card, Button, Badge, Slider, Input, Select, Textarea, AIPill, useToast } from "@/components/ui";
import { JDUploadModal } from "./JDUploadModal";
import { useCreateJob } from "@/hooks/queries/useJobs";
import type { ScoringDimensions } from "@/lib/api";
import { ApiError } from "@/lib/api";

// ─────────────────────────────────────────────────────────────────────────────
// Scoring v2 — independent 0-100 importance per dimension, with sub-dimensions.
// Backend normalizes via weighted averages. No "must sum to 100" constraint.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_DIMENSIONS: ScoringDimensions = {
  skills:       { importance: 80, sub_dimensions: { technical: 90, soft: 60, domain: 70 } },
  experience:   { importance: 70, sub_dimensions: { years_relevant: 80, industry_match: 60, leadership: 50 } },
  education:    { importance: 50, sub_dimensions: { degree_level: 60, field_relevance: 70, certifications: 40 } },
  achievements: { importance: 60, sub_dimensions: { impact: 80, recognition: 50 } },
};

type DimMeta = {
  id: keyof ScoringDimensions
  label: string
  hint: string
  icon: React.ReactNode
  color: string
  subs: { id: string; label: string; hint: string }[]
};

const DIMENSION_META: DimMeta[] = [
  { id: "skills", label: "Skills", hint: "Match against required + nice-to-have technologies.", icon: <Icon.Code size={16}/>, color: "var(--primary)",
    subs: [
      { id: "technical", label: "Technical", hint: "Required tech stack match" },
      { id: "soft", label: "Soft skills", hint: "Communication, teamwork" },
      { id: "domain", label: "Domain", hint: "Industry/business expertise" },
    ]},
  { id: "experience", label: "Experience", hint: "Years of relevant experience and prior roles.", icon: <Icon.Briefcase size={16}/>, color: "var(--info)",
    subs: [
      { id: "years_relevant", label: "Years relevant", hint: "Meets the min-years bar in relevant roles" },
      { id: "industry_match", label: "Industry match", hint: "Same industry / similar product" },
      { id: "leadership", label: "Leadership", hint: "Led projects, teams, or mentored" },
    ]},
  { id: "education", label: "Education", hint: "Degree level, field relevance, certifications.", icon: <Icon.Book size={16}/>, color: "var(--success)",
    subs: [
      { id: "degree_level", label: "Degree level", hint: "B.S., M.S., PhD" },
      { id: "field_relevance", label: "Field relevance", hint: "Field of study matches the role" },
      { id: "certifications", label: "Certifications", hint: "Relevant professional certifications" },
    ]},
  { id: "achievements", label: "Achievements", hint: "Quantified impact and external recognition.", icon: <Icon.Award size={16}/>, color: "var(--warning)",
    subs: [
      { id: "impact", label: "Impact", hint: "Quantified outcomes (scale, revenue, etc.)" },
      { id: "recognition", label: "Recognition", hint: "Awards, talks, OSS, publications" },
    ]},
];

const PRESETS: { id: string; label: string; desc: string; icon: React.ReactNode; apply: () => ScoringDimensions }[] = [
  { id: "balanced", label: "Balanced", desc: "Equal weight on all four", icon: <Icon.Target size={14}/>,
    apply: () => ({
      skills: { importance: 80, sub_dimensions: { technical: 80, soft: 80, domain: 80 } },
      experience: { importance: 80, sub_dimensions: { years_relevant: 80, industry_match: 80, leadership: 80 } },
      education: { importance: 80, sub_dimensions: { degree_level: 80, field_relevance: 80, certifications: 80 } },
      achievements: { importance: 80, sub_dimensions: { impact: 80, recognition: 80 } },
    }) },
  { id: "engineer", label: "Engineering Focus", desc: "Heavy on technical skills", icon: <Icon.Code size={14}/>,
    apply: () => ({
      skills: { importance: 100, sub_dimensions: { technical: 100, soft: 50, domain: 70 } },
      experience: { importance: 80, sub_dimensions: { years_relevant: 90, industry_match: 60, leadership: 40 } },
      education: { importance: 40, sub_dimensions: { degree_level: 50, field_relevance: 70, certifications: 30 } },
      achievements: { importance: 60, sub_dimensions: { impact: 80, recognition: 40 } },
    }) },
  { id: "manager", label: "Manager Role", desc: "Experience + leadership", icon: <Icon.Users size={14}/>,
    apply: () => ({
      skills: { importance: 60, sub_dimensions: { technical: 60, soft: 90, domain: 70 } },
      experience: { importance: 100, sub_dimensions: { years_relevant: 90, industry_match: 70, leadership: 100 } },
      education: { importance: 50, sub_dimensions: { degree_level: 60, field_relevance: 60, certifications: 40 } },
      achievements: { importance: 90, sub_dimensions: { impact: 100, recognition: 70 } },
    }) },
  { id: "entry", label: "Entry Level", desc: "Education + potential", icon: <Icon.Book size={14}/>,
    apply: () => ({
      skills: { importance: 70, sub_dimensions: { technical: 70, soft: 80, domain: 50 } },
      experience: { importance: 40, sub_dimensions: { years_relevant: 30, industry_match: 50, leadership: 20 } },
      education: { importance: 90, sub_dimensions: { degree_level: 90, field_relevance: 90, certifications: 60 } },
      achievements: { importance: 60, sub_dimensions: { impact: 60, recognition: 70 } },
    }) },
];

const TOTAL_STEPS = 4;

interface FormState {
  // Step 1
  title: string
  department: string
  location: string
  employment_type: "full_time" | "part_time" | "contract"
  experience_level: "junior" | "mid" | "senior" | "lead"
  salary_range: string
  // Step 2
  description: string
  required_skills: string[]
  nice_to_have_skills: string[]
  min_years_experience: number
  education_requirement: "" | "none" | "bachelors" | "masters" | "phd"
  // Step 3
  scoring_dimensions: ScoringDimensions
  // From JD upload
  jd_url?: string | null
}

const INITIAL_STATE: FormState = {
  title: "",
  department: "",
  location: "",
  employment_type: "full_time",
  experience_level: "mid",
  salary_range: "",
  description: "",
  required_skills: [],
  nice_to_have_skills: [],
  min_years_experience: 0,
  education_requirement: "",
  scoring_dimensions: DEFAULT_DIMENSIONS,
};

function JobForm() {
  const router = useRouter();
  const toast = useToast();
  const createJob = useCreateJob();

  const [step, setStep] = React.useState(1);
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [showJD, setShowJD] = React.useState(false);
  const [skillDraft, setSkillDraft] = React.useState("");
  const [niceDraft, setNiceDraft] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const dims = form.scoring_dimensions;
  const avgPriority = Math.round(
    (dims.skills.importance + dims.experience.importance + dims.education.importance + dims.achievements.importance) / 4
  );

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(s => ({ ...s, [key]: value }));

  const updateImportance = (id: keyof ScoringDimensions, v: number) =>
    setForm(s => ({
      ...s,
      scoring_dimensions: { ...s.scoring_dimensions, [id]: { ...s.scoring_dimensions[id], importance: v } },
    }));

  const updateSub = (id: keyof ScoringDimensions, sub: string, v: number) =>
    setForm(s => ({
      ...s,
      scoring_dimensions: {
        ...s.scoring_dimensions,
        [id]: {
          ...s.scoring_dimensions[id],
          sub_dimensions: { ...s.scoring_dimensions[id].sub_dimensions, [sub]: v },
        },
      },
    }));

  const subAverage = (id: keyof ScoringDimensions): number => {
    const subs = dims[id].sub_dimensions;
    const values = Object.values(subs);
    if (values.length === 0) return 0;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  };

  // Validation per step. Returns the first missing-field error (or null).
  const validateStep = (s: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (!form.title.trim()) e.title = "Job title is required";
    }
    if (s === 2) {
      if (form.required_skills.length === 0) e.required_skills = "Add at least one required skill";
    }
    return e;
  };

  const goNext = () => {
    const e = validateStep(step);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setStep(s => Math.min(TOTAL_STEPS, s + 1));
  };
  const goBack = () => setStep(s => Math.max(1, s - 1));

  const handleSubmit = async () => {
    setSubmitError(null);
    const e1 = validateStep(1);
    const e2 = validateStep(2);
    if (Object.keys({ ...e1, ...e2 }).length > 0) {
      setErrors({ ...e1, ...e2 });
      setStep(Object.keys(e1).length > 0 ? 1 : 2);
      return;
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      department: form.department.trim() || undefined,
      location: form.location.trim() || undefined,
      employment_type: form.employment_type,
      experience_level: form.experience_level,
      salary_range: form.salary_range.trim() || undefined,
      required_skills: form.required_skills,
      nice_to_have_skills: form.nice_to_have_skills,
      min_years_experience: Number(form.min_years_experience) || 0,
      education_requirement: form.education_requirement || undefined,
      scoring_dimensions: form.scoring_dimensions,
      jd_url: form.jd_url ?? undefined,
    };

    try {
      const job = await createJob.mutateAsync(payload);
      toast({ message: `Job "${job.title}" created.` });
      router.push(`/jobs/${job.id}`);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Failed to create job");
    }
  };

  const handleJDParsed = (parsed: Record<string, unknown> | null) => {
    if (!parsed) return;
    const normalizeEmploymentType = (v: unknown): FormState["employment_type"] => {
      const s = String(v ?? '').toLowerCase().replace(/[\s-]/g, '')
      if (s.includes('part')) return 'part_time'
      if (s.includes('contract') || s.includes('freelance')) return 'contract'
      return 'full_time'
    }
    const normalizeExperienceLevel = (v: unknown): FormState["experience_level"] => {
      const s = String(v ?? '').toLowerCase()
      if (s.includes('lead') || s.includes('staff') || s.includes('principal')) return 'lead'
      if (s.includes('senior') || s.includes('sr')) return 'senior'
      if (s.includes('junior') || s.includes('jr') || s.includes('entry')) return 'junior'
      return 'mid'
    }
    const normalizeEducation = (v: unknown): FormState["education_requirement"] => {
      const s = String(v ?? '').toLowerCase()
      if (s.includes('phd') || s.includes('doctor')) return 'phd'
      if (s.includes('master') || s.includes('mba') || s.includes('msc')) return 'masters'
      if (s.includes('bachelor') || s.includes('degree') || s.includes('bs') || s.includes('ba')) return 'bachelors'
      if (s === 'none' || s === 'null' || !s) return ''
      return 'none'
    }
    setForm(s => ({
      ...s,
      title: String(parsed.title ?? s.title),
      department: String(parsed.department ?? s.department),
      location: String(parsed.location ?? s.location),
      description: String(parsed.description ?? s.description),
      employment_type: parsed.employment_type ? normalizeEmploymentType(parsed.employment_type) : s.employment_type,
      experience_level: parsed.experience_level ? normalizeExperienceLevel(parsed.experience_level) : s.experience_level,
      salary_range: String(parsed.salary_range ?? s.salary_range),
      required_skills: Array.isArray(parsed.required_skills) ? (parsed.required_skills as string[]) : s.required_skills,
      nice_to_have_skills: Array.isArray(parsed.nice_to_have_skills) ? (parsed.nice_to_have_skills as string[]) : s.nice_to_have_skills,
      min_years_experience: Number(parsed.min_years_experience ?? s.min_years_experience),
      education_requirement: parsed.education_requirement ? normalizeEducation(parsed.education_requirement) : s.education_requirement,
      jd_url: parsed.jd_url ? String(parsed.jd_url) : s.jd_url,
    }));
  };

  const stepLabels = ["Job basics", "Requirements", "Scoring priorities", "Review & publish"];

  return (
    <div className="tsWizardLayout">
    <div className="tsWizardScroll">
    <div className="tsWizard">
      <button className="tsBackBtn" onClick={() => router.push("/jobs")}>
        <Icon.ArrowLeft size={14}/> Back to jobs
      </button>

      <div className="tsWizard-head">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div className="h1">Create new job</div>
            <div className="small" style={{ color: "var(--muted)" }}>
              Step {step} of {TOTAL_STEPS} · {stepLabels[step - 1]}
            </div>
          </div>
          <Button variant="secondary" icon={<Icon.Upload size={14}/>} onClick={() => setShowJD(true)}>
            <span>Upload JD</span>
            <AIPill>AI-parsed</AIPill>
          </Button>
        </div>
      </div>

      {/* Stepper */}
      <div className="tsStepper">
        {stepLabels.map((label, idx) => {
          const num = idx + 1;
          return (
            <React.Fragment key={num}>
              <div className={`tsStepper-step ${step === num ? "active" : ""} ${step > num ? "done" : ""}`}>
                <div className="tsStepper-circle">
                  {step > num ? <Icon.Check size={12} stroke={3}/> : num}
                </div>
                <div className="tsStepper-label">{label}</div>
              </div>
              {num < TOTAL_STEPS && <div className={`tsStepper-line ${step > num ? "done" : ""}`}/>}
            </React.Fragment>
          );
        })}
      </div>

      {/* Step body */}
      <div style={{ marginTop: 28 }}>
        {step === 1 && (
          <StepBasics form={form} update={updateForm} errors={errors}/>
        )}
        {step === 2 && (
          <StepRequirements
            form={form}
            update={updateForm}
            errors={errors}
            skillDraft={skillDraft}
            setSkillDraft={setSkillDraft}
            niceDraft={niceDraft}
            setNiceDraft={setNiceDraft}
          />
        )}
        {step === 3 && (
          <StepScoring
            dims={dims}
            avgPriority={avgPriority}
            expanded={expanded}
            setExpanded={setExpanded}
            updateImportance={updateImportance}
            updateSub={updateSub}
            subAverage={subAverage}
            applyPreset={(d) => updateForm("scoring_dimensions", d)}
            reset={() => updateForm("scoring_dimensions", DEFAULT_DIMENSIONS)}
          />
        )}
        {step === 4 && (
          <StepReview form={form}/>
        )}
      </div>

      {submitError && (
        <div style={{ marginTop: 24, color: "var(--danger)", fontSize: 13 }}>{submitError}</div>
      )}

      {showJD && <JDUploadModal onClose={() => setShowJD(false)} onParsed={(p) => { handleJDParsed(p as unknown as Record<string, unknown>); setShowJD(false); }}/>}
    </div>
    </div>

    <div className="tsWizardFooter">
      <div className="tsWizardFooter-inner">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Button variant="ghost" icon={<Icon.Refresh size={14}/>} onClick={() => setForm(INITIAL_STATE)}>
            Reset
          </Button>
          <span className="small" style={{ color: "var(--muted)" }}>
            {step === 3 ? `Avg priority: ${avgPriority}%` : ""}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" onClick={goBack} disabled={step === 1}>
            Back
          </Button>
          {step < TOTAL_STEPS ? (
            <Button variant="primary" onClick={goNext}>
              Continue <Icon.ArrowRight size={14}/>
            </Button>
          ) : (
            <Button variant="primary" onClick={handleSubmit} loading={createJob.isPending}>
              Create job <Icon.Check size={14} stroke={3}/>
            </Button>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}

// ─── Step 1: Basics ──────────────────────────────────────────────────────────
function StepBasics({
  form, update, errors,
}: { form: FormState; update: <K extends keyof FormState>(k: K, v: FormState[K]) => void; errors: Record<string, string> }) {
  return (
    <Card padded style={{ display: "flex", flexDirection: "column", gap: 18, padding: 28 }}>
      <div className="h3" style={{ marginBottom: 4 }}>Job basics</div>
      <div className="small" style={{ color: "var(--muted)", marginTop: -8 }}>What's the role?</div>

      <Input label="Job title *" value={form.title} onChange={e => update("title", e.target.value)}
        placeholder="e.g. Senior Backend Engineer" error={errors.title}/>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Input label="Department" value={form.department} onChange={e => update("department", e.target.value)} placeholder="Engineering"/>
        <Input label="Location" value={form.location} onChange={e => update("location", e.target.value)} placeholder="Remote / NYC"/>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Select label="Employment type" value={form.employment_type}
          onChange={e => update("employment_type", e.target.value as FormState["employment_type"])}
          options={[
            { value: "full_time", label: "Full-time" },
            { value: "part_time", label: "Part-time" },
            { value: "contract", label: "Contract" },
          ]}/>
        <Select label="Experience level" value={form.experience_level}
          onChange={e => update("experience_level", e.target.value as FormState["experience_level"])}
          options={[
            { value: "junior", label: "Junior" },
            { value: "mid", label: "Mid" },
            { value: "senior", label: "Senior" },
            { value: "lead", label: "Lead / Staff" },
          ]}/>
      </div>

      <Input label="Salary range" value={form.salary_range} onChange={e => update("salary_range", e.target.value)} placeholder="$120k – $160k"/>
    </Card>
  );
}

// ─── Step 2: Requirements ────────────────────────────────────────────────────
function StepRequirements({
  form, update, errors, skillDraft, setSkillDraft, niceDraft, setNiceDraft,
}: {
  form: FormState
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void
  errors: Record<string, string>
  skillDraft: string; setSkillDraft: (s: string) => void
  niceDraft: string; setNiceDraft: (s: string) => void
}) {
  const addSkill = (list: "required_skills" | "nice_to_have_skills", draft: string, setDraft: (s: string) => void) => {
    const t = draft.trim();
    if (!t) return;
    if (form[list].includes(t)) { setDraft(""); return; }
    update(list, [...form[list], t]);
    setDraft("");
  };
  const removeSkill = (list: "required_skills" | "nice_to_have_skills", skill: string) =>
    update(list, form[list].filter(s => s !== skill));

  return (
    <Card padded style={{ display: "flex", flexDirection: "column", gap: 18, padding: 28 }}>
      <div className="h3" style={{ marginBottom: 4 }}>Requirements</div>
      <div className="small" style={{ color: "var(--muted)", marginTop: -8 }}>What does the candidate need to bring?</div>

      <Textarea
        label="Job description"
        rows={5}
        value={form.description}
        onChange={e => update("description", e.target.value)}
        placeholder="Paste or type the job description. The AI uses this for semantic matching."
        hint="Used for AI semantic matching against candidate resumes."
      />

      <SkillEditor
        label="Required skills *"
        skills={form.required_skills}
        draft={skillDraft}
        setDraft={setSkillDraft}
        onAdd={() => addSkill("required_skills", skillDraft, setSkillDraft)}
        onRemove={s => removeSkill("required_skills", s)}
        error={errors.required_skills}
        placeholder="Type a skill and press Enter (e.g. React, Go, Postgres)"
      />

      <SkillEditor
        label="Nice-to-have skills"
        skills={form.nice_to_have_skills}
        draft={niceDraft}
        setDraft={setNiceDraft}
        onAdd={() => addSkill("nice_to_have_skills", niceDraft, setNiceDraft)}
        onRemove={s => removeSkill("nice_to_have_skills", s)}
        placeholder="Press Enter to add"
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Input
          label="Minimum years of experience"
          type="number"
          min={0}
          value={form.min_years_experience}
          onChange={e => update("min_years_experience", Math.max(0, Number(e.target.value) || 0))}
        />
        <Select label="Education requirement" value={form.education_requirement}
          onChange={e => update("education_requirement", e.target.value as FormState["education_requirement"])}
          options={[
            { value: "", label: "No preference" },
            { value: "none", label: "None required" },
            { value: "bachelors", label: "Bachelor's" },
            { value: "masters", label: "Master's" },
            { value: "phd", label: "PhD" },
          ]}/>
      </div>
    </Card>
  );
}

function SkillEditor({
  label, skills, draft, setDraft, onAdd, onRemove, error, placeholder,
}: {
  label: string; skills: string[]; draft: string; setDraft: (s: string) => void
  onAdd: () => void; onRemove: (s: string) => void; error?: string; placeholder?: string
}) {
  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <Input
            label={label}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onAdd(); }}}
            placeholder={placeholder}
            error={error}
          />
        </div>
        <Button variant="secondary" onClick={onAdd} icon={<Icon.Plus size={14}/>} style={{ marginBottom: error ? 22 : 0 }}>Add</Button>
      </div>
      {skills.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {skills.map(s => (
            <span key={s} className="tsChip" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {s}
              <button onClick={() => onRemove(s)} aria-label={`Remove ${s}`} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--muted)" }}>
                <Icon.X size={11}/>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Step 3: Scoring (v2 — independent importance) ───────────────────────────
function StepScoring({
  dims, avgPriority, expanded, setExpanded, updateImportance, updateSub, subAverage, applyPreset, reset,
}: {
  dims: ScoringDimensions
  avgPriority: number
  expanded: Record<string, boolean>
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  updateImportance: (id: keyof ScoringDimensions, v: number) => void
  updateSub: (id: keyof ScoringDimensions, sub: string, v: number) => void
  subAverage: (id: keyof ScoringDimensions) => number
  applyPreset: (d: ScoringDimensions) => void
  reset: () => void
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Card padded style={{ padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div className="h3">Scoring priorities</div>
            <div className="small" style={{ color: "var(--muted)", marginTop: 4 }}>
              Set each dimension's importance independently (0-100%). The backend normalizes — no need to make them sum to 100.
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="tiny" style={{ color: "var(--muted)" }}>Average priority</div>
            <div className="mono" style={{ fontSize: 28, fontWeight: 600, color: "var(--primary-3)" }}>{avgPriority}<span style={{ fontSize: 16, opacity: 0.6 }}>%</span></div>
          </div>
        </div>

        {/* Presets */}
        <div style={{ marginTop: 18 }}>
          <div className="tiny" style={{ marginBottom: 8 }}>Quick presets</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PRESETS.map(p => (
              <button key={p.id} className="tsPreset" onClick={() => applyPreset(p.apply())}>
                <span className="tsPreset-icon">{p.icon}</span>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{p.label}</div>
                  <div className="small" style={{ color: "var(--muted)" }}>{p.desc}</div>
                </div>
              </button>
            ))}
            <button className="tsPreset" onClick={reset}>
              <span className="tsPreset-icon"><Icon.Refresh size={14}/></span>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>Default</div>
                <div className="small" style={{ color: "var(--muted)" }}>Sensible defaults</div>
              </div>
            </button>
          </div>
        </div>
      </Card>

      {DIMENSION_META.map(d => {
        const isOpen = !!expanded[d.id];
        const subAvg = subAverage(d.id);
        return (
          <Card key={d.id} padded={false} className="tsWeight">
            <div className="tsWeight-head" style={{ padding: "18px 20px 6px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div className="tsWeight-icon" style={{ background: `${d.color}22`, color: d.color, borderColor: `${d.color}44` }}>{d.icon}</div>
                <div>
                  <div className="h4" style={{ fontWeight: 500, fontSize: 14 }}>{d.label}</div>
                  <div className="small" style={{ color: "var(--muted)", marginTop: 2 }}>{d.hint}</div>
                </div>
              </div>
              <div className="tsWeight-val">
                <span className="mono">{dims[d.id].importance}</span>
                <span style={{ color: "var(--muted)", fontSize: 14 }}>%</span>
              </div>
            </div>
            <div className="tsWeight-slider" style={{ padding: "0 20px 14px" }}>
              <Slider value={dims[d.id].importance} onChange={v => updateImportance(d.id, v)} color={d.color}/>
            </div>
            <button className="tsWeight-expand" onClick={() => setExpanded(e => ({ ...e, [d.id]: !e[d.id] }))} style={{ padding: "10px 20px" }}>
              <Icon.ChevronDown size={12} style={{ transform: isOpen ? "rotate(180deg)" : "", transition: "transform 0.2s" }}/>
              <span>Sub-dimensions</span>
              <span className="small" style={{ marginLeft: "auto", color: "var(--muted)" }}>avg {subAvg}%</span>
            </button>
            {isOpen && (
              <div className="tsWeight-subs" style={{ padding: "12px 20px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                {d.subs.map(s => (
                  <div key={s.id} className="tsWeight-sub" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div className="small" style={{ fontWeight: 500 }}>{s.label}</div>
                      <div className="tiny" style={{ color: "var(--muted)" }}>{s.hint}</div>
                    </div>
                    <div style={{ width: 200 }}>
                      <Slider value={dims[d.id].sub_dimensions[s.id] ?? 0} onChange={v => updateSub(d.id, s.id, v)} color={d.color}/>
                    </div>
                    <div className="mono" style={{ width: 42, textAlign: "right", fontSize: 13 }}>{dims[d.id].sub_dimensions[s.id] ?? 0}%</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ─── Step 4: Review ──────────────────────────────────────────────────────────
function StepReview({ form }: { form: FormState }) {
  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <div className="small" style={{ color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 13.5 }}>{value || <span style={{ color: "var(--muted)" }}>—</span>}</div>
    </div>
  );

  return (
    <Card padded style={{ padding: 28 }}>
      <div className="h3" style={{ marginBottom: 4 }}>Review & publish</div>
      <div className="small" style={{ color: "var(--muted)", marginBottom: 18 }}>Double-check before creating. You can edit any field afterwards.</div>

      <Row label="Title" value={form.title}/>
      <Row label="Department" value={form.department}/>
      <Row label="Location" value={form.location}/>
      <Row label="Employment type" value={form.employment_type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}/>
      <Row label="Experience level" value={form.experience_level.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}/>
      <Row label="Salary range" value={form.salary_range}/>
      <Row label="Required skills" value={form.required_skills.length ? form.required_skills.join(", ") : ""}/>
      <Row label="Nice-to-have skills" value={form.nice_to_have_skills.length ? form.nice_to_have_skills.join(", ") : ""}/>
      <Row label="Min years experience" value={String(form.min_years_experience)}/>
      <Row label="Education requirement" value={form.education_requirement || ""}/>
      <Row label="Description" value={form.description ? <span style={{ whiteSpace: "pre-wrap" }}>{form.description}</span> : ""}/>

      <div style={{ marginTop: 18 }}>
        <div className="tiny" style={{ marginBottom: 8 }}>Scoring priorities</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {DIMENSION_META.map(d => {
            const dim = form.scoring_dimensions[d.id];
            return (
              <div key={d.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{d.label}</span>
                  <Badge>{dim.importance}%</Badge>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {d.subs.map(s => (
                    <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)" }}>
                      <span>{s.label}</span>
                      <span className="mono">{dim.sub_dimensions[s.id] ?? 0}%</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

export { JobForm as JobWizard };
export default JobForm;
