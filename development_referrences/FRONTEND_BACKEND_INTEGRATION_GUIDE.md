# FRONTEND-BACKEND INTEGRATION GUIDE

## Your FE Project Structure Reference

Based on your CLAUDE.md, here's exactly where to wire each backend endpoint:

```
app/
├── (auth)/
│   ├── login/page.tsx           ← Wire: POST /api/auth/login
│   └── signup/page.tsx          ← Wire: POST /api/auth/signup
├── (recruiter)/
│   ├── dashboard/page.tsx       ← Wire: GET /api/jobs, GET /api/candidates, GET /api/analytics
│   ├── jobs/
│   │   ├── page.tsx             ← Wire: GET /api/jobs (list)
│   │   ├── new/page.tsx         ← Wire: POST /api/jobs (create with weights)
│   │   └── [jobId]/page.tsx     ← Wire: GET /api/jobs/[jobId], GET /api/candidates?jobId=X
│   ├── candidates/
│   │   ├── page.tsx             ← Wire: GET /api/candidates, POST /api/candidates/upload
│   │   └── [candidateId]/page.tsx ← Wire: GET /api/candidates/[candidateId]
│   ├── pipeline/page.tsx        ← Wire: GET /api/candidates?status=*, PATCH /api/candidates/[id]
│   ├── interviews/page.tsx      ← Wire: GET /api/interviews, POST /api/interviews
│   ├── analytics/page.tsx       ← Wire: GET /api/analytics/funnel, GET /api/analytics/time-to-hire
│   └── settings/page.tsx        ← Wire: GET /api/interview-types, POST /api/interview-types
└── (interviewer)/
    ├── interviewer/page.tsx     ← Wire: GET /api/interviews?interviewer=true
    └── interviews/[interviewId]/page.tsx ← Wire: GET /api/interviews/[id], POST /api/interviews/[id]/feedback
```

---

## PART 1: DETAILED WIRING INSTRUCTIONS

### 1.1 AUTH SETUP

**File**: `app/(auth)/login/page.tsx`

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import LoginForm from '@/components/(auth)/LoginForm'

export default function LoginPage() {
  return <LoginForm />
}
```

**File**: `components/(auth)/LoginForm.tsx`

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'

export default function LoginForm() {
  const router = useRouter()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // ⭐ BACKEND WIRE: POST /api/auth/login
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        showToast({
          type: 'error',
          message: data.error || 'Login failed',
        })
        return
      }

      // ✅ Success: Store token and redirect
      localStorage.setItem('auth_token', data.token)
      showToast({
        type: 'success',
        message: 'Logged in successfully',
      })

      // Redirect based on role
      const redirectUrl = data.role === 'recruiter' ? '/dashboard' : '/interviewer'
      router.push(redirectUrl)

    } catch (error) {
      showToast({
        type: 'error',
        message: 'Network error. Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleLogin} className="space-y-4">
      <Input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <Input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Signing in...' : 'Sign In'}
      </Button>
    </form>
  )
}
```

---

### 1.2 JOB CREATION (with Scoring Weights)

**File**: `components/(recruiter)/JobForm.tsx`

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { useToast } from '@/components/ui/toast'

export default function JobForm() {
  const router = useRouter()
  const { showToast } = useToast()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)

  // Step 1: Basic info
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  // Step 3: Scoring weights
  const [weights, setWeights] = useState({
    skills_match: 40,
    experience_relevance: 30,
    education_fit: 20,
    achievements_impact: 10,
  })

  const handleWeightChange = (field: string, value: number) => {
    setWeights(prev => ({
      ...prev,
      [field]: value,
    }))
  }

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0)
  const isWeightValid = totalWeight === 100

  const handleSubmit = async () => {
    if (!isWeightValid) {
      showToast({
        type: 'error',
        message: `Weights must sum to 100%. Current: ${totalWeight}%`,
      })
      return
    }

    setLoading(true)

    try {
      // ⭐ BACKEND WIRE: POST /api/jobs
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          scoring_weights: weights,
          recruiter_id: localStorage.getItem('user_id'), // From login
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        showToast({
          type: 'error',
          message: data.error || 'Job creation failed',
        })
        return
      }

      showToast({
        type: 'success',
        message: 'Job created successfully',
      })

      // Redirect to job detail
      router.push(`/jobs/${data.jobId}`)

    } catch (error) {
      showToast({
        type: 'error',
        message: 'Network error. Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      {step === 1 && (
        <div className="space-y-4">
          <h2>Job Details</h2>
          <Input
            placeholder="Job Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            placeholder="Job Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full h-32"
          />
          <Button onClick={() => setStep(3)}>Continue to Weights</Button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          <h2>Configure Scoring Weights</h2>

          {/* Technical Skills */}
          <div className="space-y-2">
            <label>Technical Skills Match: {weights.skills_match}%</label>
            <Slider
              min={0}
              max={100}
              step={5}
              value={[weights.skills_match]}
              onChange={(val) => handleWeightChange('skills_match', val[0])}
            />
          </div>

          {/* Experience */}
          <div className="space-y-2">
            <label>Experience Relevance: {weights.experience_relevance}%</label>
            <Slider
              min={0}
              max={100}
              step={5}
              value={[weights.experience_relevance]}
              onChange={(val) => handleWeightChange('experience_relevance', val[0])}
            />
          </div>

          {/* Education */}
          <div className="space-y-2">
            <label>Education Fit: {weights.education_fit}%</label>
            <Slider
              min={0}
              max={100}
              step={5}
              value={[weights.education_fit]}
              onChange={(val) => handleWeightChange('education_fit', val[0])}
            />
          </div>

          {/* Achievements */}
          <div className="space-y-2">
            <label>Achievements & Impact: {weights.achievements_impact}%</label>
            <Slider
              min={0}
              max={100}
              step={5}
              value={[weights.achievements_impact]}
              onChange={(val) => handleWeightChange('achievements_impact', val[0])}
            />
          </div>

          {/* Total */}
          <div className={`text-lg font-bold ${isWeightValid ? 'text-green-600' : 'text-red-600'}`}>
            TOTAL: {totalWeight}% {isWeightValid ? '✓' : '⚠'}
          </div>

          <Button
            onClick={handleSubmit}
            disabled={loading || !isWeightValid}
            className="w-full"
          >
            {loading ? 'Creating job...' : 'Create Job'}
          </Button>
        </div>
      )}
    </div>
  )
}
```

---

### 1.3 RESUME UPLOAD & SCORING

**File**: `components/(recruiter)/ResumeBatchModal.tsx`

```typescript
'use client'

import { useState } from 'react'
import { useToast } from '@/components/ui/toast'

export default function ResumeBatchModal({ jobId, onClose }: {
  jobId: string
  onClose: () => void
}) {
  const { showToast } = useToast()
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<Record<string, number>>({})

  const handleUpload = async (filesToUpload: File[]) => {
    setUploading(true)

    for (const file of filesToUpload) {
      const fileKey = file.name
      setProgress(prev => ({ ...prev, [fileKey]: 0 }))

      try {
        // Step 1: Upload resume
        // ⭐ BACKEND WIRE: POST /api/candidates/upload
        const formData = new FormData()
        formData.append('file', file)
        formData.append('jobId', jobId)
        formData.append('userId', localStorage.getItem('user_id') || '')

        const uploadResponse = await fetch('/api/candidates/upload', {
          method: 'POST',
          body: formData,
        })

        const uploadData = await uploadResponse.json()

        if (!uploadResponse.ok) {
          showToast({
            type: 'error',
            message: `Upload failed for ${file.name}: ${uploadData.error}`,
          })
          continue
        }

        const candidateId = uploadData.candidateId
        setProgress(prev => ({ ...prev, [fileKey]: 33 }))

        // Step 2: Parse resume
        // ⭐ BACKEND WIRE: POST /api/candidates/parse
        const parseResponse = await fetch('/api/candidates/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidateId,
            jobId,
          }),
        })

        if (!parseResponse.ok) {
          showToast({
            type: 'error',
            message: `Parsing failed for ${file.name}`,
          })
          continue
        }

        setProgress(prev => ({ ...prev, [fileKey]: 66 }))

        // Step 3: Score candidate
        // ⭐ BACKEND WIRE: POST /api/candidates/score
        const scoreResponse = await fetch('/api/candidates/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidateId,
            jobId,
          }),
        })

        const scoreData = await scoreResponse.json()

        if (!scoreResponse.ok) {
          showToast({
            type: 'error',
            message: `Scoring failed for ${file.name}`,
          })
          continue
        }

        setProgress(prev => ({ ...prev, [fileKey]: 100 }))

        showToast({
          type: 'success',
          message: `✅ ${file.name} - Score: ${scoreData.final_score}%`,
        })

      } catch (error) {
        showToast({
          type: 'error',
          message: `Error processing ${file.name}: ${error.message}`,
        })
      }
    }

    setUploading(false)
    setProgress({})
    onClose() // Close modal after all uploads complete
  }

  return (
    <div className="space-y-4">
      <h2>Upload Resumes</h2>
      
      <input
        type="file"
        multiple
        accept=".pdf,.docx,.doc"
        onChange={(e) => {
          const fileList = e.currentTarget.files
          if (fileList) {
            const filesArray = Array.from(fileList)
            setFiles(filesArray)
          }
        }}
      />

      <div className="space-y-2">
        {files.map(file => (
          <div key={file.name} className="p-3 border rounded">
            <div className="flex justify-between">
              <span>{file.name}</span>
              <span className="text-sm">{progress[file.name] || 0}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div
                className="bg-blue-600 h-2 rounded-full"
                style={{ width: `${progress[file.name] || 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => handleUpload(files)}
        disabled={uploading || files.length === 0}
        className="w-full bg-blue-600 text-white py-2 rounded"
      >
        {uploading ? 'Processing...' : `Upload ${files.length} Resume(s)`}
      </button>
    </div>
  )
}
```

---

### 1.4 CANDIDATE LIST WITH FILTERING

**File**: `components/(recruiter)/Candidates.tsx`

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import CandidateCard from './CandidateCard'
import FilterPanel from './FilterPanel'

export default function Candidates() {
  const searchParams = useSearchParams()
  const jobId = searchParams.get('jobId') || ''

  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    minScore: 0,
    skills: [] as string[],
  })

  useEffect(() => {
    const fetchCandidates = async () => {
      setLoading(true)

      try {
        // ⭐ BACKEND WIRE: GET /api/candidates
        const params = new URLSearchParams()
        params.append('jobId', jobId)
        params.append('minScore', filters.minScore.toString())
        filters.skills.forEach(skill => params.append('skills', skill))

        const response = await fetch(`/api/candidates?${params.toString()}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          },
        })

        const data = await response.json()

        if (response.ok) {
          setCandidates(data)
        }

      } catch (error) {
        console.error('Failed to fetch candidates:', error)
      } finally {
        setLoading(false)
      }
    }

    if (jobId) {
      fetchCandidates()
    }
  }, [jobId, filters])

  return (
    <div className="grid grid-cols-12 gap-6 p-6">
      <aside className="col-span-3">
        <FilterPanel onFilterChange={setFilters} />
      </aside>

      <main className="col-span-9">
        {loading && <p>Loading candidates...</p>}

        <div className="grid grid-cols-3 gap-4">
          {candidates.map(candidate => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
            />
          ))}
        </div>
      </main>
    </div>
  )
}
```

---

### 1.5 CANDIDATE DETAIL VIEW

**File**: `app/(recruiter)/candidates/[candidateId]/page.tsx`

```typescript
'use client'

import { useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import CandidateDetail from '@/components/(recruiter)/CandidateDetail'

export default function CandidateDetailPage() {
  const params = useParams()
  const candidateId = params.candidateId as string
  const [candidate, setCandidate] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchCandidate = async () => {
      setLoading(true)

      try {
        // ⭐ BACKEND WIRE: GET /api/candidates/[candidateId]
        const response = await fetch(`/api/candidates/${candidateId}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          },
        })

        const data = await response.json()

        if (response.ok) {
          setCandidate(data)
        }

      } catch (error) {
        console.error('Failed to fetch candidate:', error)
      } finally {
        setLoading(false)
      }
    }

    if (candidateId) {
      fetchCandidate()
    }
  }, [candidateId])

  if (loading) return <p>Loading candidate...</p>

  return <CandidateDetail candidate={candidate} />
}
```

**File**: `components/(recruiter)/CandidateDetail.tsx`

```typescript
'use client'

import { useState } from 'react'
import { Tabs } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'

export default function CandidateDetail({ candidate }: any) {
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <div className="grid grid-cols-2 gap-6 p-6">
      {/* Left: Resume Preview */}
      <div className="border rounded p-4">
        <h3>Resume</h3>
        <iframe
          src={candidate.resume_url}
          className="w-full h-96"
          title="Resume"
        />
      </div>

      {/* Right: Analysis */}
      <div className="border rounded p-4">
        <h3 className="text-2xl font-bold">
          {candidate.overall_score}%
        </h3>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <button onClick={() => setActiveTab('overview')}>Overview</button>
          <button onClick={() => setActiveTab('breakdown')}>Breakdown</button>
          <button onClick={() => setActiveTab('analysis')}>AI Analysis</button>

          {activeTab === 'overview' && (
            <div className="space-y-4 mt-4">
              <div>
                <h4>Skills: {candidate.skills_match_score}%</h4>
                <div className="w-full bg-gray-200 rounded h-2">
                  <div
                    className="bg-blue-600 h-2 rounded"
                    style={{ width: `${candidate.skills_match_score}%` }}
                  />
                </div>
              </div>

              <div>
                <h4>Experience: {candidate.experience_relevance_score}%</h4>
                <div className="w-full bg-gray-200 rounded h-2">
                  <div
                    className="bg-blue-600 h-2 rounded"
                    style={{ width: `${candidate.experience_relevance_score}%` }}
                  />
                </div>
              </div>

              {/* Gaps */}
              <div className="border-t pt-4">
                <h5 className="font-bold text-red-600">Gaps</h5>
                <ul className="list-disc ml-5">
                  {candidate.ai_analysis?.gaps?.map((gap: string, i: number) => (
                    <li key={i} className="text-sm">{gap}</li>
                  ))}
                </ul>
              </div>

              {/* Strengths */}
              <div className="border-t pt-4">
                <h5 className="font-bold text-green-600">Strengths</h5>
                <ul className="list-disc ml-5">
                  {candidate.ai_analysis?.strengths?.map((strength: string, i: number) => (
                    <li key={i} className="text-sm">{strength}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'breakdown' && (
            <div className="mt-4">
              <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
                {JSON.stringify(candidate.parsed_resume, null, 2)}
              </pre>
            </div>
          )}

          {activeTab === 'analysis' && (
            <div className="mt-4">
              <p>{candidate.ai_analysis?.explanation}</p>
            </div>
          )}
        </Tabs>

        {/* Schedule Button */}
        <Button className="w-full mt-4">Schedule Interview</Button>
      </div>
    </div>
  )
}
```

---

### 1.6 PIPELINE (KANBAN)

**File**: `components/(recruiter)/PipelineKanban.tsx`

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useToast } from '@/components/ui/toast'

export default function PipelineKanban() {
  const { showToast } = useToast()
  const [candidates, setCandidates] = useState([])
  const [dragging, setDragging] = useState<any>(null)

  useEffect(() => {
    // ⭐ BACKEND WIRE: GET /api/candidates (with status)
    const fetchCandidates = async () => {
      const response = await fetch('/api/candidates?includeStatus=true', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        },
      })
      const data = await response.json()
      setCandidates(data)
    }

    fetchCandidates()
  }, [])

  const handleDragEnd = async (candidate: any, newStatus: string) => {
    if (candidate.status === newStatus) return

    try {
      // ⭐ BACKEND WIRE: PATCH /api/candidates/[id]
      const response = await fetch(`/api/candidates/${candidate.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({ status: newStatus }),
      })

      if (response.ok) {
        setCandidates(prev =>
          prev.map(c =>
            c.id === candidate.id ? { ...c, status: newStatus } : c
          )
        )
        showToast({
          type: 'success',
          message: `${candidate.name} moved to ${newStatus}`,
        })
      }

    } catch (error) {
      showToast({
        type: 'error',
        message: 'Failed to update candidate',
      })
    }
  }

  const statuses = ['new', 'shortlisted', 'scheduled', 'interviewed', 'hired', 'rejected']

  return (
    <div className="flex gap-4 p-6 overflow-x-auto">
      {statuses.map(status => (
        <div
          key={status}
          className="flex-shrink-0 w-80 bg-gray-100 rounded p-4"
          onDragOver={(e) => e.preventDefault()}
        >
          <h3 className="font-bold mb-4 capitalize">
            {status} ({candidates.filter(c => c.status === status).length})
          </h3>

          <div className="space-y-2">
            {candidates
              .filter(c => c.status === status)
              .map(candidate => (
                <div
                  key={candidate.id}
                  draggable
                  onDragStart={() => setDragging(candidate)}
                  onDragEnd={() => setDragging(null)}
                  onDrop={() => {
                    if (dragging) {
                      handleDragEnd(dragging, status)
                    }
                  }}
                  className="bg-white p-3 rounded border cursor-grab hover:shadow-md"
                >
                  <p className="font-semibold">{candidate.name}</p>
                  <p className="text-sm text-gray-600">{candidate.overall_score}%</p>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

---

### 1.7 INTERVIEWER PORTAL

**File**: `app/(interviewer)/interviewer/page.tsx`

```typescript
'use client'

import { useState, useEffect } from 'react'

export default function InterviewerPortal() {
  const [interviews, setInterviews] = useState([])
  const [pendingFeedback, setPendingFeedback] = useState([])

  useEffect(() => {
    const fetchInterviews = async () => {
      // ⭐ BACKEND WIRE: GET /api/interviews?interviewer=true
      const response = await fetch('/api/interviews?interviewer=true', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        },
      })

      const data = await response.json()
      setInterviews(data.upcoming || [])
      setPendingFeedback(data.pending || [])
    }

    fetchInterviews()
  }, [])

  return (
    <div className="p-6 space-y-6">
      <section>
        <h2 className="text-2xl font-bold mb-4">Today's Interviews</h2>
        {interviews.map(interview => (
          <div key={interview.id} className="border p-4 rounded mb-3">
            <p>{interview.candidate_name} - {interview.scheduled_at}</p>
            <button className="bg-blue-600 text-white px-4 py-2 rounded">
              Start Interview
            </button>
          </div>
        ))}
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-4">Pending Feedback</h2>
        {pendingFeedback.map(item => (
          <div key={item.id} className="border p-4 rounded mb-3">
            <p>{item.candidate_name}</p>
            <a href={`/interviews/${item.id}`} className="text-blue-600">
              Complete Feedback →
            </a>
          </div>
        ))}
      </section>
    </div>
  )
}
```

---

### 1.8 INTERVIEW CONDUCT & FEEDBACK

**File**: `app/(interviewer)/interviews/[interviewId]/page.tsx`

```typescript
'use client'

import { useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import InterviewConduct from '@/components/(interviewer)/InterviewConduct'

export default function InterviewPage() {
  const params = useParams()
  const interviewId = params.interviewId as string
  const [interview, setInterview] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchInterview = async () => {
      // ⭐ BACKEND WIRE: GET /api/interviews/[interviewId]
      const response = await fetch(`/api/interviews/${interviewId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        },
      })

      const data = await response.json()
      setInterview(data)
      setLoading(false)
    }

    fetchInterview()
  }, [interviewId])

  if (loading) return <p>Loading interview...</p>

  return <InterviewConduct interview={interview} />
}
```

**File**: `components/(interviewer)/InterviewConduct.tsx`

```typescript
'use client'

import { useState } from 'react'
import { Textarea } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

export default function InterviewConduct({ interview }: any) {
  const { showToast } = useToast()
  const [notes, setNotes] = useState('')
  const [scores, setScores] = useState({
    technical: 3,
    communication: 3,
    problem_solving: 3,
    culture_fit: 3,
  })
  const [showFeedback, setShowFeedback] = useState(false)

  const handleSubmitFeedback = async () => {
    try {
      // ⭐ BACKEND WIRE: POST /api/interviews/[id]/feedback
      const response = await fetch(
        `/api/interviews/${interview.id}/feedback`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          },
          body: JSON.stringify({
            interviewer_id: localStorage.getItem('user_id'),
            scoring: scores,
            notes: notes,
          }),
        }
      )

      if (response.ok) {
        showToast({
          type: 'success',
          message: 'Feedback submitted successfully',
        })
        // Redirect back
        window.location.href = '/interviewer'
      }

    } catch (error) {
      showToast({
        type: 'error',
        message: 'Failed to submit feedback',
      })
    }
  }

  return (
    <div className="grid grid-cols-2 gap-6 p-6">
      {/* Left: Resume & Questions */}
      <div className="space-y-4">
        <iframe
          src={interview.resume_url}
          className="w-full h-96"
          title="Resume"
        />
        <div className="border p-4 rounded">
          <h3>AI Suggested Questions</h3>
          <ul className="list-disc ml-5">
            {interview.ai_questions?.map((q: string, i: number) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right: Notes & Scoring */}
      <div className="space-y-4">
        <Textarea
          placeholder="Interview notes..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="h-64"
        />

        <div className="space-y-2">
          {Object.entries(scores).map(([key, value]) => (
            <div key={key}>
              <label className="capitalize">{key}: {value}/5</label>
              <input
                type="range"
                min="1"
                max="5"
                value={value}
                onChange={(e) =>
                  setScores(prev => ({
                    ...prev,
                    [key]: parseInt(e.target.value),
                  }))
                }
                className="w-full"
              />
            </div>
          ))}
        </div>

        <Button
          onClick={() => setShowFeedback(true)}
          className="w-full"
        >
          Complete Feedback
        </Button>

        {showFeedback && (
          <div className="border p-4 rounded space-y-2">
            <h3>Submit Feedback?</h3>
            <div className="flex gap-2">
              <Button
                onClick={handleSubmitFeedback}
                className="flex-1 bg-green-600"
              >
                Submit
              </Button>
              <Button
                onClick={() => setShowFeedback(false)}
                className="flex-1 bg-gray-600"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

---

### 1.9 ANALYTICS DASHBOARD

**File**: `components/(recruiter)/Analytics.tsx`

```typescript
'use client'

import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'

export default function Analytics() {
  const [analytics, setAnalytics] = useState(null)

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        // ⭐ BACKEND WIRE: GET /api/analytics/funnel
        const funnelRes = await fetch('/api/analytics/funnel', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          },
        })
        const funnelData = await funnelRes.json()

        // ⭐ BACKEND WIRE: GET /api/analytics/time-to-hire
        const timeRes = await fetch('/api/analytics/time-to-hire', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          },
        })
        const timeData = await timeRes.json()

        setAnalytics({
          funnel: funnelData,
          timeToHire: timeData,
        })

      } catch (error) {
        console.error('Failed to fetch analytics:', error)
      }
    }

    fetchAnalytics()
  }, [])

  if (!analytics) return <p>Loading analytics...</p>

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <div className="border p-4 rounded">
          <h3>Total Candidates</h3>
          <p className="text-3xl font-bold">{analytics.funnel.total}</p>
        </div>
        <div className="border p-4 rounded">
          <h3>Avg Time-to-Hire</h3>
          <p className="text-3xl font-bold">{analytics.timeToHire.average} days</p>
        </div>
      </div>

      <div className="border p-4 rounded">
        <h3>Time-to-Hire Trend</h3>
        <LineChart width={600} height={300} data={analytics.timeToHire.data}>
          <CartesianGrid />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="days" stroke="#8884d8" />
        </LineChart>
      </div>
    </div>
  )
}
```

---

## PART 2: REQUIRED HELPER UTILITIES

**File**: `lib/api-client.ts`

```typescript
// Centralized API client with auth header handling

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

export async function apiCall(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const token = localStorage.getItem('auth_token')

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  })

  if (!response.ok && response.status === 401) {
    // Token expired
    localStorage.removeItem('auth_token')
    window.location.href = '/login'
  }

  return response.json()
}

export async function post(endpoint: string, body: any) {
  return apiCall(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function get(endpoint: string) {
  return apiCall(endpoint, { method: 'GET' })
}

export async function patch(endpoint: string, body: any) {
  return apiCall(endpoint, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}
```

**Usage**:
```typescript
import { post, get } from '@/lib/api-client'

// Instead of fetch, use:
const data = await post('/api/candidates/score', { candidateId, jobId })
const candidates = await get('/api/candidates?jobId=123')
```

---

## PART 3: ENVIRONMENT SETUP

**File**: `.env.local`

```bash
# Backend URL
NEXT_PUBLIC_API_URL=http://localhost:3000
# or for production:
# NEXT_PUBLIC_API_URL=https://api.talentscout.com

# Auth
NEXT_PUBLIC_AUTH_SECRET=your-jwt-secret
```

---

## WIRING CHECKLIST

- [ ] **Auth**: Login/signup endpoints wired
- [ ] **Jobs**: Create job with custom weights
- [ ] **Resume Upload**: Upload → Parse → Score pipeline
- [ ] **Candidate List**: Filtering + fetching
- [ ] **Candidate Detail**: View parsed resume + scores
- [ ] **Pipeline**: Drag-drop status updates
- [ ] **Interviews**: Recruiter scheduling
- [ ] **Interview Conduct**: Interviewer panel
- [ ] **Feedback**: Submit feedback to backend
- [ ] **Analytics**: Fetch and display
- [ ] **Settings**: Interview types CRUD

---

This is your **complete wiring map**! 🎯
