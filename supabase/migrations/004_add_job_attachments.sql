-- Add attachments table for job input files
CREATE TABLE IF NOT EXISTS job_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES job_queue(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_attachments_job_id ON job_attachments(job_id);

-- Enable RLS
ALTER TABLE job_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to attachments" ON job_attachments
  FOR ALL USING (true) WITH CHECK (true);
