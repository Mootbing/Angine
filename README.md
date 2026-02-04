# Engine - AI Agent Platform

A platform for running AI agents that can execute tasks using tools like web fetching, Python execution, and file operations.

## How It Works

```
User submits task → Job Queue → Worker picks up
                                      ↓
                    ┌─────────────────────────────┐
                    │       Agent Loop            │
                    │                             │
                    │  LLM decides tool to call   │
                    │           ↓                 │
                    │  Worker executes tool       │
                    │           ↓                 │
                    │  Result back to LLM         │
                    │           ↓                 │
                    │  Repeat until done          │
                    └─────────────────────────────┘
                                      ↓
                              Job completed
```

The LLM uses **native tool calling** to decide what to do. No code generation - the LLM calls tools directly and the worker executes them.

## Built-in Tools

| Tool | Description |
|------|-------------|
| `fetch_url` | HTTP requests to any URL (APIs, web pages) |
| `run_python` | Execute Python code in E2B sandbox |
| `read_file` | Read uploaded file attachments |
| `write_file` | Save output files as artifacts |
| `ask_user` | Pause and ask user a question (HITL) |
| `final_answer` | Return the final result |

## Tech Stack

- **Frontend**: Next.js 14, shadcn/ui, Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Worker**: Node.js on Railway
- **LLM**: OpenRouter (Claude, GPT-4, Gemini, etc.)
- **Sandbox**: E2B for Python execution

## Quick Start

### 1. Install

```bash
git clone https://github.com/your-org/engine
cd engine
npm install
```

### 2. Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# E2B (Python sandbox)
E2B_API_KEY=e2b_...

# OpenRouter (LLM)
OPENROUTER_API_KEY=sk-or-v1-...
```

### 3. Database Setup

Run `supabase/migrations/001_full_schema.sql` in Supabase SQL Editor.

Create a storage bucket named `job-files` (public).

### 4. Run Locally

```bash
npm run dev:all
```

- Dashboard: http://localhost:3000/dashboard
- Worker runs alongside

## API

### Create a Job

```bash
curl -X POST http://localhost:3000/api/v1/jobs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"task": "What is 2 + 2?"}'
```

### With File Attachment

```bash
# Upload file first
curl -X POST http://localhost:3000/api/v1/jobs/upload \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "file=@data.csv"

# Create job with attachment
curl -X POST http://localhost:3000/api/v1/jobs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Analyze this CSV and summarize the data",
    "attachments": [{"filename": "data.csv", "public_url": "..."}]
  }'
```

### Endpoints

```
POST   /api/v1/jobs              Create job
GET    /api/v1/jobs              List jobs
GET    /api/v1/jobs/:id          Get job details
GET    /api/v1/jobs/:id/logs     Get execution logs
POST   /api/v1/jobs/:id/respond  Answer agent question (HITL)
POST   /api/v1/jobs/upload       Upload attachment

GET    /api/v1/agents            List MCP servers
POST   /api/v1/admin/keys        Create API key
GET    /api/v1/admin/workers     List workers
GET    /api/v1/admin/metrics     System metrics
```

## Deployment

### Vercel (Frontend + API)

1. Connect repo to Vercel
2. Add environment variables
3. Deploy

### Railway (Worker)

1. Create project from repo
2. Add environment variables
3. Set start command: `npm run worker`

Add `railway.json`:
```json
{
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "npm run worker",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

## Supported Models

All models available through OpenRouter:

- Claude Sonnet 4 (default)
- Claude 3.5 Sonnet
- GPT-4o / GPT-4o Mini
- Gemini 2.0 Flash
- DeepSeek Chat
- Llama 3.3 70B

## License

MIT
