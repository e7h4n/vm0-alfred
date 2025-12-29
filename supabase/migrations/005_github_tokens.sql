-- Table to store GitHub tokens for users
CREATE TABLE IF NOT EXISTS github_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  access_token TEXT NOT NULL,
  token_type TEXT DEFAULT 'bearer',
  scope TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_github_tokens_user_id ON github_tokens(user_id);

-- Enable RLS
ALTER TABLE github_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only view their own tokens
CREATE POLICY "Users can view own github tokens"
ON github_tokens FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can insert their own tokens
CREATE POLICY "Users can insert own github tokens"
ON github_tokens FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own tokens
CREATE POLICY "Users can update own github tokens"
ON github_tokens FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Users can delete their own tokens
CREATE POLICY "Users can delete own github tokens"
ON github_tokens FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Service role full access (for Edge Functions)
CREATE POLICY "Service role full access to github tokens"
ON github_tokens FOR ALL
TO service_role
USING (true);
