# Engine - Agent Operations Platform

A production-ready platform for AI agent task execution with multi-model LLM support, vector-based tool discovery, and secure sandbox execution.

## Features

- **Multi-Model Support**: Switch between Claude, GPT-4, Gemini, DeepSeek, and Llama models via OpenRouter
- **Tool Marketplace**: Vector similarity search discovers relevant tools/agents for each task
- **Secure Sandbox**: Isolated Python environments powered by E2B with automatic package installation
- **Human-in-the-Loop**: Checkpoint/resume pattern for agent-human interaction
- **File Attachments**: Upload files from the dashboard to be used in agent tasks
- **Real-time Logs**: Stream job execution logs via Supabase Realtime
- **Modern Dashboard**: Built with shadcn/ui and Tailwind CSS

## Tech Stack

- **Frontend**: Next.js 14, shadcn/ui, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL + pgvector)
- **Worker**: Node.js with E2B sandbox
- **LLM**: OpenRouter (multi-model)
- **Embeddings**: OpenAI text-embedding-3-small
- **Rate Limiting**: Upstash Redis

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Dashboard & API Clients                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS + API Key Auth
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js (Vercel)                              │
│  - Dashboard UI (shadcn/ui)                                      │
│  - REST API Routes                                               │
│  - File Upload to Supabase Storage                               │
└─────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            │                 │                 │
            ▼                 ▼                 ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │   Supabase   │  │   Upstash    │  │  OpenRouter  │
    │  PostgreSQL  │  │    Redis     │  │   + OpenAI   │
    │  + pgvector  │  │ Rate Limit   │  │  Embeddings  │
    └──────────────┘  └──────────────┘  └──────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Worker Pool (Railway)                          │
│  - Job claiming with FOR UPDATE SKIP LOCKED                      │
│  - Tool discovery via vector similarity                          │
│  - LLM code generation                                           │
│  - E2B sandbox execution                                         │
│  - Artifact collection                                           │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create a `.env` file:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# E2B Sandbox
E2B_API_KEY=your_e2b_api_key

# OpenRouter (multi-model LLM)
OPENROUTER_API_KEY=your_openrouter_api_key

# OpenAI (for embeddings only)
OPENAI_API_KEY=your_openai_api_key

# Upstash Redis (rate limiting)
UPSTASH_REDIS_REST_URL=your_upstash_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_token
```

### 3. Set Up Database

Run the migration against your Supabase project:

```bash
# Copy supabase/migrations/001_full_schema.sql to Supabase SQL Editor and execute
```

This creates all tables, functions, and seeds 8 built-in tools.

### 4. Create Storage Bucket

In Supabase Dashboard:
1. Go to Storage
2. Create a new bucket named `job-files`
3. Set it to **public**

### 5. Run Development

```bash
# Run both Next.js and Worker
npm run dev:all

# Or run separately:
npm run dev        # Frontend + API
npm run worker:dev # Worker (separate terminal)
```

## Supported Models

| Model | Provider |
|-------|----------|
| Claude Sonnet 4 | Anthropic |
| Claude 3.5 Sonnet | Anthropic |
| GPT-4o | OpenAI |
| GPT-4o Mini | OpenAI |
| Gemini 2.0 Flash | Google |
| DeepSeek Chat | DeepSeek |
| Llama 3.3 70B | Meta |

## Built-in Tools

The platform comes with 8 pre-registered, verified tools:

- **Web Scraper** - requests, beautifulsoup4
- **Data Analyzer** - pandas, numpy
- **Chart Generator** - matplotlib, seaborn
- **Image Processor** - pillow
- **Math & Statistics** - numpy, scipy
- **File Handler** - csv, json
- **API Client** - requests
- **Text Processor** - re, collections

Tools are discovered automatically via vector similarity search.

## API Reference

### Jobs

```
POST   /api/v1/jobs              Create job (with optional attachments)
GET    /api/v1/jobs              List jobs
GET    /api/v1/jobs/:id          Get job details
GET    /api/v1/jobs/:id/logs     Get job logs
POST   /api/v1/jobs/:id/respond  Respond to HITL question
POST   /api/v1/jobs/upload       Upload file attachment
```

### Agents

```
GET    /api/v1/agents            List agents/tools
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

## Example: Create a Job with Attachment

```bash
# 1. Upload file
curl -X POST https://your-domain.com/api/v1/jobs/upload \
  -H "Authorization: Bearer engine_live_..." \
  -F "file=@data.csv"

# 2. Create job with attachment
curl -X POST https://your-domain.com/api/v1/jobs \
  -H "Authorization: Bearer engine_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Analyze the CSV file and create a summary chart",
    "model": "anthropic/claude-sonnet-4",
    "attachments": [{
      "filename": "data.csv",
      "storage_path": "uploads/...",
      "public_url": "https://..."
    }]
  }'
```

## Deployment

### Vercel (Frontend + API)

1. Connect your repo to Vercel
2. Add environment variables
3. Deploy

### Railway (Worker)

1. Create new project from repo
2. Add environment variables
3. Set start command: `npm run worker`

Or use the Docker workflow with `railway.json`:
```json
{
  "build": { "builder": "NIXPACKS" },
  "deploy": { "startCommand": "npm run worker" }
}
```

## License

MIT
