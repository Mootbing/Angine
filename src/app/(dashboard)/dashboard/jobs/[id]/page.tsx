"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Job {
  id: string;
  task: string;
  status: string;
  priority: number;
  timeout_seconds: number;
  tools_discovered: string[] | null;
  result: string | null;
  error_message: string | null;
  agent_question: string | null;
  retry_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  paused_at: string | null;
  artifacts: Array<{
    id: string;
    filename: string;
    mime_type: string;
    url: string;
    size_bytes: number;
  }>;
}

interface Log {
  id: number;
  level: string;
  message: string;
  timestamp: string;
}

export default function JobDetailPage() {
  const params = useParams();
  const jobId = params.id as string;

  const [job, setJob] = useState<Job | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const getApiKey = () => localStorage.getItem("engine_api_key") || "";

  const fetchJob = async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setError("No API key configured");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/v1/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch job");
      }

      const data = await res.json();
      setJob(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    const apiKey = getApiKey();
    if (!apiKey) return;

    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/logs`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
      }
    } catch {}
  };

  const submitAnswer = async () => {
    if (!answer.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/respond`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getApiKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ answer }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit answer");
      }

      setAnswer("");
      fetchJob();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to submit answer");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    fetchJob();
    fetchLogs();

    const interval = setInterval(() => {
      fetchJob();
      fetchLogs();
    }, 3000);

    return () => clearInterval(interval);
  }, [jobId]);

  if (loading) {
    return <div className="text-zinc-500">Loading...</div>;
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
        {error}
      </div>
    );
  }

  if (!job) {
    return <div className="text-zinc-500">Job not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold mb-2">Job Details</h1>
        <p className="text-sm text-zinc-500 font-mono">{job.id}</p>
      </div>

      {/* Status & Task */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-sm font-medium text-zinc-400 mb-3">Task</h2>
          <p className="text-white whitespace-pre-wrap">{job.task}</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-sm font-medium text-zinc-400 mb-3">Status</h2>
          <StatusBadge status={job.status} />

          <div className="mt-4 space-y-2 text-sm">
            <InfoRow label="Priority" value={String(job.priority)} />
            <InfoRow label="Timeout" value={`${job.timeout_seconds}s`} />
            <InfoRow label="Retries" value={String(job.retry_count)} />
            <InfoRow label="Created" value={new Date(job.created_at).toLocaleString()} />
            {job.started_at && (
              <InfoRow label="Started" value={new Date(job.started_at).toLocaleString()} />
            )}
            {job.completed_at && (
              <InfoRow label="Completed" value={new Date(job.completed_at).toLocaleString()} />
            )}
          </div>
        </div>
      </div>

      {/* HITL Question */}
      {job.status === "waiting_for_user" && job.agent_question && (
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-6">
          <h2 className="text-sm font-medium text-purple-400 mb-3">Agent Question</h2>
          <p className="text-white mb-4">{job.agent_question}</p>

          <div className="flex gap-2">
            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Your response..."
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
              onKeyDown={(e) => e.key === "Enter" && submitAnswer()}
            />
            <button
              onClick={submitAnswer}
              disabled={submitting || !answer.trim()}
              className="px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {job.result && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-sm font-medium text-zinc-400 mb-3">Result</h2>
          <pre className="text-white whitespace-pre-wrap font-mono text-sm bg-black/50 rounded-lg p-4 overflow-x-auto">
            {job.result}
          </pre>
        </div>
      )}

      {/* Error */}
      {job.error_message && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6">
          <h2 className="text-sm font-medium text-red-400 mb-3">Error</h2>
          <pre className="text-red-300 whitespace-pre-wrap font-mono text-sm">
            {job.error_message}
          </pre>
        </div>
      )}

      {/* Tools */}
      {job.tools_discovered && job.tools_discovered.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-sm font-medium text-zinc-400 mb-3">Discovered Tools</h2>
          <div className="flex flex-wrap gap-2">
            {job.tools_discovered.map((tool) => (
              <span
                key={tool}
                className="px-2 py-1 bg-zinc-800 text-zinc-300 text-sm rounded"
              >
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Artifacts */}
      {job.artifacts && job.artifacts.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-sm font-medium text-zinc-400 mb-3">Artifacts</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {job.artifacts.map((artifact) => (
              <a
                key={artifact.id}
                href={artifact.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors"
              >
                <div className="text-sm font-medium truncate">{artifact.filename}</div>
                <div className="text-xs text-zinc-500 mt-1">
                  {artifact.mime_type} • {formatBytes(artifact.size_bytes)}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Logs */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-sm font-medium text-zinc-400 mb-3">Logs</h2>
        {logs.length === 0 ? (
          <p className="text-zinc-500 text-sm">No logs yet</p>
        ) : (
          <div className="space-y-1 font-mono text-sm max-h-96 overflow-y-auto">
            {logs.map((log) => (
              <div key={log.id} className="flex gap-2">
                <span className="text-zinc-600 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <LogLevel level={log.level} />
                <span className="text-zinc-300 break-all">{log.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    queued: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    running: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    completed: "bg-green-500/10 text-green-500 border-green-500/20",
    failed: "bg-red-500/10 text-red-500 border-red-500/20",
    waiting_for_user: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    cancelled: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
  };

  return (
    <span className={`inline-block px-3 py-1 text-sm font-medium rounded border ${styles[status] || styles.cancelled}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}

function LogLevel({ level }: { level: string }) {
  const colors: Record<string, string> = {
    debug: "text-zinc-500",
    info: "text-blue-400",
    warn: "text-yellow-400",
    error: "text-red-400",
  };

  return (
    <span className={`shrink-0 w-12 ${colors[level] || colors.info}`}>
      [{level}]
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
