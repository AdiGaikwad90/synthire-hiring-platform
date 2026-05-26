-- Normalize existing emails to lowercase
UPDATE users SET email = lower(email);

-- Re-create unique index with case-insensitive enforcement
DROP INDEX IF EXISTS idx_users_email;
CREATE UNIQUE INDEX idx_users_email ON users(lower(email));
