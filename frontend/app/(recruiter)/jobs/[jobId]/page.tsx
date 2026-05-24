"use client";
import { JobDetail } from "@/components/(recruiter)/Jobs";

export default function JobDetailPage({ params }: { params: { jobId: string } }) {
  return <JobDetail jobId={params.jobId} />;
}
