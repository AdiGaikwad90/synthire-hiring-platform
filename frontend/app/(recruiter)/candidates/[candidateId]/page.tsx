import { CandidateDetail } from "@/components/(recruiter)/CandidateDetail";

export default function CandidateDetailPage({ params }: { params: { candidateId: string } }) {
  return <CandidateDetail candidateId={params.candidateId} />;
}
