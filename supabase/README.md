# Supabase Setup

## 1. Database Setup

Run the SQL migrations in Supabase SQL Editor:

```bash
# 1. Create recordings table
supabase/migrations/001_create_recordings.sql

# 2. Create storage bucket
supabase/migrations/002_create_storage_bucket.sql
```

## 2. Deploy Edge Function

```bash
# Install Supabase CLI if not installed
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref dskmralypjipsbduefve

# Set secrets for the Edge Function
supabase secrets set UPLOAD_API_KEY=YOUR_API_KEY

# Deploy the function
supabase functions deploy upload-recording
```

## 3. API Usage

### Upload Recording

**Endpoint:** `POST https://dskmralypjipsbduefve.supabase.co/functions/v1/upload-recording`

**Headers:**
- `x-api-key`: Your UPLOAD_API_KEY
- `Content-Type`: `multipart/form-data` or `audio/mpeg`

**Request (multipart/form-data):**
```bash
curl -X POST \
  'https://dskmralypjipsbduefve.supabase.co/functions/v1/upload-recording' \
  -H 'x-api-key: YOUR_API_KEY' \
  -F 'file=@recording.mp3'
```

**Request (raw binary):**
```bash
curl -X POST \
  'https://dskmralypjipsbduefve.supabase.co/functions/v1/upload-recording' \
  -H 'x-api-key: YOUR_API_KEY' \
  -H 'Content-Type: audio/mpeg' \
  --data-binary @recording.mp3
```

**Response:**
```json
{
  "success": true,
  "recording": {
    "id": "uuid",
    "file_path": "user/1234567890_recording.mp3",
    "status": "pending",
    "created_at": "2025-12-28T10:00:00Z"
  }
}
```

## Environment Variables

### GitHub (for Alfred agent)

| Variable | Type | Description |
|----------|------|-------------|
| SUPABASE_URL | var | Supabase project URL |
| SUPABASE_PUBLISHABLE_KEY | var | Public anon key |
| SUPABASE_SECRET_KEY | secret | Service role key |

### Supabase Edge Function

| Variable | Description |
|----------|-------------|
| UPLOAD_API_KEY | API key for upload endpoint (set via `supabase secrets set`) |

### Device (单片机)

| Variable | Description |
|----------|-------------|
| UPLOAD_API_KEY | Same key, stored on device for uploading recordings |
