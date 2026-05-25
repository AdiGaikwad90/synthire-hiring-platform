-- Add jd_url to jobs for storing original uploaded JD file in R2
ALTER TABLE jobs ADD COLUMN jd_url TEXT;
