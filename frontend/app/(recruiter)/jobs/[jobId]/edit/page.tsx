export const runtime = "edge"
import { JobEditForm } from "@/components/(recruiter)/JobEditForm";

export default async function EditJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <JobEditForm jobId={jobId} />;
}
