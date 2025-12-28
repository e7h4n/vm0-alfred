# Supabase Setup

## Automatic Deployment (CI/CD)

Supabase migrations and Edge Functions are automatically deployed when pushing to `main` branch (changes in `supabase/` directory).

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| SUPABASE_ACCESS_TOKEN | Personal access token from [Supabase Dashboard](https://supabase.com/dashboard/account/tokens) |
| SUPABASE_DB_PASSWORD | Database password |

### Required GitHub Variables

| Variable | Description |
|----------|-------------|
| SUPABASE_PROJECT_REF | Project reference ID (e.g., `dskmralypjipsbduefve`) |

### Supabase Edge Function Secrets

Set these via `supabase secrets set`:

| Secret | Description |
|--------|-------------|
| UPLOAD_API_KEY | API key for ESP32 upload endpoint |
| GITHUB_TOKEN | GitHub PAT for triggering workflows |

## Manual Setup

### 1. Database Setup

Run the SQL migrations in Supabase SQL Editor:

```bash
# 1. Create recordings table
supabase/migrations/001_create_recordings.sql

# 2. Create storage bucket
supabase/migrations/002_create_storage_bucket.sql

# 3. Add played field
supabase/migrations/003_add_played_field.sql
```

### 2. Deploy Edge Functions

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link project
supabase link --project-ref dskmralypjipsbduefve

# Set secrets
supabase secrets set UPLOAD_API_KEY=your_key
supabase secrets set GITHUB_TOKEN=your_github_pat

# Deploy all functions
supabase functions deploy
```

## Environment Variables

### GitHub (for Alfred agent)

| Variable | Type | Description |
|----------|------|-------------|
| SUPABASE_URL | var | Supabase project URL |
| SUPABASE_PUBLISHABLE_KEY | var | Public anon key |
| SUPABASE_PROJECT_REF | var | Project reference ID |
| SUPABASE_SECRET_KEY | secret | Service role key |
| SUPABASE_ACCESS_TOKEN | secret | Personal access token |
| SUPABASE_DB_PASSWORD | secret | Database password |

### Supabase Edge Function Secrets

| Variable | Description |
|----------|-------------|
| UPLOAD_API_KEY | API key for upload endpoint |
| GITHUB_TOKEN | GitHub PAT for triggering workflows |

### Device (ESP32)

| Variable | Description |
|----------|-------------|
| UPLOAD_API_KEY | Same key, stored on device for uploading recordings |
