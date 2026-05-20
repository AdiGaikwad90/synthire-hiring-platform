import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { TweaksPanel } from "@/components/shared/TweaksPanel";

export const metadata: Metadata = {
  title: "Synthire — Applicant Tracking",
  description: "AI-powered ATS for high-volume hiring",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" data-density="comfortable">
      <body>
        <Providers>
          {children}
          <TweaksPanel />
        </Providers>
      </body>
    </html>
  );
}
