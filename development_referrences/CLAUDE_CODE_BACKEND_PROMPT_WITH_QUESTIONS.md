# CLAUDE CODE PROMPT - BACKEND IMPLEMENTATION WITH PRODUCTION ARCHITECTURE

## COPY & PASTE THIS ENTIRE CONTENT INTO CLAUDE CODE

---

You are implementing the **TalentScout AI backend** - a production-grade resume screening ATS using Next.js 14, Cloudflare Workers, and advanced AI.

## BEFORE YOU START IMPLEMENTATION

**⚠️ IMPORTANT**: Use PLAN mode to review this entire spec first. Ask clarifying questions below BEFORE implementing. This ensures we're aligned on all decisions.

---

## CLARIFYING QUESTIONS (ANSWER THESE FIRST)

Before I start coding, please confirm or clarify:

### 1. **Database Choice**
- [ ] Confirm: Using Cloudflare D1 (SQLite) as primary database?
- [ ] Question: Do you have a D1 instance already created, or should I provide setup instructions?
- [ ] Question: Should I include migration scripts for schema creation?

### 2. **File Upload Strategy**
- [ ] Confirm: Using Cloudflare R2 for resume storage?
- [ ] Question: Do you have R2 bucket created? What bucket name?
- [ ] Question: Should I implement file size validation (max 10MB per resume)?

### 3. **Caching Strategy**
- [ ] Confirm: Using Cloudflare KV for caching (parsed resumes, scores, embeddings)?
- [ ] Question: Acceptable TTL: 30 days for parsing, 7 days for scores?
- [ ] Question: Should cache keys be hashed (SHA256)?

### 4. **AI Model Prioritization**
- [ ] Confirm: Primary model = Qwen3 Next 80B (free)?
- [ ] Confirm: Fallback chain: Qwen3 → Gemma 4 26B → GPT-5 Mini?
- [ ] Question: Retry logic = exponential backoff (2^n seconds)?
- [ ] Question: Max retries per model = 3?

### 5. **Embedding Model**
- [ ] Confirm: Using Nemotron embedding (nvidia/llama-nemotron)?
- [ ] Confirm: Storing embeddings in Cloudflare Vectorize?
- [ ] Question: Embedding dimension = auto (whatever model provides)?

### 6. **Authentication**
- [ ] Confirm: JWT-based auth (tokens stored in localStorage on FE)?
- [ ] Question: Token expiry = 30 minutes or different?
- [ ] Question: Should I implement refresh tokens?

### 7. **Error Handling**
- [ ] Confirm: All API responses should follow this format:
  ```json
  {
    "success": true/false,
    "data": {...} or null,
    "error": "error message" or null,
    "timestamp": ISO timestamp
  }
  ```
- [ ] Question: Log level = info/warn/error/debug?
- [ ] Question: Should errors be logged to console, file, or service?

### 8. **Rate Limiting**
- [ ] Confirm: No rate limiting on free tier (add in v2)?
- [ ] Question: OpenRouter has rate limits - should I implement request queuing?

### 9. **Testing**
- [ ] Question: Should I include test data/seeds in database setup?
- [ ] Question: Sample resumes for testing (mock PDFs)?

### 10. **Deployment**
- [ ] Confirm: Target = Cloudflare Workers + Pages?
- [ ] Confirm: Using wrangler.toml for configuration?
- [ ] Question: Should I provide deployment step-by-step guide?

---

## IMPLEMENTATION PLAN (After Q&A)

Once you answer the questions above, I will implement in this order:

### **PHASE 1: Core Infrastructure (Day 1)**
1. Database schema (D1) with all tables
2. Environment setup (wrangler.toml, .env)
3. Type definitions (TypeScript interfaces)
4. Error handling utilities

### **PHASE 2: Parsing & Parsing (Day 2)**
1. Hybrid resume parser (Mammoth, pdfjs, OpenDataLab)
2. Text normalization + section extraction
3. D1 storage for parsed resumes
4. KV caching for parsed data

### **PHASE 3: Embedding & Semantic Matching (Day 2-3)**
1. Nemotron embedding generation
2. Vectorize storage for embeddings
3. Similarity calculation (cosine, Euclidean)
4. KV caching for embeddings

### **PHASE 4: AI Scoring with Fallback (Day 3)**
1. Prompt engineering (deterministic, JSON mode)
2. Model fallback chain implementation
3. Retry logic with exponential backoff
4. KV caching for scores

### **PHASE 5: Score Aggregation (Day 4)**
1. Weighted score calculation
2. Component scoring (semantic, exact skills, LLM, experience)
3. Confidence calculation
4. Ranking explanation generation

### **PHASE 6: API Routes & Integration (Day 4-5)**
1. Auth routes (login, signup)
2. Resume upload route
3. Candidate CRUD routes
4. Job CRUD routes with custom weights
5. Interview scheduling
6. Feedback submission
7. Analytics routes

### **PHASE 7: Testing & Deployment (Day 5)**
1. Test each endpoint
2. Load testing (resume batch upload)
3. Error scenario testing
4. Deploy to Cloudflare

---

## SPECIFICATION DETAILS

### Architecture Overview

```
Next.js 14 (App Router)
    ↓
Cloudflare Workers Runtime
    ├─ D1 Database (SQLite)
    ├─ R2 Storage (PDFs)
    ├─ KV Cache (Parsing, Scoring, Embeddings)
    ├─ Vectorize (Embeddings DB)
    └─ OpenRouter API (Claude, Gemma, Qwen)
```

### Database Schema

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  name TEXT NOT NULL,
  role TEXT, -- recruiter | interviewer | admin
  created_at DATETIME
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  recruiter_id TEXT REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT, -- active | closed
  scoring_weights JSON, -- {skills: 40, experience: 30, education: 20, achievements: 10}
  required_skills JSON,
  nice_to_have_skills JSON,
  min_years_experience INT,
  education_requirement TEXT,
  created_at DATETIME
);

CREATE TABLE candidates (
  id TEXT PRIMARY KEY,
  job_id TEXT REFERENCES jobs(id),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  
  -- Parsed Resume (Enhanced)
  parsed_resume JSON,
  technical_skills JSON,
  professional_experience JSON,
  education_details JSON,
  certifications JSON,
  achievements JSON,
  languages JSON,
  open_source JSON,
  
  -- Scores (All Dimensions)
  overall_score INT,
  semantic_similarity_score INT,
  skill_match_score INT,
  skills_match_score INT,
  experience_relevance_score INT,
  education_fit_score INT,
  achievements_impact_score INT,
  certifications_score INT,
  
  -- AI Analysis
  ai_analysis JSON, -- {gaps, strengths, red_flags, green_flags, explanation, confidence}
  
  -- Metadata
  resume_url TEXT,
  parsing_quality INT,
  model_used TEXT,
  status TEXT, -- new | scoring | scored | shortlisted | rejected
  created_at DATETIME,
  updated_at DATETIME
);

CREATE TABLE interviews (
  id TEXT PRIMARY KEY,
  candidate_id TEXT REFERENCES candidates(id),
  job_id TEXT REFERENCES jobs(id),
  interviewer_id TEXT REFERENCES users(id),
  interview_type_id TEXT,
  scheduled_at DATETIME,
  duration_minutes INT,
  video_link TEXT,
  status TEXT, -- pending | in_progress | completed
  created_at DATETIME
);

CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  interview_id TEXT REFERENCES interviews(id),
  interviewer_id TEXT REFERENCES users(id),
  scoring JSON, -- {technical: 4, communication: 5, ...}
  strengths TEXT,
  weaknesses TEXT,
  notes TEXT,
  recommendation TEXT, -- strong_yes | yes | maybe | no | strong_no
  ai_summary TEXT,
  created_at DATETIME
);

CREATE TABLE interview_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  duration_minutes INT,
  interviewer_role TEXT,
  position INT,
  required BOOLEAN,
  description TEXT
);
```

### API Routes Required

```
Authentication:
- POST /api/auth/login
- POST /api/auth/signup
- POST /api/auth/logout

Resumes & Candidates:
- POST /api/candidates/upload (multipart form)
- POST /api/candidates/parse
- POST /api/candidates/score
- GET /api/candidates
- GET /api/candidates/[candidateId]
- PATCH /api/candidates/[candidateId] (update status)
- DELETE /api/candidates/[candidateId]

Jobs:
- POST /api/jobs
- GET /api/jobs
- GET /api/jobs/[jobId]
- PATCH /api/jobs/[jobId]
- DELETE /api/jobs/[jobId]

Interviews:
- POST /api/interviews
- GET /api/interviews
- GET /api/interviews/[interviewId]
- POST /api/interviews/[interviewId]/feedback
- PATCH /api/interviews/[interviewId]

Interview Types:
- POST /api/interview-types
- GET /api/interview-types
- PATCH /api/interview-types/[id]
- DELETE /api/interview-types/[id]

Analytics:
- GET /api/analytics/funnel
- GET /api/analytics/time-to-hire
- GET /api/analytics/sources
```

### Key Implementation Details

**Resume Parsing Flow**:
1. Detect file type (DOCX/PDF-text/PDF-scanned/TXT)
2. Extract text using appropriate parser
3. Normalize sections (contact, skills, experience, education, etc.)
4. Store structured JSON in D1
5. Cache in KV for 30 days

**Scoring Flow**:
1. Generate embeddings for resume + JD
2. Calculate semantic similarity (0-100)
3. Calculate exact skill match (0-100)
4. Call LLM with fallback chain
5. Aggregate: Semantic (40%) + Skills (30%) + LLM (20%) + Experience (10%)
6. Store all scores in D1
7. Cache in KV for 7 days

**Fallback Chain**:
```
Try Qwen3 (free)
  ├─ Retry 1 (if timeout/error)
  ├─ Retry 2 (exponential backoff)
  ├─ Retry 3 (exponential backoff)
  └─ Fail → Try Gemma
     ├─ Retry 1
     ├─ Retry 2
     ├─ Retry 3
     └─ Fail → Try GPT-5 Mini
        ├─ Retry 1
        ├─ Retry 2
        ├─ Retry 3
        └─ Return error
```

**Caching Strategy**:
- Parse cache key: `parsing:{sha256(resumeText)}`
- Score cache key: `score:{sha256(candidateId:jobId:weights)}`
- Embedding cache key: `embedding:{sha256(text)}`
- Cache invalidation: Manual via admin API

### Response Format (All Endpoints)

```typescript
interface APIResponse {
  success: boolean
  data?: any
  error?: string
  timestamp: string // ISO 8601
  request_id?: string // for debugging
}
```

### Error Handling

```typescript
// All errors should follow this format
{
  success: false,
  error: "Human-readable error message",
  timestamp: "2025-05-20T10:30:00Z",
  details: {
    code: "PARSING_FAILED", // Machine-readable code
    field?: "resume", // Which field caused error
    status: 400 // HTTP status
  }
}
```

### Environment Variables Required

```
OPENROUTER_API_KEY=sk-or-v1-xxxxx
D1_DATABASE_ID=xxxxx
R2_BUCKET_NAME=talent-scout-resumes
R2_DOMAIN=https://resumes.talentscout.com
OPENDATALAB_API_KEY=xxxxx (optional, for scanned PDFs)
JWT_SECRET=xxxxx
NODE_ENV=production|development
LOG_LEVEL=info|debug|warn|error
```

### Dependencies to Install

```
"dependencies": {
  "next": "^14.0.0",
  "react": "^18.2.0",
  "typescript": "^5.0.0",
  "mammoth": "^1.6.0",
  "pdfjs-dist": "^3.11.0",
  "pdf-parse": "^1.1.1",
  "axios": "^1.6.0",
  "jsonwebtoken": "^9.0.0",
  "bcryptjs": "^2.4.3",
  "drizzle-orm": "^0.28.0",
  "zod": "^3.22.0"
}
```

---

## IMPLEMENTATION STANDARDS

### Code Style
- Use TypeScript with strict mode
- No `any` types (use `unknown` or proper types)
- Functional components only
- Proper error handling with try-catch
- Add JSDoc comments for all functions

### Logging
- Log parsing milestones (detect type, extract text, normalize, cache hit/miss)
- Log LLM calls (model, input tokens, output tokens, latency, cost)
- Log cache operations (hit, miss, set, delete)
- Log errors with full context (endpoint, user_id, stack trace)

### Performance
- Parsing should complete in <5 seconds
- Scoring should complete in <10 seconds
- Embedding generation should complete in <2 seconds
- API responses should complete in <500ms (excluding AI calls)

### Security
- All endpoints require JWT auth (except /auth/*)
- Validate all inputs with Zod schemas
- Rate limit via OpenRouter (they handle it)
- No sensitive data in logs
- CORS allowed from FE domain only

---

## TESTING STRATEGY

### Unit Tests (Create test data)
1. Test parsing with sample resume (DOCX)
2. Test normalization with messy input
3. Test skill matching logic
4. Test scoring weight validation
5. Test cache hit/miss scenarios

### Integration Tests
1. Full upload → parse → score pipeline
2. Database CRUD operations
3. API response formats
4. Error scenarios (invalid file, parsing fails, LLM fails, etc.)

### Load Testing
1. Batch upload 10 resumes simultaneously
2. Score 100 candidates for 1 job
3. Concurrent requests to same endpoints

---

## NEXT STEPS AFTER IMPLEMENTATION

1. **Frontend Wiring**: Use guide in `/mnt/user-data/outputs/FRONTEND_BACKEND_INTEGRATION_GUIDE.md`
2. **Testing**: Run integration tests with sample resumes
3. **Optimization**: Profile and optimize slow endpoints
4. **Deployment**: Deploy to Cloudflare Workers
5. **Monitoring**: Setup logging and error tracking

---

## START HERE

1. **Review this prompt** and ensure you understand the scope
2. **Answer the 10 clarifying questions** above
3. **Use PLAN mode** to show me your implementation plan
4. **Ask any questions** about the architecture or requirements
5. **Once approved**, implement phase by phase

This is a comprehensive, production-ready system. Let's build it right! 🚀

---

**Are you ready to begin?** Please:
1. Answer the clarifying questions above
2. Review the architecture
3. Ask any questions BEFORE I start coding
4. Once confirmed, I'll implement each phase sequentially with testing

Let's go! 💪
