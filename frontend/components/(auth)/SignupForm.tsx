"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Button, Input, Checkbox } from "@/components/ui";

/**
 * Signup form — stub. Replace the submit handler with your real signup endpoint.
 */
export function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [agree, setAgree] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@") || password.length < 6 || !agree) return;
    setLoading(true);
    // TODO: POST /auth/signup
    setTimeout(() => {
      setLoading(false);
      router.push("/dashboard");
    }, 700);
  };

  return (
    <form className="tsLogin-form" onSubmit={submit}>
      <div className="tsLogin-formH">Create your workspace</div>
      <div className="tsLogin-formSub">Start your 14-day trial — no credit card required.</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Input
          label="Work email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          icon={<Icon.Mail size={14} />}
          placeholder="you@company.com"
          type="email"
          required
        />
        <Input
          label="Company name"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          icon={<Icon.Building size={14} />}
          placeholder="Acme Inc."
          required
        />
        <Input
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          icon={<Icon.Lock size={14} />}
          type="password"
          placeholder="At least 8 characters"
          required
        />
        <Checkbox
          checked={agree}
          onChange={setAgree}
          label={
            <span className="small">
              I agree to the <a style={{ color: "var(--primary-3)" }}>Terms</a> and{" "}
              <a style={{ color: "var(--primary-3)" }}>Privacy Policy</a>.
            </span>
          }
        />

        <Button
          variant="primary"
          size="lg"
          loading={loading}
          type="submit"
          disabled={!agree}
          style={{ width: "100%", justifyContent: "center" }}
        >
          Create workspace
        </Button>
      </div>

      <div className="tsLogin-foot">
        Already have an account? <a onClick={() => router.push("/login")} style={{ cursor: "pointer", color: "var(--primary-3)" }}>Sign in</a>
      </div>
    </form>
  );
}
