-- Make interviewer_id nullable to allow scheduling with external/uninvited interviewers.
-- SQLite doesn't support DROP CONSTRAINT, so we recreate the table.

PRAGMA foreign_keys = OFF;

CREATE TABLE interviews_new (
  id                    TEXT PRIMARY KEY,
  candidate_id          TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id                TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  company_id            TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  interviewer_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  interviewer_email     TEXT,
  interview_type_id     TEXT REFERENCES interview_types(id) ON DELETE SET NULL,
  status                TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_at          TEXT NOT NULL,
  duration_minutes      INTEGER NOT NULL DEFAULT 60,
  video_link            TEXT,
  meeting_notes         TEXT,
  email_sent_at         TEXT,
  reminder_sent_at      TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO interviews_new
  SELECT id, candidate_id, job_id, company_id, interviewer_id, NULL, interview_type_id,
         status, scheduled_at, duration_minutes, video_link, meeting_notes,
         email_sent_at, reminder_sent_at, created_at
  FROM interviews;

DROP TABLE interviews;
ALTER TABLE interviews_new RENAME TO interviews;

CREATE INDEX IF NOT EXISTS idx_interviews_candidate_id   ON interviews(candidate_id);
CREATE INDEX IF NOT EXISTS idx_interviews_interviewer_id ON interviews(interviewer_id);
CREATE INDEX IF NOT EXISTS idx_interviews_company_id     ON interviews(company_id);

PRAGMA foreign_keys = ON;
