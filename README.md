# Engine - Agent Operations Platform

A production-ready platform for task discovery, job queue management, and secure sandbox execution for AI agents.

## Features

- **Task Discovery**: Semantic search over agent registry using vector embeddings
- **Job Queue**: Reliable, distributed job processing with priority, retries, and HITL support
- **Sandbox Execution**: Secure, isolated Python environments powered by E2B
- **Human-in-the-Loop**: Checkpoint/resume pattern for agent-human interaction
- **API Authentication**: Scoped API keys with rate limiting
- **Real-time Logs**: Stream job execution logs via Supabase Realtime

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Clients                                   │
│  (Claude Code, External Agents, Dashboard)                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS + API Key Auth
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Vercel (Serverless)                          │
│  - Next.js Frontend + API Routes                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Supabase
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Worker Pool (Railway/Fly.io)                  │
│  - Job claiming with FOR UPDATE SKIP LOCKED                     │
│  - E2B sandbox execution                                        │
│  - Graceful shutdown                                            │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# E2B Sandbox
E2B_API_KEY=

# OpenAI (for embeddings)
OPENAI_API_KEY=

# Rate Limiting (Upstash Redis)
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=
```

### 3. Set Up Database

Run the migration in `supabase/migrations/001_initial_schema.sql` against your Supabase project.

### 4. Create Storage Bucket

In Supabase dashboard, create a public bucket named `job-files`.

### 5. Run Development Server

```bash
npm run dev
```

### 6. Run Worker (separate terminal)

```bash
npm run worker:dev
```

## API Reference

### Jobs

```
POST   /api/v1/jobs              Create a new job
GET    /api/v1/jobs              List jobs
GET    /api/v1/jobs/:id          Get job details
GET    /api/v1/jobs/:id/logs     Get job logs
GET    /api/v1/jobs/:id/artifacts Get job artifacts
POST   /api/v1/jobs/:id/respond  Respond to HITL question
DELETE /api/v1/jobs/:id          Cancel job
```

### Agents

```
GET    /api/v1/agents            List agents
POST   /api/v1/agents            Register agent
POST   /api/v1/agents/discover   Discover agents for task
```

### Admin

```
POST   /api/v1/admin/keys        Create API key
GET    /api/v1/admin/keys        List API keys
DELETE /api/v1/admin/keys/:id    Revoke API key
GET    /api/v1/admin/workers     List workers
GET    /api/v1/admin/metrics     System metrics
```

## Example Usage

### Create a Job

```bash
curl -X POST https://your-domain.com/api/v1/jobs \
  -H "Authorization: Bearer engine_live_..." \
  -H "Content-Type: application/json" \
  -d '{"task": "Analyze the sentiment of customer reviews"}'
```

### Check Job Status

```bash
curl https://your-domain.com/api/v1/jobs/{job_id} \
  -H "Authorization: Bearer engine_live_..."
```

### Respond to HITL Question

```bash
curl -X POST https://your-domain.com/api/v1/jobs/{job_id}/respond \
  -H "Authorization: Bearer engine_live_..." \
  -H "Content-Type: application/json" \
  -d '{"answer": "Yes, proceed with the analysis"}'
```

## Deployment

### Vercel (API + Frontend)

```bash
vercel deploy
```

### Railway (Worker)

```bash
railway deploy
```

Or use the included `worker/Dockerfile`.

## License

MIT
