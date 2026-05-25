export const runtime = "edge"
import { Suspense } from "react";
import { JobDetail } from "@/components/(recruiter)/Jobs";

export default async function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return (
    <Suspense>
      <JobDetail jobId={jobId} />
    </Suspense>
  );
}
