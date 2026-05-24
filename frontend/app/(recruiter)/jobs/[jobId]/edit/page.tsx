"use client";
import { JobEditForm } from "@/components/(recruiter)/JobEditForm";

export default function EditJobPage({ params }: { params: { jobId: string } }) {
  return <JobEditForm jobId={params.jobId} />;
}
