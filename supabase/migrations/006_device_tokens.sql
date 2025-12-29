-- Table to store long-lived device tokens
CREATE TABLE IF NOT EXISTS device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  token TEXT NOT NULL UNIQUE,
  name TEXT, -- optional device name like "ESP32-Kitchen"
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for token lookups
CREATE INDEX IF NOT EXISTS idx_device_tokens_token ON device_tokens(token);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON device_tokens(user_id);

-- Enable RLS
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

-- Users can view their own tokens
CREATE POLICY "Users can view own device tokens"
ON device_tokens FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can insert their own tokens
CREATE POLICY "Users can insert own device tokens"
ON device_tokens FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own tokens
CREATE POLICY "Users can delete own device tokens"
ON device_tokens FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Service role full access
CREATE POLICY "Service role full access to device tokens"
ON device_tokens FOR ALL
TO service_role
USING (true);
