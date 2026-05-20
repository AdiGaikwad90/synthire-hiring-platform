// Mock data for TalentScout AI.
// Replace each export with API calls when wiring backend.

import type { Job, Candidate, InterviewRound, TeamMember, ActivityItem, FunnelStage } from "./types";

// Rich, plausible mock data for TalentScout AI

const initials = (name) => name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();

const avatarColor = (name) => {
  const colors = ["#6366F1","#EC4899","#10B981","#F59E0B","#06B6D4","#8B5CF6","#F43F5E","#3B82F6","#84CC16","#F97316"];
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return colors[Math.abs(h) % colors.length];
};

const JOBS = [
  { id: "j1", title: "Senior Software Engineer", department: "Engineering", location: "Remote · US", status: "active", posted: "May 15, 2026", applicants: 247, shortlisted: 31, interviewing: 12, hired: 0, type: "Full-time", level: "Senior", salary: "$160-210k" },
  { id: "j2", title: "Staff Product Designer", department: "Design", location: "San Francisco, CA", status: "active", posted: "May 8, 2026", applicants: 134, shortlisted: 18, interviewing: 6, hired: 1, type: "Full-time", level: "Staff", salary: "$180-230k" },
  { id: "j3", title: "ML Engineer, Foundations", department: "Engineering", location: "New York, NY", status: "active", posted: "May 1, 2026", applicants: 412, shortlisted: 22, interviewing: 8, hired: 0, type: "Full-time", level: "Senior", salary: "$200-260k" },
  { id: "j4", title: "Engineering Manager, Platform", department: "Engineering", location: "Remote · US/EU", status: "active", posted: "Apr 22, 2026", applicants: 89, shortlisted: 14, interviewing: 5, hired: 0, type: "Full-time", level: "Manager", salary: "$220-280k" },
  { id: "j5", title: "Developer Advocate", department: "Marketing", location: "Remote · Global", status: "active", posted: "Apr 18, 2026", applicants: 156, shortlisted: 12, interviewing: 3, hired: 0, type: "Full-time", level: "Mid", salary: "$130-170k" },
  { id: "j6", title: "Customer Success Manager", department: "Sales", location: "Austin, TX", status: "paused", posted: "Apr 3, 2026", applicants: 78, shortlisted: 8, interviewing: 0, hired: 0, type: "Full-time", level: "Mid", salary: "$90-120k" },
];

const COMPANIES = ["Stripe","Vercel","Linear","Notion","Figma","Anthropic","OpenAI","Datadog","Snowflake","Coinbase","Plaid","Ramp","Brex","Retool","Airtable","HashiCorp","Cloudflare","MongoDB","Discord","Twilio"];

// Skills banks
const SKILLS = {
  langs: ["TypeScript","Python","Go","Rust","Java","Ruby","Swift","Kotlin","C++","Elixir"],
  fw: ["React","Next.js","Node.js","Django","FastAPI","Spring","Rails","Vue","Svelte","React Native"],
  cloud: ["AWS","GCP","Azure","Kubernetes","Docker","Terraform","Pulumi"],
  data: ["Postgres","Redis","DynamoDB","Kafka","Snowflake","Spark","BigQuery"],
  ai: ["PyTorch","TensorFlow","Transformers","LangChain","Pinecone","RAG","Fine-tuning"],
};

const NAMES = [
  "Priya Sharma","Marcus Chen","Sofia Rodriguez","Daniel Park","Aisha Patel",
  "James Okonkwo","Maya Ivanova","Liam Walsh","Yuki Tanaka","Olivia Bennett",
  "Rohan Mehta","Camila Restrepo","Elias Berg","Noor Hassan","Felix Schneider",
  "Ines Moreau","Kenji Watanabe","Zara Ahmed","Theo Andersen","Naomi Goldberg",
  "Diego Vargas","Anika Singh","Jonas Lindqvist","Adwoa Owusu","Ravi Krishnan",
  "Mei Lin","Tomás Silva","Hannah Klein","Vikram Iyer","Layla Khoury",
];

const ROLES_PAST = [
  "Senior Engineer at Stripe","Tech Lead at Vercel","Staff Engineer at Datadog",
  "Senior Engineer at Linear","Principal Engineer at Plaid","Engineering Manager at Ramp",
  "Senior Designer at Figma","Staff Designer at Notion","Product Designer at Brex",
  "ML Engineer at Anthropic","Research Engineer at OpenAI","Senior ML at Snowflake",
];

function mkCandidate(i, jobId = "j1") {
  const name = NAMES[i % NAMES.length];
  const company = COMPANIES[i % COMPANIES.length];
  const role = ROLES_PAST[i % ROLES_PAST.length];
  const score = 92 - (i * 3) % 45;
  const skills = [
    ...SKILLS.langs.slice(i % 5, (i % 5) + 2),
    ...SKILLS.fw.slice(i % 4, (i % 4) + 2),
    ...SKILLS.cloud.slice(i % 3, (i % 3) + 1),
  ];
  const years = 3 + (i % 9);
  const skillsScore = Math.min(98, score + ((i % 7) - 3));
  const expScore = Math.min(98, score + ((i % 5) - 2));
  const eduScore = Math.min(98, score + ((i % 9) - 4) + 3);
  const achScore = Math.max(40, score - 8 + ((i % 6) - 3));
  const stages = ["new","new","new","shortlisted","shortlisted","scheduled","inprogress","feedback","hired","rejected"];
  const stage = stages[i % stages.length];

  return {
    id: `c${i+1}`,
    jobId,
    name,
    title: role,
    currentCompany: company,
    location: ["Remote","San Francisco","New York","London","Berlin","Toronto","Austin","Seattle"][i % 8],
    email: name.toLowerCase().replace(/\s/g, ".") + "@email.com",
    score,
    skills,
    skillsScore, expScore, eduScore, achScore,
    years,
    stage,
    avatar: avatarColor(name),
    initials: initials(name),
    education: [
      { school: ["MIT","Stanford","Carnegie Mellon","UC Berkeley","Georgia Tech","Cornell","University of Waterloo","ETH Zurich"][i % 8], degree: "B.S. Computer Science", year: 2024 - years - 4 },
      ...(i % 3 === 0 ? [{ school: ["Stanford","MIT","CMU","Cornell"][i % 4], degree: "M.S. Machine Learning", year: 2024 - years - 2 }] : []),
    ],
    experience: [
      { company, role: role.split(" at ")[0], from: 2024 - Math.floor(years/2), to: "Present", desc: "Scaled core platform from 1M to 50M daily requests. Led migration to event-driven architecture.", stack: skills.slice(0,3) },
      { company: COMPANIES[(i+5) % COMPANIES.length], role: "Software Engineer", from: 2024 - years, to: 2024 - Math.floor(years/2), desc: "Built customer-facing APIs handling $200M+ annual transaction volume.", stack: skills.slice(1,4) },
    ],
    strengths: [
      `${years}+ years relevant experience (required: 3+)`,
      `Led team of ${3 + i % 8} at ${company}`,
      `AWS Solutions Architect Professional (2024)`,
      `Open source: ${1500 + i * 137} GitHub stars`,
    ].slice(0, 3 + i % 2),
    concerns: i % 3 === 0 ? [
      "Missing: Kubernetes (nice-to-have)",
      "No direct leadership experience (preferred)",
    ] : i % 4 === 1 ? [
      "6-month employment gap (2024-2025)",
      "Limited startup experience",
    ] : i % 2 === 0 ? ["Missing: Rust experience (nice-to-have)"] : [],
    appliedDays: 1 + i % 14,
    rating: 3 + (i % 3),
  };
}

const CANDIDATES = Array.from({ length: 24 }, (_, i) => mkCandidate(i, "j1"));

const INTERVIEW_ROUNDS = [
  { id: "r1", num: 1, name: "Screening Round", duration: 30, interviewer: "Recruiter", purpose: "Initial fit assessment, role overview, compensation alignment", required: true },
  { id: "r2", num: 2, name: "Technical Round", duration: 60, interviewer: "Senior Engineer", purpose: "Live coding, system design fundamentals, technical depth", required: true },
  { id: "r3", num: 3, name: "Culture Fit Round", duration: 45, interviewer: "Team Lead", purpose: "Collaboration style, values alignment, behavioral", required: false },
  { id: "r4", num: 4, name: "CEO Round", duration: 30, interviewer: "CEO", purpose: "Final approval, vision alignment, mission fit", required: false },
];

const TEAM = [
  { id: "u1", name: "Sarah Chen", role: "Recruiter", trained: ["Screening"], avatar: avatarColor("Sarah Chen"), initials: "SC" },
  { id: "u2", name: "John Smith", role: "Senior Engineer", trained: ["Technical"], avatar: avatarColor("John Smith"), initials: "JS" },
  { id: "u3", name: "Lisa Wang", role: "Team Lead", trained: ["Culture","Technical"], avatar: avatarColor("Lisa Wang"), initials: "LW" },
  { id: "u4", name: "Mike Johnson", role: "CEO", trained: ["Final"], avatar: avatarColor("Mike Johnson"), initials: "MJ" },
  { id: "u5", name: "Anita Desai", role: "Engineering Manager", trained: ["Technical","Culture"], avatar: avatarColor("Anita Desai"), initials: "AD" },
];

const ACTIVITY = [
  { id: "a1", who: "Sarah Chen", action: "screened 15 new candidates", target: "Senior Software Engineer", time: "2 hours ago", type: "screen" },
  { id: "a2", who: "John Smith", action: "completed technical interview", target: "Priya Sharma", time: "3 hours ago", type: "interview" },
  { id: "a3", who: "AI", action: "flagged 3 high-potential candidates", target: "Staff Product Designer", time: "5 hours ago", type: "ai" },
  { id: "a4", who: "Lisa Wang", action: "moved 4 candidates to Culture Fit", target: "ML Engineer", time: "6 hours ago", type: "move" },
  { id: "a5", who: "Mike Johnson", action: "made an offer to", target: "Marcus Chen", time: "Yesterday", type: "offer" },
  { id: "a6", who: "Sarah Chen", action: "rejected 8 candidates", target: "Customer Success Manager", time: "Yesterday", type: "reject" },
];

const FUNNEL = [
  { stage: "Applied", count: 1247, color: "#60A5FA" },
  { stage: "Screened", count: 386, color: "#818CF8" },
  { stage: "Phone Screen", count: 124, color: "#A78BFA" },
  { stage: "Technical", count: 58, color: "#C084FC" },
  { stage: "Onsite", count: 22, color: "#E879F9" },
  { stage: "Offer", count: 11, color: "#F472B6" },
  { stage: "Hired", count: 8, color: "#10B981" },
];

const TIME_TRENDS = [
  { month: "Dec", days: 34 },
  { month: "Jan", days: 32 },
  { month: "Feb", days: 31 },
  { month: "Mar", days: 30 },
  { month: "Apr", days: 28 },
  { month: "May", days: 26 },
];

const SOURCES = [
  { name: "LinkedIn", value: 40, color: "#6366F1" },
  { name: "Company Site", value: 25, color: "#3B82F6" },
  { name: "Referrals", value: 20, color: "#10B981" },
  { name: "Job Boards", value: 15, color: "#F59E0B" },
];

const ROUND_PERF = [
  { name: "Screening", rate: 95 },
  { name: "Technical", rate: 87 },
  { name: "Culture Fit", rate: 92 },
  { name: "CEO Round", rate: 78 },
];

const TODAY_INTERVIEWS = [
  { id: "i1", candidate: CANDIDATES[0], time: "2:00 PM - 2:30 PM", inMin: 45, round: "Screening Round", status: "scheduled" },
  { id: "i2", candidate: CANDIDATES[3], time: "3:30 PM - 4:30 PM", inMin: 135, round: "Technical Round", status: "scheduled" },
  { id: "i3", candidate: CANDIDATES[7], time: "5:00 PM - 5:45 PM", inMin: 225, round: "Culture Fit", status: "scheduled" },
];



export {
  JOBS,
  CANDIDATES,
  INTERVIEW_ROUNDS,
  TEAM,
  ACTIVITY,
  FUNNEL,
  TIME_TRENDS,
  SOURCES,
  ROUND_PERF,
  TODAY_INTERVIEWS,
  NAMES,
  SKILLS,
};

// Re-export domain types for convenience
export type { Job, Candidate, InterviewRound, TeamMember, ActivityItem, FunnelStage };
