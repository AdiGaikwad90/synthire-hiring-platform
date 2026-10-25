-- The IANA timezone an interview was scheduled in (e.g. America/Los_Angeles),
-- so its emails show the time the recruiter picked rather than UTC (SYN-002).
-- NULL for interviews created before this migration; those render in UTC.
ALTER TABLE interviews ADD COLUMN timezone TEXT;
