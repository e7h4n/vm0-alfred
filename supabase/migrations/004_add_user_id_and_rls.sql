-- Add user_id column to recordings table
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Create index for user queries
CREATE INDEX IF NOT EXISTS idx_recordings_user_id ON recordings(user_id);

-- Enable Row Level Security
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own recordings
CREATE POLICY "Users can view own recordings"
ON recordings FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Policy: Users can insert their own recordings
CREATE POLICY "Users can insert own recordings"
ON recordings FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own recordings
CREATE POLICY "Users can update own recordings"
ON recordings FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Policy: Service role can do everything (for Edge Functions)
CREATE POLICY "Service role full access"
ON recordings FOR ALL
TO service_role
USING (true);
