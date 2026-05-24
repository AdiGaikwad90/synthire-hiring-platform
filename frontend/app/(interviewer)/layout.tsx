"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Navigation } from "@/components/shared/Navigation";
import { useAuth } from "@/context/AuthContext";

export default function InterviewerLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (!isLoading && user && user.role === 'recruiter') {
      router.replace('/dashboard');
    }
  }, [user, isLoading]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)" }}>
      <Navigation />
      {children}
    </div>
  );
}
