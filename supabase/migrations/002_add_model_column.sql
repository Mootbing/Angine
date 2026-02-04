-- Add model column to job_queue for OpenRouter model selection
ALTER TABLE job_queue ADD COLUMN IF NOT EXISTS model TEXT DEFAULT 'anthropic/claude-3.5-sonnet';
