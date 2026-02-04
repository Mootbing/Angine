# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Frontend                                    │
│                         (Next.js on Vercel)                             │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │
│  │  Dashboard   │  │   Job List   │  │  Job Detail  │                   │
│  │              │  │              │  │  + Plan UI   │                   │
│  └──────────────┘  └──────────────┘  └──────────────┘                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            API Routes                                    │
│                        (/api/v1/...)                                     │
│                                                                          │
│  POST /jobs          GET /jobs/:id        POST /jobs/:id/respond        │
│  GET /jobs           GET /jobs/:id/logs   POST /jobs/upload             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            Supabase                                      │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │  job_queue   │  │   job_logs   │  │ job_artifacts│  │  api_keys   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘ │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐                                     │
│  │   workers    │  │    agents    │   Storage: job-files bucket         │
│  └──────────────┘  └──────────────┘                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                             Worker                                       │
│                        (Node.js on Railway)                              │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                        Agent Loop                                 │  │
│  │                                                                   │  │
│  │   ┌─────────┐    ┌─────────────┐    ┌─────────────────────────┐  │  │
│  │   │   LLM   │───▶│  Tool Call  │───▶│    Tool Execution       │  │  │
│  │   │(OpenRouter)  │  Decision   │    │                         │  │  │
│  │   └─────────┘    └─────────────┘    │  - fetch_url            │  │  │
│  │        ▲                            │  - run_python (E2B)     │  │  │
│  │        │                            │  - read_file            │  │  │
│  │        └────────────────────────────│  - write_file           │  │  │
│  │              Tool Result            │  - ask_user (HITL)      │  │  │
│  │                                     │  - discover_tools       │  │  │
│  │                                     │  - final_answer         │  │  │
│  │                                     └─────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Components

### Frontend (`src/app/`)

- **Dashboard** - Overview, stats, recent jobs
- **Job List** - Paginated list of all jobs with status
- **Job Detail** - Real-time job status, logs, artifacts, and HITL interaction
- **Plan Approval UI** - Markdown-rendered plan display with approve/edit/reject actions

### API Routes (`src/app/api/v1/`)

| Route | Purpose |
|-------|---------|
| `jobs/route.ts` | Create and list jobs |
| `jobs/[id]/route.ts` | Get job details |
| `jobs/[id]/respond/route.ts` | HITL responses (approve/edit/reject/respond) |
| `jobs/[id]/logs/route.ts` | Get execution logs |
| `jobs/upload/route.ts` | Upload file attachments |
| `agents/route.ts` | List MCP servers |
| `admin/*` | API keys, workers, metrics |

### Worker (`worker/index.ts`)

Single-file worker that:
1. Polls for queued jobs
2. Claims and executes jobs via agent loop
3. Handles tool execution
4. Manages HITL pausing/resuming
5. Reports heartbeats

### Database Schema

```sql
job_queue          -- Main job table with status, task, result
job_logs           -- Execution logs per job
job_artifacts      -- Output files per job
job_attachments    -- Input files per job
api_keys           -- API authentication
workers            -- Worker registration and heartbeats
agents             -- MCP server registry
```

## HITL (Human-in-the-Loop) Flow

### Plan Approval Mode (Default)

```
┌─────────┐     ┌──────────┐     ┌──────────────────┐
│  User   │────▶│  Create  │────▶│   Job Queued     │
│         │     │   Job    │     │                  │
└─────────┘     └──────────┘     └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │  Worker Claims   │
                                 │                  │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │  Agent Creates   │
                                 │  Plan (JSON)     │
                                 └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │  ask_user tool   │
                                 │  with JSON plan  │
                                 └────────┬─────────┘
                                          │
                                          ▼
┌─────────┐     ┌──────────────────────────────────┐
│  User   │◀────│  status: waiting_for_user        │
│ Reviews │     │  agent_question: {               │
│  Plan   │     │    "type": "plan",               │
│         │     │    "plan": "## Steps\n1...",     │
└────┬────┘     │    "question": "Proceed?"        │
     │          │  }                               │
     │          └──────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│           User Response                  │
├─────────────────────────────────────────┤
│  Approve  │  Edit    │  Reject │ Respond │
└─────┬─────┴────┬─────┴────┬────┴────┬────┘
      │          │          │         │
      ▼          ▼          ▼         ▼
┌─────────────────────────────────────────┐
│  POST /jobs/:id/respond                  │
│  {                                       │
│    "answer": "...",                      │
│    "action": "approve|edit|reject|respond",
│    "editedPlan": "..." (if edit)        │
│  }                                       │
└─────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────┐
│  Job re-queued with user_answer         │
│  Worker resumes execution               │
└─────────────────────────────────────────┘
```

### Structured Plan Format

The agent sends plans as JSON through the `ask_user` tool:

```json
{
  "type": "plan",
  "plan": "## Proposed Plan\n\n1. First step\n2. Second step\n3. Third step",
  "question": "Should I proceed with this plan?"
}
```

The frontend:
1. Parses `agent_question` as JSON
2. Detects `type: "plan"`
3. Renders plan as markdown
4. Shows approve/edit/reject buttons

Plain text questions (non-JSON) fall back to simple input UI.

### Response Formatting

Based on action type, the response is formatted:

| Action | Response Format |
|--------|-----------------|
| `approve` | `[PLAN APPROVED] {answer}` |
| `reject` | `[PLAN REJECTED] {answer}` |
| `edit` | `[PLAN EDITED] {editedPlan}\n\nFeedback: {answer}` |
| `respond` | `{answer}` (raw) |

## Execution State

Jobs can be paused and resumed. State is preserved in `execution_state`:

```typescript
interface ExecutionState {
  checkpoint: string;           // e.g., "waiting_for_input"
  context: {
    variables: Record<string, unknown>;
    files_created: string[];
    conversation_history: Message[];
    packages_installed: string[];
  };
  sandbox_id: string | null;
  resumed_count: number;
  last_checkpoint_at: string;
}
```

## File Structure

```
engine/
├── src/
│   ├── app/
│   │   ├── (dashboard)/        # Dashboard pages
│   │   └── api/v1/             # API routes
│   ├── components/ui/          # shadcn/ui components
│   ├── lib/                    # Utilities, queue, auth
│   └── types/                  # TypeScript types
├── worker/
│   └── index.ts                # Worker process
├── supabase/
│   └── migrations/             # Database schema
└── public/                     # Static assets
```

## Security

- API key authentication on all endpoints
- Scoped permissions (jobs:read, jobs:write, admin)
- Rate limiting per API key
- E2B sandbox isolation for Python execution
- Input validation with Zod schemas
