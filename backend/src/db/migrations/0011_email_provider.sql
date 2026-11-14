-- SYN-004: email now goes through Brevo, with a configurable fallback provider.

-- Which provider handled each attempt ('brevo' | 'resend'); NULL for rows
-- written before this migration and for emails no provider was asked to send.
ALTER TABLE email_logs ADD COLUMN provider TEXT;

-- How many times a queued email was put back an hour because every provider
-- was at its sending limit. Counted separately so a busy day delays an email
-- instead of using up its retries.
ALTER TABLE email_queue ADD COLUMN limit_deferrals INTEGER NOT NULL DEFAULT 0;
