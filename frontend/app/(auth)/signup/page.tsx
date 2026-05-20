import { AuthLayout } from "@/components/(auth)/AuthLayout";
import { SignupForm } from "@/components/(auth)/SignupForm";

export default function SignupPage() {
  return (
    <AuthLayout
      heading={
        <>
          Get started with <span className="ai-text">TalentScout</span>
        </>
      }
      subtitle="Create your workspace and start screening candidates in minutes."
    >
      <SignupForm />
    </AuthLayout>
  );
}
