-- Synthire — Initial D1 Schema
-- Apply locally: wrangler d1 migrations apply synthire-prod --local
-- Apply prod:    wrangler d1 migrations apply synthire-prod

PRAGMA journal_mode = WAL;

-- ── Companies ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  plan       TEXT NOT NULL DEFAULT 'free',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'recruiter',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_email      ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id);

-- ── Jobs ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  recruiter_id          TEXT NOT NULL REFERENCES users(id),
  title                 TEXT NOT NULL,
  description           TEXT,
  department            TEXT,
  location              TEXT,
  employment_type       TEXT NOT NULL DEFAULT 'full_time',
  experience_level      TEXT NOT NULL DEFAULT 'mid',
  salary_range          TEXT,
  status                TEXT NOT NULL DEFAULT 'active',
  scoring_weights       TEXT NOT NULL DEFAULT '{"skills":40,"experience":30,"education":20,"achievements":10}',
  required_skills       TEXT NOT NULL DEFAULT '[]',
  nice_to_have_skills   TEXT NOT NULL DEFAULT '[]',
  min_years_experience  INTEGER NOT NULL DEFAULT 0,
  education_requirement TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_jobs_company_id   ON jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status       ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_recruiter_id ON jobs(recruiter_id);

-- ── Candidates ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS candidates (
  id                      TEXT PRIMARY KEY,
  job_id                  TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  company_id              TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  email                   TEXT,
  phone                   TEXT,
  location                TEXT,
  resume_url              TEXT,
  parsed_resume           TEXT,
  technical_skills        TEXT NOT NULL DEFAULT '[]',
  professional_experience TEXT NOT NULL DEFAULT '[]',
  education_details       TEXT NOT NULL DEFAULT '[]',
  certifications          TEXT NOT NULL DEFAULT '[]',
  achievements            TEXT NOT NULL DEFAULT '[]',
  overall_score           INTEGER,
  semantic_score          INTEGER,
  skills_score            INTEGER,
  experience_score        INTEGER,
  education_score         INTEGER,
  achievements_score      INTEGER,
  ai_analysis             TEXT,
  status                  TEXT NOT NULL DEFAULT 'new',
  parsing_quality         INTEGER,
  model_used              TEXT,
  processing_status       TEXT NOT NULL DEFAULT 'pending',
  processing_error        TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_candidates_job_id     ON candidates(job_id);
CREATE INDEX IF NOT EXISTS idx_candidates_company_id ON candidates(company_id);
CREATE INDEX IF NOT EXISTS idx_candidates_status     ON candidates(status);
CREATE INDEX IF NOT EXISTS idx_candidates_score      ON candidates(overall_score);

-- ── Interview Types (per-company round configurator) ─────────────────────────
CREATE TABLE IF NOT EXISTS interview_types (
  id               TEXT PRIMARY KEY,
  company_id       TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  description      TEXT,
  required         INTEGER NOT NULL DEFAULT 1,
  position         INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_interview_types_company ON interview_types(company_id);

-- ── Interviews ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interviews (
  id                TEXT PRIMARY KEY,
  candidate_id      TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id            TEXT NOT NULL REFERENCES jobs(id),
  company_id        TEXT NOT NULL REFERENCES companies(id),
  interviewer_id    TEXT NOT NULL REFERENCES users(id),
  interview_type_id TEXT REFERENCES interview_types(id),
  scheduled_at      TEXT NOT NULL,
  duration_minutes  INTEGER NOT NULL DEFAULT 60,
  video_link        TEXT,
  meeting_notes     TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',
  email_sent_at     TEXT,
  reminder_sent_at  TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_interviews_candidate_id   ON interviews(candidate_id);
CREATE INDEX IF NOT EXISTS idx_interviews_interviewer_id ON interviews(interviewer_id);
CREATE INDEX IF NOT EXISTS idx_interviews_company_id     ON interviews(company_id);
CREATE INDEX IF NOT EXISTS idx_interviews_scheduled_at   ON interviews(scheduled_at);

-- ── Interview Feedback ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interview_feedback (
  id                    TEXT PRIMARY KEY,
  interview_id          TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  interviewer_id        TEXT NOT NULL REFERENCES users(id),
  technical_score       INTEGER,
  communication_score   INTEGER,
  problem_solving_score INTEGER,
  culture_score         INTEGER,
  strengths             TEXT,
  weaknesses            TEXT,
  notes                 TEXT,
  recommendation        TEXT NOT NULL,
  ai_summary            TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(interview_id, interviewer_id)
);
CREATE INDEX IF NOT EXISTS idx_feedback_interview_id ON interview_feedback(interview_id);

-- ── Email Logs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_logs (
  id                TEXT PRIMARY KEY,
  company_id        TEXT REFERENCES companies(id) ON DELETE SET NULL,
  recipient_email   TEXT NOT NULL,
  email_type        TEXT NOT NULL,
  resend_message_id TEXT,
  subject           TEXT,
  sent_at           TEXT,
  delivered_at      TEXT,
  bounced_at        TEXT,
  complained_at     TEXT,
  status            TEXT NOT NULL DEFAULT 'queued',
  error_message     TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_email_logs_company_id ON email_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_status     ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_type       ON email_logs(email_type);

-- ── Email Preferences ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_preferences (
  user_id                 TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  resume_notifications    INTEGER NOT NULL DEFAULT 1,
  interview_notifications INTEGER NOT NULL DEFAULT 1,
  feedback_notifications  INTEGER NOT NULL DEFAULT 1,
  reminder_notifications  INTEGER NOT NULL DEFAULT 1,
  unsubscribe_token       TEXT NOT NULL,
  unsubscribed_at         TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Email Queue ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_queue (
  id              TEXT PRIMARY KEY,
  recipient_email TEXT NOT NULL,
  email_type      TEXT NOT NULL,
  template_data   TEXT NOT NULL,
  scheduled_for   TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at         TEXT,
  failed_at       TEXT,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  max_retries     INTEGER NOT NULL DEFAULT 3,
  last_error      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_email_queue_pending    ON email_queue(scheduled_for, sent_at, failed_at);
CREATE INDEX IF NOT EXISTS idx_email_queue_unprocessed ON email_queue(retry_count, max_retries);
