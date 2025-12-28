-- Create storage bucket for recordings
-- Note: This should be run via Supabase Dashboard or API
-- Storage buckets cannot be created via SQL migration

-- Option 1: Via Supabase Dashboard
-- 1. Go to Storage in Supabase Dashboard
-- 2. Create a new bucket named "recordings"
-- 3. Set it as public (for easy access) or private (for authenticated access)

-- Option 2: Via Supabase API (run this in your app or CLI)
-- curl -X POST 'https://<project-ref>.supabase.co/storage/v1/bucket' \
--   -H 'Authorization: Bearer <service-role-key>' \
--   -H 'Content-Type: application/json' \
--   -d '{"id": "recordings", "name": "recordings", "public": true}'

-- Storage policies (run these in SQL Editor after bucket creation)

-- Allow public read access to recordings bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('recordings', 'recordings', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: Allow authenticated uploads
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'recordings');

-- Policy: Allow public read
CREATE POLICY "Allow public read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'recordings');

-- Policy: Allow service role full access
CREATE POLICY "Allow service role full access"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'recordings');
