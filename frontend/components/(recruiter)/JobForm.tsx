"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Card, Button, Badge, Slider, Checkbox, Input, Avatar, AIPill, ScoreBar, useToast } from "@/components/ui";
import { JDUploadModal } from "./JDUploadModal";

// Job Create Wizard - Step 3: Scoring Weights
const { useState: useS_wiz } = React;

function JobForm() {
  const router = useRouter();
    const toast = useToast();

  const [step, setStep] = useS_wiz(3);
  const [weights, setWeights] = useS_wiz({ skills: 40, exp: 30, edu: 20, ach: 10 });
  const [subWeights, setSubWeights] = useS_wiz({
    skills: { required: 60, nice: 40 },
    exp: { years: 50, industry: 30, leadership: 20 },
    edu: { degree: 70, certs: 30 },
    ach: { metrics: 60, leadership: 30, awards: 10 },
  });
  const [expanded, setExpanded] = useS_wiz({});
  const [advanced, setAdvanced] = useS_wiz({ override: true, achScoring: true, minSkills: 50, autoRescore: false });
  const [showAdv, setShowAdv] = useS_wiz(false);
  const [showJD, setShowJD] = useS_wiz(false);
  const [parsedJD, setParsedJD] = useS_wiz(null);

  const total = weights.skills + weights.exp + weights.edu + weights.ach;
  const isValid = total === 100;

  const dimensions = [
    { id: "skills", label: "Technical Skills Match", q: "How well does the resume match the required tech stack?", help: "E.g., Must have React + Python; nice-to-have Docker.", icon: <Icon.Code size={16}/>, color: "var(--primary)",
      subs: [{ id: "required", label: "Required skills" }, { id: "nice", label: "Nice-to-have skills" }] },
    { id: "exp", label: "Experience Relevance", q: "Years and relevance of professional experience", help: "5+ years required? Leadership needed?", icon: <Icon.Briefcase size={16}/>, color: "var(--info)",
      subs: [{ id: "years", label: "Years of experience" }, { id: "industry", label: "Relevant industry" }, { id: "leadership", label: "Leadership experience" }] },
    { id: "edu", label: "Education & Certifications", q: "Degree level and professional certifications", help: "Bachelor's required? AWS certs preferred?", icon: <Icon.Book size={16}/>, color: "var(--success)",
      subs: [{ id: "degree", label: "Degree requirement" }, { id: "certs", label: "Relevant certifications" }] },
    { id: "ach", label: "Achievements & Impact", q: "Quantified results and metrics from past roles", help: "Values proven impact like \"Scaled system 10x\".", icon: <Icon.Award size={16}/>, color: "var(--warning)",
      subs: [{ id: "metrics", label: "Quantified metrics" }, { id: "leadership", label: "Leadership / mentorship" }, { id: "awards", label: "Awards" }] },
  ];

  const presets = [
    { id: "eng", label: "Engineering Focus", desc: "Heavy on technical skills", w: { skills: 50, exp: 30, edu: 15, ach: 5 }, icon: <Icon.Code size={14}/> },
    { id: "mgr", label: "Manager Role", desc: "Experience + achievements", w: { skills: 20, exp: 40, edu: 15, ach: 25 }, icon: <Icon.Users size={14}/> },
    { id: "entry", label: "Entry Level", desc: "Education-weighted", w: { skills: 30, exp: 20, edu: 30, ach: 20 }, icon: <Icon.Book size={14}/> },
  ];

  const steps = [
    { num: 1, label: "Job basics" },
    { num: 2, label: "Requirements" },
    { num: 3, label: "Scoring weights" },
    { num: 4, label: "Review & publish" },
  ];

  return (
    <div className="tsPage tsWizard">
      <button className="tsBackBtn" onClick={() => router.push("/jobs")}><Icon.ArrowLeft size={14}/> Back to jobs</button>

      <div className="tsWizard-head">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div className="h1">Create new job</div>
            <div className="small" style={{ color: "var(--muted)" }}>{parsedJD?.title || "Senior Software Engineer"} · {parsedJD?.dept || "Engineering"}</div>
          </div>
          <Button variant="secondary" icon={<Icon.Upload size={14}/>} onClick={() => setShowJD(true)}>
            <span>{parsedJD ? "Re-upload JD" : "Upload JD instead"}</span>
            <AIPill>AI-parsed</AIPill>
          </Button>
        </div>
        {parsedJD && (
          <div className="tsJDBanner" style={{ marginTop: 14 }}>
            <Icon.Sparkles size={14} style={{ color: "#A855F7" }}/>
            <span style={{ fontSize: 13 }}>
              <b style={{ color: "var(--text)" }}>Parsed from PDF</b> · {parsedJD.required.length} required skills, comp band <span className="mono">{parsedJD.salary}</span>, {parsedJD.mustHave.length} must-haves
            </span>
            <span style={{ flex: 1 }}/>
            <button className="tsBtn tsBtn-ghost tsBtn-sm" onClick={() => setParsedJD(null)}>Clear</button>
          </div>
        )}
      </div>

      {/* Stepper */}
      <div className="tsStepper">
        {steps.map((s, i) => (
          <React.Fragment key={s.num}>
            <div className={`tsStepper-step ${step === s.num ? "active" : ""} ${step > s.num ? "done" : ""}`}>
              <div className="tsStepper-circle">{step > s.num ? <Icon.Check size={12} stroke={3}/> : s.num}</div>
              <div className="tsStepper-label">{s.label}</div>
            </div>
            {i < steps.length - 1 && <div className={`tsStepper-line ${step > s.num ? "done" : ""}`}/>}
          </React.Fragment>
        ))}
      </div>

      <div className="tsWizard-body">
        <div>
          <div className="h2" style={{ marginBottom: 4 }}>Configure scoring weights</div>
          <div className="small" style={{ color: "var(--muted)", marginBottom: 24 }}>Customize how AI scores candidates for this job. Total must equal 100%.</div>

          {/* Total display */}
          <div className={`tsTotalCard ${isValid ? "valid" : ""}`}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="tiny" style={{ color: "var(--muted)" }}>Total</span>
              <span className="mono" style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.02em", color: isValid ? "var(--success)" : "var(--warning)" }}>{total}<span style={{ fontSize: 20 }}>%</span></span>
              {isValid ? (
                <Badge variant="success"><Icon.Check size={11} stroke={3}/> Ready</Badge>
              ) : total < 100 ? (
                <Badge variant="warning"><Icon.AlertTriangle size={11}/> Need {100 - total}% more</Badge>
              ) : (
                <Badge variant="danger"><Icon.AlertTriangle size={11}/> {total - 100}% over</Badge>
              )}
            </div>
            {/* Composition bar */}
            <div className="tsCompBar">
              {dimensions.map(d => (
                <div key={d.id} className="tsCompBar-seg" style={{ flex: weights[d.id], background: d.color }} title={`${d.label}: ${weights[d.id]}%`}/>
              ))}
            </div>
          </div>

          {/* Presets */}
          <div style={{ marginTop: 22, marginBottom: 8 }}>
            <div className="tiny" style={{ marginBottom: 8 }}>Quick presets</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {presets.map(p => (
                <button key={p.id} className="tsPreset" onClick={() => setWeights(p.w)}>
                  <span className="tsPreset-icon">{p.icon}</span>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{p.label}</div>
                    <div className="small" style={{ color: "var(--muted)" }}>{p.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Dimensions */}
          <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 12 }}>
            {dimensions.map(d => (
              <Card key={d.id} padded={false} className="tsWeight">
                <div className="tsWeight-head">
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div className="tsWeight-icon" style={{ background: `${d.color}22`, color: d.color, borderColor: `${d.color}44` }}>{d.icon}</div>
                    <div>
                      <div className="h4" style={{ fontWeight: 500, fontSize: 14 }}>{d.label}</div>
                      <div className="small" style={{ color: "var(--muted)", marginTop: 2 }}>{d.q}</div>
                    </div>
                  </div>
                  <div className="tsWeight-val">
                    <span className="mono">{weights[d.id]}</span><span style={{ color: "var(--muted)", fontSize: 14 }}>%</span>
                  </div>
                </div>
                <div className="tsWeight-slider">
                  <Slider value={weights[d.id]} onChange={v => setWeights(w => ({ ...w, [d.id]: v }))} color={d.color}/>
                </div>
                <button className="tsWeight-expand" onClick={() => setExpanded(e => ({ ...e, [d.id]: !e[d.id] }))}>
                  <Icon.ChevronDown size={12} style={{ transform: expanded[d.id] ? "rotate(180deg)" : "", transition: "transform 0.2s" }}/>
                  Sub-dimensions
                  <span className="small" style={{ marginLeft: "auto", color: "var(--muted)" }}>{d.help}</span>
                </button>
                {expanded[d.id] && (
                  <div className="tsWeight-subs">
                    {d.subs.map(s => (
                      <div key={s.id} className="tsWeight-sub">
                        <div className="small" style={{ flex: 1 }}>{s.label}</div>
                        <Slider value={subWeights[d.id][s.id]} onChange={v => setSubWeights(sw => ({ ...sw, [d.id]: { ...sw[d.id], [s.id]: v }}))} color={d.color}/>
                        <div className="mono" style={{ width: 38, textAlign: "right", fontSize: 12 }}>{subWeights[d.id][s.id]}%</div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>

          {/* Advanced */}
          <button className="tsAdvToggle" onClick={() => setShowAdv(v => !v)}>
            <Icon.ChevronDown size={14} style={{ transform: showAdv ? "rotate(180deg)" : "", transition: "transform 0.2s" }}/>
            <span>Advanced options</span>
            <span className="small" style={{ color: "var(--muted)", marginLeft: "auto" }}>{showAdv ? "Hide" : "Show"} 4 settings</span>
          </button>
          {showAdv && (
            <Card style={{ marginTop: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Checkbox checked={advanced.override} onChange={v => setAdvanced(a => ({ ...a, override: v }))}
                  label={<span><b>Allow manual score overrides</b><span className="small" style={{ display: "block", color: "var(--muted)" }}>Recruiters can adjust AI-generated scores when reviewing.</span></span>}/>
                <Checkbox checked={advanced.achScoring} onChange={v => setAdvanced(a => ({ ...a, achScoring: v }))}
                  label={<span><b>Parse achievements & certifications</b><span className="small" style={{ display: "block", color: "var(--muted)" }}>Extract and score quantified achievements from each resume.</span></span>}/>
                <Checkbox checked={advanced.autoRescore} onChange={v => setAdvanced(a => ({ ...a, autoRescore: v }))}
                  label={<span><b>Auto re-score if JD is updated</b><span className="small" style={{ display: "block", color: "var(--muted)" }}>Re-run scoring on all candidates when requirements change.</span></span>}/>
                <div style={{ display: "flex", alignItems: "center", gap: 16, paddingTop: 4 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>Minimum required-skills score</div>
                    <div className="small" style={{ color: "var(--muted)" }}>Auto-reject candidates below this threshold.</div>
                  </div>
                  <div style={{ width: 200, display: "flex", alignItems: "center", gap: 10 }}>
                    <Slider value={advanced.minSkills} onChange={v => setAdvanced(a => ({ ...a, minSkills: v }))}/>
                    <div className="mono" style={{ width: 36, textAlign: "right" }}>{advanced.minSkills}%</div>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Right sidebar: preview */}
        <aside className="tsWizard-preview">
          <div className="tsCardHead" style={{ padding: "18px 20px 12px" }}>
            <div className="h3">Live preview</div>
            <AIPill>Sample scoring</AIPill>
          </div>
          <div style={{ padding: "0 20px 20px" }}>
            <div className="small" style={{ color: "var(--muted)", marginBottom: 12 }}>Here's how Priya Sharma would score with these weights:</div>
            <PreviewScoreCard weights={weights}/>
            <div style={{ borderTop: "1px dashed var(--border)", margin: "16px 0" }}/>
            <div className="tiny" style={{ marginBottom: 8 }}>Distribution</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {dimensions.map(d => (
                <div key={d.id} className="tsScoreBar">
                  <div className="tsScoreBar-head">
                    <span className="tsScoreBar-label" style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: 2, background: d.color }}/>{d.label}</span>
                    <span className="tsScoreBar-val mono" style={{ color: weights[d.id] === 0 ? "var(--faint)" : "var(--text)" }}>{weights[d.id]}%</span>
                  </div>
                  <div className="tsScoreBar-track">
                    <div className="tsScoreBar-fill" style={{ width: `${weights[d.id]}%`, background: d.color }}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* Footer */}
      <div className="tsWizard-foot">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Button variant="ghost" icon={<Icon.Refresh size={14}/>} onClick={() => setWeights({ skills: 40, exp: 30, edu: 20, ach: 10 })}>Reset</Button>
          <Button variant="secondary" icon={<Icon.Save size={14}/>}>Save as template</Button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" onClick={() => setStep(2)}>Back</Button>
          <Button variant="primary" disabled={!isValid} onClick={() => { toast({ message: "Weights saved. Moving to review." }); router.push("/jobs"); }}>
            Continue <Icon.ArrowRight size={14}/>
          </Button>
        </div>
      </div>

      {showJD && <JDUploadModal onClose={() => setShowJD(false)} onParsed={(p) => setParsedJD(p)}/>}
    </div>
  );
};

const PreviewScoreCard = ({ weights }: any) => {
    const dim = { skills: 92, exp: 84, edu: 95, ach: 76 };
  const overall = Math.round((dim.skills * weights.skills + dim.exp * weights.exp + dim.edu * weights.edu + dim.ach * weights.ach) / 100);
  return (
    <div className="tsPreviewCard">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar name="Priya Sharma" color="#EC4899" size={36}/>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500 }}>Priya Sharma</div>
          <div className="small" style={{ color: "var(--muted)" }}>Senior Engineer · Stripe</div>
        </div>
        <div className="tsPreviewCard-score">
          <div className="mono" style={{ fontSize: 22, fontWeight: 600, lineHeight: 1, color: overall >= 80 ? "var(--success)" : overall >= 60 ? "var(--warning)" : "var(--danger)" }}>{overall}</div>
          <div className="tiny">Overall</div>
        </div>
      </div>
    </div>
  );
};


export { JobForm as JobWizard };
export default JobForm;
