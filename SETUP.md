# Engine Setup Guide

## Prerequisites

- Node.js 18+
- Supabase account
- E2B account
- OpenRouter account
- Vercel account (frontend)
- Railway account (worker)

## Step 1: Clone and Install

```bash
git clone <your-repo>
cd engine
npm install
```

## Step 2: Supabase Setup

### Create Project

1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Wait for it to be ready

### Run Database Migration

1. Go to SQL Editor in Supabase Dashboard
2. Copy contents of `supabase/migrations/001_full_schema.sql`
3. Run the SQL

This creates:
- `api_keys` - API key authentication
- `agents` - MCP server registry
- `job_queue` - Job queue with status tracking
- `job_logs` - Real-time execution logs
- `job_artifacts` - Output files
- `job_attachments` - Input files
- `workers` - Worker registry
- RPC functions for atomic job claiming

### Create Storage Bucket

1. Go to Storage in Supabase Dashboard
2. Click "New bucket"
3. Name: `job-files`
4. Check "Public bucket"
5. Create

### Get Credentials

From Project Settings > API:
- `NEXT_PUBLIC_SUPABASE_URL` - Project URL
- `SUPABASE_SERVICE_ROLE_KEY` - service_role key (keep secret!)

## Step 3: E2B Setup

1. Go to [e2b.dev](https://e2b.dev)
2. Create account
3. Get API key from dashboard
4. Save as `E2B_API_KEY`

## Step 4: OpenRouter Setup

1. Go to [openrouter.ai](https://openrouter.ai)
2. Create account
3. Add credits ($5-10 to start)
4. Generate API key
5. Save as `OPENROUTER_API_KEY`

## Step 5: Create .env File

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# E2B
E2B_API_KEY=e2b_...

# OpenRouter
OPENROUTER_API_KEY=sk-or-v1-...
```

## Step 6: Local Development

```bash
# Run everything (frontend + worker)
npm run dev:all

# Or separately:
npm run dev        # Port 3000 - Frontend + API
npm run worker:dev # Worker with hot reload
```

Visit http://localhost:3000/dashboard

### Create Your First API Key

1. Open Supabase SQL Editor
2. Run:
```sql
INSERT INTO api_keys (key_prefix, key_hash, name, scopes)
VALUES (
  'engine_live_test',
  encode(sha256('engine_live_test_your_secret_key'::bytea), 'hex'),
  'Test Key',
  ARRAY['jobs:read', 'jobs:write', 'admin']
);
```
3. Use `engine_live_test_your_secret_key` as your API key

## Step 7: Deploy to Vercel

### Via CLI

```bash
npm i -g vercel
vercel login
vercel --prod
```

### Via Dashboard

1. Go to [vercel.com](https://vercel.com)
2. Import Git repository
3. Add environment variables
4. Deploy

## Step 8: Deploy Worker to Railway

1. Go to [railway.app](https://railway.app)
2. New Project > Deploy from GitHub repo
3. Add environment variables (same as .env)
4. Create `railway.json` in repo:

```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm run worker",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

5. Deploy

### Verify Worker

Check Railway logs for:
```
Worker starting: hostname-pid
Concurrency: 3
Poll interval: 1000ms
```

## Troubleshooting

### "Missing required environment variable"
Ensure all env vars are set in both Vercel and Railway.

### "OpenRouter API error: 402"
Add credits to your OpenRouter account.

### "E2B sandbox error"
Verify E2B API key and that you have sandbox credits.

### Worker not processing jobs
1. Check Railway logs
2. Verify SUPABASE_SERVICE_ROLE_KEY is correct
3. Ensure worker has all required env vars

## Production Checklist

- [ ] All environment variables set in Vercel
- [ ] All environment variables set in Railway
- [ ] Database migration completed
- [ ] Storage bucket created (public)
- [ ] Admin API key created
- [ ] Worker deployed and healthy
- [ ] Test job submission and execution
