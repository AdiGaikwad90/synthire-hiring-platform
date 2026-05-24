"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Button, Input, AIPill, Avatar, ScorePill, useToast } from "@/components/ui";
import { Logo } from "@/components/shared/Logo";

// Landing page (condensed)
function Landing() {
  const router = useRouter();
  const toast = useToast();

  return (
    <div className="tsLanding">
      {/* Nav */}
      <nav className="tsLanding-nav">
        <Logo/>
        <div className="tsLanding-navLinks">
          <a href="#">Product</a>
          <a href="#">Customers</a>
          <a href="#">Pricing</a>
          <a href="#">Docs</a>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="tsBtn tsBtn-ghost tsBtn-md" onClick={() => router.push("/login")}>Sign in</button>
          <Button variant="primary" onClick={() => router.push("/signup")}>Start free <Icon.ArrowRight size={13}/></Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="tsLanding-hero">
        <div className="tsLanding-heroBg bg-grid"/>
        <div className="tsLanding-heroSpot"/>

        <div className="tsLanding-heroInner">
          <div className="tsLanding-eyebrow">
            <AIPill>New · Resume Breakdown 2.0</AIPill>
            <span className="small" style={{ color: "var(--text-2)", marginLeft: 8 }}>Now parses certifications & open-source contributions →</span>
          </div>

          <h1 className="tsLanding-h1">
            Hire <span className="ai-text">10× faster</span><br/>
            with AI resume screening
          </h1>
          <p className="tsLanding-sub">
            Screen 1,000s of candidates in minutes. AI-powered, human-approved — Synthire reads, scores, and ranks resumes against your role so your team only sees the top of the pile.
          </p>

          <div className="tsLanding-cta">
            <Button variant="primary" size="lg" onClick={() => router.push("/signup")}>Start free → 14-day trial</Button>
            <button className="tsBtn tsBtn-secondary tsBtn-lg" onClick={() => toast({ message: 'Demo coming soon' })}>
              <Icon.Play size={12}/> Watch demo · 2 min
            </button>
          </div>

          <div className="tsLanding-trust">
            <span className="small" style={{ color: "var(--muted)" }}>Trusted by hiring teams at</span>
            <div className="tsLanding-logos">
              {["Stripe", "Vercel", "Linear", "Notion", "Figma", "Plaid"].map(c => (
                <span key={c} style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-2)", letterSpacing: "-0.02em" }}>{c}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Hero illustration */}
        <div className="tsLanding-heroVis">
          <HeroVisual/>
        </div>
      </section>

      {/* Features */}
      <section className="tsLanding-features">
        <div className="tsLanding-section-eyebrow">CAPABILITIES</div>
        <h2 className="tsLanding-h2">Everything to run the loop</h2>
        <div className="tsGrid tsGrid-3" style={{ marginTop: 40 }}>
          {[
            { icon: <Icon.Zap size={20}/>, t: "Lightning-fast AI screening", d: "Score 1,000 resumes in 90 seconds against role-specific weights. Watch the AI surface the top 5% in the first minute.", c: "#A855F7" },
            { icon: <Icon.Target size={20}/>, t: "Smart, transparent filtering", d: "Filter by skills, years, education, certifications, even open-source contributions. Every score links back to the resume line that produced it.", c: "#3B82F6" },
            { icon: <Icon.Kanban size={20}/>, t: "End-to-end pipeline", d: "Drag-and-drop kanban, custom interview rounds, schedule + feedback + offer — all in one place, all shared with your hiring panel.", c: "#10B981" },
          ].map(f => (
            <div key={f.t} className="tsLanding-feat">
              <div className="tsLanding-feat-icon" style={{ background: `${f.c}1A`, color: f.c, borderColor: `${f.c}44` }}>{f.icon}</div>
              <div className="h3" style={{ marginBottom: 6 }}>{f.t}</div>
              <p className="small" style={{ color: "var(--text-2)", lineHeight: 1.55, marginBottom: 14 }}>{f.d}</p>
              <button className="tsBtn tsBtn-ghost tsBtn-sm" style={{ padding: 0, color: "var(--primary-3)" }} onClick={() => toast({ message: 'Coming soon' })}>Learn more <Icon.ArrowRight size={11}/></button>
            </div>
          ))}
        </div>
      </section>

      {/* Stat strip */}
      <section className="tsLanding-stats">
        <div>
          <div className="mono" style={{ fontSize: 36, fontWeight: 500, letterSpacing: "-0.02em" }}>70%</div>
          <div className="small" style={{ color: "var(--muted)" }}>reduction in time-to-hire</div>
        </div>
        <div>
          <div className="mono" style={{ fontSize: 36, fontWeight: 500, letterSpacing: "-0.02em", background: "var(--ai-grad)", WebkitBackgroundClip: "text", color: "transparent" }}>500+</div>
          <div className="small" style={{ color: "var(--muted)" }}>companies hiring with Synthire</div>
        </div>
        <div>
          <div className="mono" style={{ fontSize: 36, fontWeight: 500, letterSpacing: "-0.02em" }}>2.1M</div>
          <div className="small" style={{ color: "var(--muted)" }}>resumes screened this month</div>
        </div>
        <div>
          <div className="mono" style={{ fontSize: 36, fontWeight: 500, letterSpacing: "-0.02em" }}>4.9<span style={{ fontSize: 22, color: "var(--muted)" }}>/5</span></div>
          <div className="small" style={{ color: "var(--muted)" }}>average customer rating</div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="tsLanding-quote">
        <div style={{ fontSize: 32, fontWeight: 500, lineHeight: 1.3, letterSpacing: "-0.01em", maxWidth: 800, margin: "0 auto" }}>
          “We cut our screening time from <span className="ai-text">3 weeks to 4 days</span> — and our hire quality went up. The AI flags trade-offs we used to miss.”
        </div>
        <div style={{ marginTop: 28, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <Avatar name="Camila Restrepo" color="#EC4899" size={42}/>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: 500 }}>Camila Restrepo</div>
            <div className="small" style={{ color: "var(--muted)" }}>Head of Talent · Plaid</div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="tsLanding-pricing">
        <div className="tsLanding-section-eyebrow">PRICING</div>
        <h2 className="tsLanding-h2">Simple, per-seat</h2>
        <div className="small" style={{ color: "var(--muted)", marginTop: 8, marginBottom: 40 }}>14-day free trial · no credit card · cancel anytime</div>
        <div className="tsLanding-prices">
          {[
            { name: "Starter", price: 99, sub: "For teams under 10 hires/yr", features: ["Up to 5 active jobs","500 AI screens / mo","Standard pipeline + Kanban","Email integrations","Community support"], cta: "Start free", primary: false },
            { name: "Professional", price: 299, sub: "Most popular · for scaling teams", features: ["Unlimited active jobs","5,000 AI screens / mo","Custom scoring weights","Custom interview rounds","Slack, Greenhouse, Ashby","Priority support + onboarding"], cta: "Start free", primary: true, badge: "Most popular" },
          ].map(p => (
            <div key={p.name} className={`tsPrice ${p.primary ? "tsPrice-primary" : ""}`}>
              {p.badge && <div className="tsPrice-badge"><Icon.Sparkles size={11}/> {p.badge}</div>}
              <div style={{ fontSize: 15, fontWeight: 500 }}>{p.name}</div>
              <div className="small" style={{ color: "var(--muted)", marginBottom: 18 }}>{p.sub}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 46, fontWeight: 500, letterSpacing: "-0.02em" }}>${p.price}</span>
                <span style={{ color: "var(--muted)" }}>/ seat / month</span>
              </div>
              <div style={{ height: 22 }}/>
              <Button variant={p.primary ? "primary" : "secondary"} onClick={() => router.push("/signup")} style={{ width: "100%" }}>{p.cta}</Button>
              <div style={{ borderTop: "1px solid var(--border)", margin: "22px 0" }}/>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {p.features.map(f => (
                  <div key={f} className="small" style={{ display: "flex", gap: 8 }}>
                    <Icon.Check size={13} stroke={3} style={{ color: "var(--success)", flexShrink: 0, marginTop: 1 }}/>
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="tsLanding-foot">
        <div className="tsLanding-footTop">
          <div className="tsLanding-footBrand">
            <Logo/>
            <p className="small" style={{ color: "var(--muted)", marginTop: 14, maxWidth: 280 }}>AI-native applicant tracking, built for hiring teams that want to move fast without missing great people.</p>
            <div className="tsLanding-social">
              <button className="tsIconBtn"><Icon.Linkedin size={15}/></button>
              <button className="tsIconBtn"><Icon.Twitter size={15}/></button>
              <button className="tsIconBtn"><Icon.Github size={15}/></button>
            </div>
          </div>
          <FootCol title="Product" items={["Features","AI screening","Pipeline","Interviews","Analytics","Changelog"]}/>
          <FootCol title="Resources" items={["Docs","Help center","API","Integrations","Security","Pricing"]}/>
          <FootCol title="Company" items={["About","Careers","Customers","Blog","Press","Contact"]}/>
          <div>
            <div className="tsLanding-footTitle">Get the newsletter</div>
            <div className="small" style={{ color: "var(--muted)", marginBottom: 12 }}>Hiring-ops research, monthly. No spam.</div>
            <div style={{ display: "flex", gap: 6 }}>
              <Input placeholder="you@company.com" style={{ flex: 1 }}/>
              <Button variant="primary">Subscribe</Button>
            </div>
          </div>
        </div>
        <div className="tsLanding-footBottom">
          <span className="small" style={{ color: "var(--muted)" }}>© 2026 Synthire · SOC 2 Type II · GDPR compliant</span>
          <div style={{ display: "flex", gap: 18 }}>
            <a href="#" className="small" style={{ color: "var(--muted)" }}>Privacy</a>
            <a href="#" className="small" style={{ color: "var(--muted)" }}>Terms</a>
            <a href="#" className="small" style={{ color: "var(--muted)" }}>Cookies</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

const FootCol = ({ title, items }: any) => (
  <div>
    <div className="tsLanding-footTitle">{title}</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map(i => <a key={i} href="#" className="small" style={{ color: "var(--text-2)" }}>{i}</a>)}
    </div>
  </div>
);

// Hero visual — abstract "screening" composition with floating candidate cards
const HeroVisual = () => (
  <div className="tsHeroVis">
    <div className="tsHeroVis-orb"/>
    <div className="tsHeroVis-rings"/>

    {/* Centerpiece: AI panel */}
    <div className="tsHeroVis-center ai-border">
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <AIPill>Screening 247 resumes</AIPill>
          <span className="small" style={{ color: "var(--muted)" }}>1 of 12 jobs</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            { l: "Skills match", v: 92 },
            { l: "Experience", v: 84 },
            { l: "Education", v: 95 },
            { l: "Achievements", v: 76 },
          ].map(b => (
            <div key={b.l} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, color: "var(--text-2)", width: 88, flexShrink: 0 }}>{b.l}</span>
              <div style={{ flex: 1, height: 4, background: "var(--surface-2)", borderRadius: 999 }}>
                <div style={{ height: "100%", borderRadius: 999, width: `${b.v}%`, background: "var(--ai-grad)" }}/>
              </div>
              <span className="mono" style={{ fontSize: 11, width: 30, textAlign: "right" }}>{b.v}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* Floating candidate cards */}
    {[
      { x: -260, y: -50, name: "Priya Sharma", role: "Senior Engineer · Stripe", score: 92, color: "#EC4899", d: 0 },
      { x: 220, y: -110, name: "Marcus Chen", role: "Staff ML · OpenAI", score: 88, color: "#10B981", d: 0.4 },
      { x: -240, y: 150, name: "Diego Vargas", role: "Tech Lead · Plaid", score: 86, color: "#3B82F6", d: 0.8 },
      { x: 230, y: 120, name: "Aisha Patel", role: "Engineer · Vercel", score: 84, color: "#F59E0B", d: 1.2 },
      { x: -340, y: 40, name: "Yuki Tanaka", role: "Senior · Linear", score: 79, color: "#8B5CF6", d: 1.6 },
    ].map((card, i) => (
      <div key={i} className="tsHeroVis-card" style={{ animationDelay: `${card.d}s`, transform: `translate(calc(-50% + ${card.x}px), calc(-50% + ${card.y}px))` }}>
        <Avatar name={card.name} color={card.color} size={28}/>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 11.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.name}</div>
          <div style={{ fontSize: 10, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.role}</div>
        </div>
        <ScorePill score={card.score}/>
      </div>
    ))}
  </div>
);


export { Landing };
export default Landing;
