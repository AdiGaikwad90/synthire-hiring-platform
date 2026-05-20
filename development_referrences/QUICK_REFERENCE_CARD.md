# ⚡ QUICK REFERENCE CARD - COPY-PASTE READY

## 📂 Your 6 Essential Documents

```
1. MASTER_IMPLEMENTATION_GUIDE.md         ← START HERE (complete roadmap)
2. PRODUCTION_ENHANCEMENTS_QUICK_REFERENCE.md  ← What's new (5 min read)
3. FRONTEND_BACKEND_INTEGRATION_GUIDE.md  ← FE wiring (copy-paste code)
4. CLAUDE_CODE_BACKEND_PROMPT_WITH_QUESTIONS.md ← BE building prompt
5. PRODUCTION_READY_ENHANCED_BACKEND_ARCHITECTURE.md ← Technical details
6. AI_RESUME_PARSING_MATCHING_DETAILED_BACKEND_FLOW.md ← Background
```

---

## 🎯 YOUR 3-WEEK PLAN AT A GLANCE

### **WEEK 1: FRONTEND (5-8 hours)**
```
Day 1: Setup
  - Read: PRODUCTION_ENHANCEMENTS_QUICK_REFERENCE.md
  - Read: FRONTEND_BACKEND_INTEGRATION_GUIDE.md
  - Create: lib/api-client.ts
  - Setup: .env.local with API_URL

Day 2-3: Auth + Jobs
  - Wire: LoginForm.tsx → POST /api/auth/login
  - Wire: JobForm.tsx → POST /api/jobs
  - Wire: ResumeBatchModal.tsx → POST /api/candidates/upload/parse/score

Day 4-5: Candidates + Pipeline
  - Wire: Candidates.tsx → GET /api/candidates
  - Wire: CandidateDetail.tsx → GET /api/candidates/[id]
  - Wire: PipelineKanban.tsx → PATCH /api/candidates/[id]

Status: FE ready (APIs will 404 until BE is built)
```

### **WEEK 2: BACKEND (20-30 hours with Claude Code)**
```
Day 1: Setup
  - Read: CLAUDE_CODE_BACKEND_PROMPT_WITH_QUESTIONS.md
  - Answer: 10 clarifying questions
  - Setup: Cloudflare bindings (D1, R2, KV, Vectorize)

Day 2-5: Implementation with Claude Code
  Use: CLAUDE_CODE_BACKEND_PROMPT_WITH_QUESTIONS.md
  
  Phase 1: Core infrastructure
  Phase 2: Parsing (Mammoth, pdfjs, OpenDataLab)
  Phase 3: Embeddings (Nemotron)
  Phase 4: LLM scoring (Qwen → Gemma → GPT-5)
  Phase 5: Score aggregation
  Phase 6: API routes
  Phase 7: Testing

Status: Backend ready (all endpoints working)
```

### **WEEK 3: INTEGRATION & DEPLOY (10-15 hours)**
```
Day 1-2: Testing
  - Test each endpoint individually
  - Test full workflows
  - Load testing (batch upload)

Day 3: Integration
  - Connect FE to real BE endpoints
  - Test all workflows end-to-end

Day 4-5: Deployment
  - Deploy BE to Cloudflare
  - Deploy FE to Vercel/Pages
  - Setup monitoring
  - Go live!

Status: Production ready 🚀
```

---

## 📋 FILE WIRING CHECKLIST (Copy-Paste Ready)

### **Auth Routes**
```
Location: components/(auth)/LoginForm.tsx
Add:
const response = await fetch('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password }),
})
```

### **Job Creation**
```
Location: components/(recruiter)/JobForm.tsx
Add:
const response = await fetch('/api/jobs', {
  method: 'POST',
  body: JSON.stringify({
    title,
    description,
    scoring_weights: {
      skills_match: 40,
      experience_relevance: 30,
      education_fit: 20,
      achievements_impact: 10,
    },
  }),
})
```

### **Resume Upload**
```
Location: components/(recruiter)/ResumeBatchModal.tsx
Add:
// 1. Upload
const uploadRes = await fetch('/api/candidates/upload', {
  method: 'POST',
  body: formData, // multipart with file, jobId, userId
})

// 2. Parse
await fetch('/api/candidates/parse', {
  method: 'POST',
  body: JSON.stringify({ candidateId, jobId }),
})

// 3. Score
await fetch('/api/candidates/score', {
  method: 'POST',
  body: JSON.stringify({ candidateId, jobId }),
})
```

### **Candidate List**
```
Location: components/(recruiter)/Candidates.tsx
Add:
const response = await fetch(
  `/api/candidates?jobId=${jobId}&minScore=${minScore}`,
  { headers: { 'Authorization': `Bearer ${token}` } }
)
```

### **Candidate Detail**
```
Location: components/(recruiter)/CandidateDetail.tsx
Add:
const response = await fetch(`/api/candidates/${candidateId}`, {
  headers: { 'Authorization': `Bearer ${token}` }
})
```

### **Pipeline Drag-Drop**
```
Location: components/(recruiter)/PipelineKanban.tsx
Add:
const response = await fetch(`/api/candidates/${candidateId}`, {
  method: 'PATCH',
  body: JSON.stringify({ status: newStatus }),
})
```

### **Interviewer Portal**
```
Location: app/(interviewer)/interviewer/page.tsx
Add:
const response = await fetch('/api/interviews?interviewer=true', {
  headers: { 'Authorization': `Bearer ${token}` }
})
```

### **Interview Conduct**
```
Location: components/(interviewer)/InterviewConduct.tsx
Add:
const response = await fetch(`/api/interviews/${interviewId}/feedback`, {
  method: 'POST',
  body: JSON.stringify({
    scoring: { technical: 4, communication: 5, ... },
    notes: notes,
  }),
})
```

### **Analytics**
```
Location: components/(recruiter)/Analytics.tsx
Add:
const funnel = await fetch('/api/analytics/funnel')
const timeToHire = await fetch('/api/analytics/time-to-hire')
```

---

## 🔧 BACKEND QUICK SETUP

### **1. Install Dependencies**
```bash
cd backend
npm install
npm install -D @types/node @cloudflare/workers-types
```

### **2. Setup Environment**
```bash
cp .env.example .env
# Edit .env:
OPENROUTER_API_KEY=sk-or-v1-xxxxx
D1_DATABASE_ID=xxxxx
R2_BUCKET_NAME=talent-scout-resumes
JWT_SECRET=your-secret-key
```

### **3. Setup wrangler.toml**
```toml
name = "talent-scout-ai"
type = "service"
main = "src/index.ts"

[[d1_databases]]
binding = "DB"
database_name = "talent-scout"

[[kv_namespaces]]
binding = "CACHE"
preview = true

[[r2_buckets]]
binding = "R2"
bucket_name = "talent-scout-resumes"

[[vectorize]]
binding = "VECTORIZE"
index_name = "embeddings"
```

### **4. Database Schema**
```bash
# Create tables (run in D1 console)
npx wrangler d1 execute talent-scout --file schema.sql
```

### **5. Start Development**
```bash
npm run dev
# Backend running at http://localhost:8787
```

### **6. Deploy**
```bash
wrangler deploy
```

---

## 🚀 FRONTEND QUICK SETUP

### **1. Setup Environment**
```bash
cd frontend
cp .env.example .env.local
# Edit .env.local:
NEXT_PUBLIC_API_URL=http://localhost:3000
# or for prod:
NEXT_PUBLIC_API_URL=https://api.talentscout.com
```

### **2. Create API Client**
```bash
# Create: lib/api-client.ts
# (Copy code from FRONTEND_BACKEND_INTEGRATION_GUIDE.md)
```

### **3. Install Dependencies** (if not already done)
```bash
npm install
```

### **4. Start Development**
```bash
npm run dev
# Frontend running at http://localhost:3000
```

### **5. Deploy**
```bash
npm run build
vercel deploy
# or
npm run build && npx wrangler pages deploy out
```

---

## 🧪 TESTING QUICK CHECKLIST

### **Unit Tests**
```bash
# Create sample test resumes in test/fixtures/
# Test parsing with different formats:
  - test.docx
  - test-text.pdf
  - test-scanned.pdf
  - test.txt
```

### **Integration Tests**
```
Test endpoints:
  ✓ POST /api/auth/login → JWT token
  ✓ POST /api/auth/signup → New user
  ✓ POST /api/jobs → Job created
  ✓ POST /api/candidates/upload → File stored in R2
  ✓ POST /api/candidates/parse → Resume parsed
  ✓ POST /api/candidates/score → Score calculated
  ✓ GET /api/candidates → Filtered list
  ✓ GET /api/candidates/[id] → Full detail
  ✓ PATCH /api/candidates/[id] → Status updated
  ✓ POST /api/interviews → Interview scheduled
  ✓ POST /api/interviews/[id]/feedback → Feedback stored
```

### **Load Testing**
```bash
# Batch upload 10 resumes
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/candidates/upload \
    -F "file=@resume$i.pdf" \
    -F "jobId=job-123"
done

# Expected:
  - Each upload: 2-5 seconds
  - Each parsing: 2-5 seconds
  - Each scoring: 8-12 seconds
  - No failures
```

---

## 💰 COST TRACKING

### **Expected Monthly Costs (500 resumes)**

```
Parsing:         $1.00   (70% cache hits)
Embeddings:      $0.25   (Nemotron free tier)
LLM Scoring:     $5.00   (Mostly free, some paid)
─────────────────────────
TOTAL:          ~$6.25/month

vs Competitors:
- Workable:     $1000/month
- Lever:        $2000/month  
- Bamboo:       $3000/month

Your savings: 99.4% cheaper! 🎉
```

### **Monitor Costs**
```
Track:
  - OpenRouter API usage
  - Cloudflare Workers usage
  - D1 queries executed
  - KV cache hit rate
  - R2 storage usage
  - Vectorize storage usage
```

---

## 🔐 Security Checklist

```
Before deployment:
  ✓ JWT_SECRET is strong (32+ chars, random)
  ✓ CORS allows only your FE domain
  ✓ Rate limiting configured (OpenRouter handles)
  ✓ Input validation with Zod schemas
  ✓ No sensitive data in logs
  ✓ HTTPS enforced
  ✓ Database backups configured
  ✓ Secrets stored in .env (not in code)
```

---

## 📊 MONITORING SETUP

### **Logging**
```
Add to all routes:
  - Request start time
  - Request endpoint
  - User ID
  - Response time
  - Error messages

Example:
  [2025-05-20 10:30:45] POST /api/candidates/score
  User: user-123
  Duration: 8.5s
  Success: true
```

### **Metrics to Track**
```
  - API response times
  - Parse success rate
  - Score generation success rate
  - LLM fallback rate
  - Cache hit rate
  - Error rate
  - Monthly costs
```

---

## 🎯 FINAL DEPLOYMENT CHECKLIST

### **Before Going Live**
- [ ] All endpoints tested locally
- [ ] Load testing passed
- [ ] Error handling verified
- [ ] Logging configured
- [ ] Monitoring setup
- [ ] Database backups working
- [ ] Frontend deployed
- [ ] Backend deployed
- [ ] DNS configured
- [ ] SSL certificates valid
- [ ] Team documentation written
- [ ] Support team trained

### **Post-Deployment**
- [ ] Monitor logs for 24 hours
- [ ] Check error rates
- [ ] Verify cost metrics
- [ ] Test all workflows
- [ ] Get user feedback
- [ ] Fix any issues
- [ ] Optimize performance
- [ ] Plan v2 features

---

## 🆘 TROUBLESHOOTING QUICK GUIDE

### **FE not connecting to BE**
```
Check:
  1. NEXT_PUBLIC_API_URL in .env.local
  2. Backend is running (npm run dev / wrangler dev)
  3. CORS headers are set
  4. API routes exist
  Solution: Check browser console for actual error
```

### **Resume parsing fails**
```
Check:
  1. File format supported (DOCX, PDF, TXT)
  2. File size < 10MB
  3. OpenDataLab API key set (for scanned PDFs)
  Solution: Add console.log in parser, check error
```

### **LLM scoring fails**
```
Check:
  1. OPENROUTER_API_KEY is valid
  2. API rate limits not hit
  3. Token count not exceeded
  Solution: Check fallback chain, try secondary model
```

### **Database operations fail**
```
Check:
  1. D1 database created
  2. Tables exist (run migrations)
  3. Bindings set in wrangler.toml
  Solution: Check D1 console for actual errors
```

### **File upload fails**
```
Check:
  1. R2 bucket created
  2. Bucket name in env matches
  3. File permissions set
  Solution: Test R2 upload separately
```

---

## 📞 SUPPORT

If you get stuck:

1. **Check the full guide**: Look in PRODUCTION_READY_ENHANCED_BACKEND_ARCHITECTURE.md for that specific phase
2. **Review the code**: Copy exact code from FRONTEND_BACKEND_INTEGRATION_GUIDE.md
3. **Check your setup**: Verify all environment variables are set
4. **Test locally**: Use `wrangler dev` and browser dev tools
5. **Read error messages**: They're usually helpful!
6. **Ask Claude Code**: Use the backend prompt if you need help with backend implementation

---

## ✨ YOU'RE ALL SET!

```
Week 1: Frontend wiring        ← You have all the copy-paste code
Week 2: Backend implementation ← You have the detailed prompt
Week 3: Testing & deployment  ← You have the checklist

Total time: 35-50 hours
Result: Production-ready ATS
Cost: $6.25/month (vs $1000+)

Let's build! 🚀
```

---

_Everything you need is in the 6 documents._
_No questions left unanswered._
_Ready to ship._
