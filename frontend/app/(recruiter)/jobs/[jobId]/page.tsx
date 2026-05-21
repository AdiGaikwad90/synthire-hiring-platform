import { Candidates } from "@/components/(recruiter)/Candidates";

// Job detail = the candidate list scoped to a job.
// Route: /jobs/[jobId] — the jobId param is read inside Candidates via useParams when wired.
export default function JobDetailPage({ params }: { params: { jobId: string } }) {
  return <Candidates jobId={params.jobId} />;
}
