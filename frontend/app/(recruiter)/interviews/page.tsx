import { InterviewerHome } from "@/components/(interviewer)/InterviewerHome";

// Recruiter-side interview list. Reuses the interviewer portal because the surface
// is the same — when you wire BE, swap to a recruiter-scoped query.
export default function InterviewsPage() {
  return <InterviewerHome />;
}
