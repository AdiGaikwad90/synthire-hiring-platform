export const runtime = "edge"
import { InterviewConduct } from "@/components/(interviewer)/InterviewConduct";

export default async function InterviewConductPage({ params }: { params: Promise<{ interviewId: string }> }) {
  const { interviewId } = await params;
  return <InterviewConduct interviewId={interviewId} />;
}
