"use client";
import * as React from "react";
import { Navigation } from "@/components/shared/Navigation";

export default function InterviewerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)" }}>
      <Navigation />
      {children}
    </div>
  );
}
