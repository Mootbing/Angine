# Engine Setup Guide

Complete setup instructions for deploying the Engine platform.

## Prerequisites

- Node.js 18+
- npm or pnpm
- Supabase account
- E2B account
- OpenRouter account
- OpenAI account (for embeddings)
- Upstash account (optional, for rate limiting)
- Vercel account (for deployment)
- Railway account (for worker deployment)

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
- `api_keys` - Authentication
- `agents` - Tool registry with vector embeddings
- `job_queue` - Jobs with status tracking
- `job_logs` - Real-time execution logs
- `job_artifacts` - Output files
- `job_attachments` - Input files
- `workers` - Worker registry
- RPC functions for job claiming and tool discovery
- 8 built-in tools

### Create Storage Bucket

1. Go to Storage in Supabase Dashboard
2. Click "New bucket"
3. Name: `job-files`
4. Check "Public bucket"
5. Create

### Get Credentials

From Project Settings > API:
- `NEXT_PUBLIC_SUPABASE_URL` - Project URL
- `SUPABASE_SERVICE_ROLE_KEY` - service_role key (secret)

## Step 3: E2B Setup

1. Go to [e2b.dev](https://e2b.dev)
2. Create account and get API key
3. Save as `E2B_API_KEY`

## Step 4: OpenRouter Setup

1. Go to [openrouter.ai](https://openrouter.ai)
2. Create account
3. Add credits ($5-10 recommended to start)
4. Generate API key
5. Save as `OPENROUTER_API_KEY`

## Step 5: OpenAI Setup (Embeddings)

1. Go to [platform.openai.com](https://platform.openai.com)
2. Create API key
3. Save as `OPENAI_API_KEY`

Note: Only used for generating embeddings with text-embedding-3-small

## Step 6: Upstash Setup (Optional)

For rate limiting:

1. Go to [upstash.com](https://upstash.com)
2. Create Redis database
3. Get REST URL and token
4. Save as `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

## Step 7: Create .env File

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# E2B
E2B_API_KEY=e2b_...

# OpenRouter
OPENROUTER_API_KEY=sk-or-v1-...

# OpenAI (embeddings)
OPENAI_API_KEY=sk-...

# Upstash (optional)
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx
```

## Step 8: Local Development

```bash
# Run everything
npm run dev:all

# Or separately:
npm run dev        # Port 3000 - Frontend + API
npm run worker:dev # Worker with hot reload
```

Visit `http://localhost:3000/dashboard` and enter your API key.

## Step 9: Deploy to Vercel

### Via CLI

```bash
npm i -g vercel
vercel login
vercel --prod
```

### Via Dashboard

1. Go to [vercel.com](https://vercel.com)
2. Import Git repository
3. Add environment variables (all from .env)
4. Deploy

### Important Vercel Settings

- Framework: Next.js (auto-detected)
- Build Command: `npm run build`
- Output Directory: `.next`

## Step 10: Deploy Worker to Railway

### Via Dashboard

1. Go to [railway.app](https://railway.app)
2. New Project > Deploy from GitHub repo
3. Add environment variables (same as .env)
4. Add `railway.json` to repo root:

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

### "Failed to claim job"

Check Supabase connection and that migrations ran successfully.

### "E2B sandbox error"

Verify E2B API key and that you have sandbox credits.

### Worker not processing jobs

1. Check Railway logs for errors
2. Verify SUPABASE_SERVICE_ROLE_KEY is correct (full JWT)
3. Ensure worker has all required env vars

### Tool discovery returning empty

The built-in tools need embeddings. They are generated when tasks are submitted.

## Production Checklist

- [ ] All environment variables set in Vercel
- [ ] All environment variables set in Railway
- [ ] Database migration completed
- [ ] Storage bucket created (public)
- [ ] Admin API key created
- [ ] Worker deployed and healthy
- [ ] Test job submission and execution

## Scaling

### Multiple Workers

Deploy multiple Railway instances - job claiming is atomic with `FOR UPDATE SKIP LOCKED`.

### Rate Limiting

Configure Upstash for production rate limiting. Adjust `rate_limit_rpm` per API key.

### Monitoring

- Supabase Dashboard: Database metrics
- Railway: Worker logs and metrics
- Vercel: API metrics and logs
