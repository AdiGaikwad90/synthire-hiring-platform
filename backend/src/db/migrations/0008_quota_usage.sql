-- Daily quota counters for Cloudflare free-tier guardrails.
--
-- One row per UTC day. Counters live in D1 rather than KV on purpose: the KV
-- free tier allows only 1,000 writes/day, so a KV-backed counter would spend
-- the very quota it is meant to protect (one write to count one write).
-- D1 allows 100,000 writes/day, so a single upsert per request is affordable.

CREATE TABLE IF NOT EXISTS quota_usage (
  day             TEXT PRIMARY KEY,   -- 'YYYY-MM-DD' (UTC)
  d1_rows_read    INTEGER NOT NULL DEFAULT 0,
  d1_rows_written INTEGER NOT NULL DEFAULT 0,
  kv_reads        INTEGER NOT NULL DEFAULT 0,
  kv_writes       INTEGER NOT NULL DEFAULT 0,
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_quota_usage_day ON quota_usage(day);
