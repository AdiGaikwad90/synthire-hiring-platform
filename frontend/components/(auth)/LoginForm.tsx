"use client";
import * as React from "react";
import { Icon } from "@/lib/icons";
import { Button, Input, Checkbox, Avatar } from "@/components/ui";
import { Logo } from "@/components/shared/Logo";
import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/lib/api";
import { useRouter } from "next/navigation";

// Login page
const { useState: useS_lg } = React;

function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useS_lg("sarah@acme.co");
  const [password, setPassword] = useS_lg("••••••••••");
  const [remember, setRemember] = useS_lg(true);
  const [showPw, setShowPw] = useS_lg(false);
  const [loading, setLoading] = useS_lg(false);
  const [errors, setErrors] = useS_lg<Record<string, string | null>>({});
  const [apiError, setApiError] = useS_lg<string | null>(null);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!email.includes("@")) e.email = "Please enter a valid email address";
    if (password.length < 6) e.password = "Password must be at least 6 characters";
    return e;
  };

  const submit = async (e: React.FormEvent) => {
    e?.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    setApiError(null);
    try {
      await login(email, password);
      // login() calls router.push('/dashboard') on success
    } catch (err) {
      setApiError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tsLogin">
      {/* Left — value props */}
      <div className="tsLogin-left">
        <div className="tsLogin-leftBg"/>
        <div className="tsLogin-leftContent">
          <div style={{ display: "flex", alignItems: "center", gap: 9, color: "white" }}>
            <Logo/>
          </div>
          <h1 className="tsLogin-h">Welcome back to <span className="ai-text">Synthire</span></h1>
          <p className="tsLogin-sub">The applicant tracking system your hiring team has been waiting for. AI-native, calmly designed, ridiculously fast.</p>

          <div className="tsLogin-vps">
            {[
              { icon: <Icon.Zap size={16}/>, t: "Screen 1,000s of resumes in minutes" },
              { icon: <Icon.Target size={16}/>, t: "AI-powered candidate matching" },
              { icon: <Icon.Kanban size={16}/>, t: "Manage your entire pipeline in one place" },
            ].map(vp => (
              <div key={vp.t} className="tsLogin-vp">
                <div className="tsLogin-vp-icon">{vp.icon}</div>
                <div style={{ paddingTop: 6, color: "white", fontSize: 14 }}>{vp.t}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Illustration cards */}
        <div className="tsLogin-illu">
          <div className="tsLogin-illuCard" style={{ top: 20, left: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Avatar name="Priya Sharma" color="#EC4899" size={22}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 11.5 }}>Priya Sharma</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.6)" }}>Senior Engineer</div>
              </div>
              <span style={{ background: "rgba(16,185,129,0.2)", color: "#34D399", padding: "1px 5px", borderRadius: 4, fontSize: 10, fontFamily: "var(--font-mono)" }}>92</span>
            </div>
          </div>
          <div className="tsLogin-illuCard" style={{ top: 90, left: 120, animationDelay: "1.5s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon.Sparkles size={14} style={{ color: "#A855F7" }}/>
              <div style={{ flex: 1, fontSize: 11.5 }}>3 high-potential matches found</div>
            </div>
          </div>
          <div className="tsLogin-illuCard" style={{ top: 0, left: 240, animationDelay: "0.8s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Icon.Check size={12} stroke={3} style={{ color: "#34D399" }}/>
              <span style={{ fontSize: 11.5 }}>Interview scheduled</span>
            </div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.6)" }}>Tomorrow at 2:30 PM</div>
          </div>
        </div>
      </div>

      {/* Right — form */}
      <div className="tsLogin-right">
        <form className="tsLogin-form" onSubmit={submit}>
          <div className="tsLogin-formH">Sign in to your account</div>
          <div className="tsLogin-formSub">Welcome back — let's get hiring.</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ position: "relative" }}>
              <Input label="Email" value={email} onChange={e => { setEmail(e.target.value); if (errors.email) setErrors(er => ({ ...er, email: null })); }}
                icon={<Icon.Mail size={14}/>}
                placeholder="you@company.com"
                error={errors.email}
                type="email"/>
              {!errors.email && email.includes("@") && (
                <span className="tsLogin-success-icon" style={{ top: 38, transform: "none" }}><Icon.Check size={14} stroke={3}/></span>
              )}
            </div>

            <div>
              <Input label={
                <span style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                  <span>Password</span>
                  <a style={{ color: "var(--primary-3)", fontSize: 11.5, cursor: "pointer" }}>Forgot?</a>
                </span>
              }
                value={password} onChange={e => setPassword(e.target.value)}
                icon={<Icon.Lock size={14}/>}
                type={showPw ? "text" : "password"}
                error={errors.password}
                suffix={
                  <button type="button" onClick={() => setShowPw(s => !s)} style={{ color: "var(--muted)" }}>
                    {showPw ? <Icon.EyeOff size={14}/> : <Icon.Eye size={14}/>}
                  </button>
                }/>
              {apiError && (
                <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 4 }}>{apiError}</div>
              )}
            </div>

            <Checkbox checked={remember} onChange={setRemember} label="Remember me for 30 days"/>

            <Button variant="primary" size="lg" loading={loading} type="submit" style={{ width: "100%", justifyContent: "center" }}>Sign in</Button>
          </div>

          <div className="tsLogin-divider">OR CONTINUE WITH</div>

          <div className="tsLogin-social">
            <Button variant="secondary" size="md" icon={<Icon.Google size={16}/>} style={{ justifyContent: "center", width: "100%" }} onClick={() => router.push("/dashboard")}>Continue with Google</Button>
            <Button variant="secondary" size="md" icon={<Icon.Linkedin size={16}/>} style={{ justifyContent: "center", width: "100%" }} onClick={() => router.push("/dashboard")}>Continue with LinkedIn</Button>
          </div>

          <div className="tsLogin-foot">
            Don't have an account? <a onClick={() => router.push("/signup")} style={{ cursor: "pointer", color: "var(--primary-3)" }}>Sign up free</a>
            <div style={{ marginTop: 12, color: "var(--faint)", fontSize: 11 }}>
              By signing in you agree to our <a>Terms of Service</a> and <a>Privacy Policy</a>.
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}


export { Login as LoginForm };
export default Login;
