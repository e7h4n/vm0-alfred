-- Add github_repo column to github_tokens table
ALTER TABLE github_tokens ADD COLUMN IF NOT EXISTS github_repo TEXT;

-- Example: "owner/repo" format like "e7h4n/vm0-alfred"
