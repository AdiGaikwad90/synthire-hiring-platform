// Domain types — replace `any` with real backend types as you wire endpoints.

export type Stage =
  | "new"
  | "shortlisted"
  | "scheduled"
  | "inprogress"
  | "feedback"
  | "hired"
  | "rejected";

export type JobStatus = "active" | "paused" | "closed";

export interface Job {
  id: string;
  title: string;
  department: string;
  location: string;
  status: JobStatus;
  posted: string;
  applicants: number;
  shortlisted: number;
  interviewing: number;
  hired: number;
  type: string;
  level: string;
  salary: string;
}

export interface Education {
  school: string;
  degree: string;
  year: number;
}

export interface Experience {
  company: string;
  role: string;
  from: number;
  to: string | number;
  desc: string;
  stack: string[];
}

export interface Candidate {
  id: string;
  jobId: string;
  name: string;
  title: string;
  currentCompany: string;
  location: string;
  email: string;
  score: number;
  skills: string[];
  skillsScore: number;
  expScore: number;
  eduScore: number;
  achScore: number;
  years: number;
  stage: Stage;
  avatar: string;
  initials: string;
  education: Education[];
  experience: Experience[];
  strengths: string[];
  concerns: string[];
  appliedDays: number;
  rating: number;
}

export interface InterviewRound {
  id: string;
  num: number;
  name: string;
  duration: number;
  interviewer: string;
  purpose: string;
  required: boolean;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  trained: string[];
  avatar: string;
  initials: string;
}

export interface ActivityItem {
  id: string;
  who: string;
  action: string;
  target?: string;
  time: string;
  type: "screen" | "interview" | "ai" | "move" | "offer" | "reject" | "neutral";
}

export interface FunnelStage {
  stage: string;
  count: number;
  color: string;
}

export type Recommendation = "strongYes" | "yes" | "maybe" | "no" | "strongNo";

export interface Feedback {
  candidateId: string;
  interviewerId: string;
  round: string;
  scores: { tech: number; comm: number; problem: number; culture: number };
  strengths: string;
  gaps: string;
  impact: string;
  recommendation: Recommendation;
  submittedAt: string;
}
