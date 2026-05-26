-- Add claimed_at column to email_queue for atomic dequeue tracking
ALTER TABLE email_queue ADD COLUMN claimed_at INTEGER;

-- Add status column to email_queue for explicit state tracking
ALTER TABLE email_queue ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
