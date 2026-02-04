# Engine Platform - Setup Guide

Complete guide to deploy the Engine platform from scratch.

## Overview

| Service | Purpose | Cost |
|---------|---------|------|
| Supabase | Database, Storage, Realtime | Free tier available |
| Upstash Redis | Rate limiting | Free tier (10k requests/day) |
| E2B | Sandbox execution | Pay-per-use (~$0.10/hour) |
| OpenAI | Embeddings for discovery | Pay-per-use (~$0.0001/1k tokens) |
| Vercel | API & Frontend hosting | Free tier available |
| Railway | Worker process | $5/month + usage |

**Estimated monthly cost for light usage**: $5-20/month

---

## Step 1: Supabase Setup

### 1.1 Create Project

1. Go to [supabase.com](https://supabase.com) and sign up
2. Click **New Project**
3. Fill in:
   - **Name**: `engine`
   - **Database Password**: Generate a strong password (save it!)
   - **Region**: Choose closest to your users
4. Click **Create new project** and wait ~2 minutes

### 1.2 Get Connection Details

1. Go to **Settings** → **API**
2. Copy these values:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`

> ⚠️ **Never expose the service_role key in client-side code!**

### 1.3 Run Database Migration

1. Go to **SQL Editor** in Supabase dashboard
2. Click **New query**
3. Copy the entire contents of `supabase/migrations/001_initial_schema.sql`
4. Paste into the editor
5. Click **Run**

You should see "Success. No rows returned" - this is correct.

### 1.4 Verify Tables Created

Go to **Table Editor**. You should see:
- `api_keys`
- `agents`
- `job_queue`
- `job_logs`
- `job_artifacts`
- `workers`

### 1.5 Create Storage Bucket

1. Go to **Storage** in sidebar
2. Click **New bucket**
3. Configure:
   - **Name**: `job-files`
   - **Public bucket**: ✅ Enable
4. Click **Create bucket**

### 1.6 Enable Realtime (Optional)

For live log streaming:

1. Go to **Database** → **Replication**
2. Under **Supabase Realtime**, click **0 tables**
3. Enable for:
   - `job_logs`
   - `job_queue`

---

## Step 2: Upstash Redis Setup

### 2.1 Create Database

1. Go to [upstash.com](https://upstash.com) and sign up
2. Click **Create Database**
3. Configure:
   - **Name**: `engine-ratelimit`
   - **Type**: Regional
   - **Region**: Same as Supabase
4. Click **Create**

### 2.2 Get Credentials

1. In your database dashboard, find **REST API**
2. Copy:
   - **UPSTASH_REDIS_REST_URL** → `UPSTASH_REDIS_URL`
   - **UPSTASH_REDIS_REST_TOKEN** → `UPSTASH_REDIS_TOKEN`

---

## Step 3: E2B Setup

### 3.1 Get API Key

1. Go to [e2b.dev](https://e2b.dev) and sign up
2. Go to **Dashboard** → **API Keys**
3. Click **Create new key**
4. Copy the key → `E2B_API_KEY`

### 3.2 Billing (Important!)

E2B charges per sandbox-second. To avoid surprises:

1. Go to **Billing** → **Usage Limits**
2. Set a spending limit (e.g., $20/month)

---

## Step 4: OpenAI Setup

### 4.1 Get API Key

1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign up or log in
3. Go to **API Keys** → **Create new secret key**
4. Copy the key → `OPENAI_API_KEY`

### 4.2 Add Credits

1. Go to **Billing** → **Add payment method**
2. Add at least $5 in credits

---

## Step 5: Deploy to Vercel (API + Frontend)

### 5.1 Prepare Repository

```bash
# Initialize git if not already
cd /home/mootbing/code/engine
git init
git add .
git commit -m "Initial commit"

# Push to GitHub
gh repo create engine --private --source=. --push
```

### 5.2 Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign up with GitHub
2. Click **Add New** → **Project**
3. Import your `engine` repository
4. Configure:
   - **Framework Preset**: Next.js
   - **Root Directory**: `./`
5. Add **Environment Variables**:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key |
| `UPSTASH_REDIS_URL` | Your Upstash REST URL |
| `UPSTASH_REDIS_TOKEN` | Your Upstash REST token |
| `OPENAI_API_KEY` | Your OpenAI API key |
| `E2B_API_KEY` | Your E2B API key |

6. Click **Deploy**

### 5.3 Verify Deployment

Once deployed, visit:
- `https://your-app.vercel.app` - Landing page
- `https://your-app.vercel.app/api/v1/health` - Should return `{"status":"healthy"}`

---

## Step 6: Deploy Worker to Railway

The worker runs long-lived processes and cannot run on Vercel (serverless timeout limits).

### 6.1 Create Railway Project

1. Go to [railway.app](https://railway.app) and sign up with GitHub
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `engine` repository

### 6.2 Configure Service

1. Click on the created service
2. Go to **Settings** → **General**
3. Set:
   - **Root Directory**: `/`
   - **Start Command**: `npm run worker`

### 6.3 Add Environment Variables

Go to **Variables** and add:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key |
| `E2B_API_KEY` | Your E2B API key |
| `OPENAI_API_KEY` | Your OpenAI API key |
| `WORKER_CONCURRENCY` | `3` |
| `WORKER_POLL_INTERVAL_MS` | `1000` |
| `WORKER_HEARTBEAT_INTERVAL_MS` | `30000` |

### 6.4 Deploy

1. Click **Deploy**
2. Check **Logs** to verify worker starts:
   ```
   Worker starting: railway-xxxxx-12345
   Concurrency: 3
   Poll interval: 1000ms
   ```

### 6.5 Scale Workers (Optional)

To handle more jobs, add replicas:

1. Go to **Settings** → **Replicas**
2. Set **Replicas**: 2 or more

Each worker can process 3 concurrent jobs (configurable via `WORKER_CONCURRENCY`).

---

## Step 7: Create Admin API Key

### 7.1 Using Supabase SQL Editor

Run this SQL to create your first admin API key:

```sql
-- Generate a test admin key (ONLY FOR INITIAL SETUP!)
-- In production, use the API to create keys

INSERT INTO api_keys (
  key_prefix,
  key_hash,
  name,
  scopes,
  rate_limit_rpm
) VALUES (
  'engine_test_...',
  -- This is SHA-256 of 'engine_test_REPLACE_WITH_YOUR_SECRET_KEY_HERE'
  -- Generate your own: echo -n "engine_test_yoursecretkey" | sha256sum
  '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  'Admin Key',
  ARRAY['admin'],
  1000
);
```

**Better approach** - Generate a proper key:

```bash
# Generate a random key
KEY="engine_test_$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)"
echo "Your API key: $KEY"

# Generate its hash
HASH=$(echo -n "$KEY" | sha256sum | cut -d' ' -f1)
echo "Key hash: $HASH"
```

Then insert with the generated hash:

```sql
INSERT INTO api_keys (key_prefix, key_hash, name, scopes, rate_limit_rpm)
VALUES ('engine_test_...', 'YOUR_HASH_HERE', 'Admin Key', ARRAY['admin'], 1000);
```

### 7.2 Save Your Key

Store the API key securely - you cannot retrieve it later! Only the hash is stored.

---

## Step 8: Verify Everything Works

### 8.1 Test Health Endpoint

```bash
curl https://your-app.vercel.app/api/v1/health
```

Expected:
```json
{"status":"healthy","timestamp":"2024-...","version":"1.0.0"}
```

### 8.2 Test Authentication

```bash
curl https://your-app.vercel.app/api/v1/jobs \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Expected:
```json
{"jobs":[],"count":0,"offset":0,"limit":50}
```

### 8.3 Create a Test Job

```bash
curl -X POST https://your-app.vercel.app/api/v1/jobs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"task": "Hello world test"}'
```

Expected:
```json
{"id":"uuid-here","status":"queued","task":"Hello world test","created_at":"..."}
```

### 8.4 Check Worker Picked Up Job

```bash
curl https://your-app.vercel.app/api/v1/jobs/JOB_ID_HERE \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Watch the status change: `queued` → `running` → `completed`

### 8.5 Check Workers Dashboard

```bash
curl https://your-app.vercel.app/api/v1/admin/workers \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## Step 9: Register Your First Agent (Optional)

Agents are tools that the platform can discover based on task descriptions.

```bash
curl -X POST https://your-app.vercel.app/api/v1/agents \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sentiment Analyzer",
    "description": "Analyzes text sentiment and emotional tone. Useful for customer feedback, social media monitoring, and content analysis.",
    "package_name": "sentiment-analyzer",
    "version": "1.0.0"
  }'
```

Then verify the agent (as admin):

```sql
UPDATE agents SET verified = true, verified_at = NOW() WHERE package_name = 'sentiment-analyzer';
```

---

## Troubleshooting

### Worker not processing jobs

1. Check Railway logs for errors
2. Verify `SUPABASE_SERVICE_ROLE_KEY` is correct
3. Check worker is registered:
   ```sql
   SELECT * FROM workers;
   ```

### Rate limit errors

1. Check Upstash dashboard for usage
2. Verify Redis credentials are correct
3. Try resetting rate limit:
   ```bash
   # In Upstash console
   DEL ratelimit:YOUR_KEY_ID
   ```

### Agent discovery not working

1. Verify OpenAI API key has credits
2. Check agent is verified:
   ```sql
   SELECT * FROM agents WHERE verified = true;
   ```
3. Try lowering threshold:
   ```bash
   curl -X POST .../agents/discover \
     -d '{"task": "...", "threshold": 0.5}'
   ```

### Sandbox execution failing

1. Check E2B dashboard for errors
2. Verify E2B billing is set up
3. Check job logs:
   ```sql
   SELECT * FROM job_logs WHERE job_id = 'YOUR_JOB_ID' ORDER BY timestamp;
   ```

---

## Environment Variables Summary

### Vercel (API + Frontend)

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
UPSTASH_REDIS_URL=https://xxx.upstash.io
UPSTASH_REDIS_TOKEN=xxx
OPENAI_API_KEY=sk-...
E2B_API_KEY=e2b_...
```

### Railway (Worker)

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OPENAI_API_KEY=sk-...
E2B_API_KEY=e2b_...
WORKER_CONCURRENCY=3
WORKER_POLL_INTERVAL_MS=1000
WORKER_HEARTBEAT_INTERVAL_MS=30000
```

---

## Security Checklist

- [ ] Never commit `.env` files
- [ ] Use different API keys for dev/prod
- [ ] Set Supabase RLS policies for multi-tenant use
- [ ] Set spending limits on E2B and OpenAI
- [ ] Rotate API keys periodically
- [ ] Monitor rate limit usage
- [ ] Enable Supabase audit logs

---

## Next Steps

1. **Add more agents** - Register tools for your use cases
2. **Build client SDK** - Create a Python/JS client for easier integration
3. **Set up monitoring** - Add Datadog/Axiom for observability
4. **Configure alerts** - PagerDuty for worker failures
5. **Scale workers** - Add Railway replicas for more throughput
