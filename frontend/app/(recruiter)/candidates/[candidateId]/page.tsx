export const runtime = "edge"
import { CandidateDetail } from "@/components/(recruiter)/CandidateDetail";

export default async function CandidateDetailPage({ params }: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await params;
  return <CandidateDetail candidateId={candidateId} />;
}
