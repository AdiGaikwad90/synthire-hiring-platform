-- Per-skill verdicts from the scoring call.
--
-- Normalised rather than a JSON column on candidates so cross-candidate gap
-- analysis ("Kubernetes missing in 33 of 42 applicants") is one GROUP BY
-- instead of a scan that parses every candidate row.

CREATE TABLE IF NOT EXISTS candidate_skill_matches (
  id           TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id       TEXT NOT NULL REFERENCES jobs(id)       ON DELETE CASCADE,
  company_id   TEXT NOT NULL REFERENCES companies(id)  ON DELETE CASCADE,
  skill        TEXT NOT NULL,
  requirement  TEXT NOT NULL CHECK (requirement IN ('required', 'nice_to_have')),
  verdict      TEXT NOT NULL CHECK (verdict IN ('evidenced', 'claimed', 'transferable', 'missing')),
  evidence     TEXT,
  via_skill    TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- NOCASE: "Go" and "go" are one skill. A duplicate aborts the whole batch, so
-- replaceSkillMatches' delete-then-insert stays atomic.
CREATE UNIQUE INDEX IF NOT EXISTS idx_csm_candidate_skill ON candidate_skill_matches(candidate_id, skill COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_csm_job_verdict ON candidate_skill_matches(job_id, verdict);
CREATE INDEX IF NOT EXISTS idx_csm_company ON candidate_skill_matches(company_id);

-- Score attribution snapshot, written at score time (JSON TEXT — see
-- services/scoring/attribution.ts). A snapshot, not recomputed on read: if a
-- recruiter later edits the job's weights, an old candidate's breakdown must
-- still sum to the overall_score stored alongside it.
ALTER TABLE candidates ADD COLUMN score_attribution TEXT;
