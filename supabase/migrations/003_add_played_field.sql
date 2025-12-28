-- Add played field to recordings table
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS played BOOLEAN DEFAULT FALSE;

-- Create index for unplayed AI recordings query
CREATE INDEX IF NOT EXISTS idx_recordings_unplayed_ai
ON recordings(sender, played, created_at)
WHERE sender = 'ai' AND played = FALSE;
