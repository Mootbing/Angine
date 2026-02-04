"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

interface Metrics {
  jobs: {
    by_status: Record<string, number>;
    total: number;
    last_hour: { created: number; completed: number };
  };
  workers: {
    by_status: Record<string, number>;
    total: number;
  };
  agents: {
    total: number;
    verified: number;
  };
  api_keys: {
    total: number;
    active: number;
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");

  // Job submission state
  const [taskInput, setTaskInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastJobId, setLastJobId] = useState<string | null>(null);

  const submitJob = async (e: FormEvent) => {
    e.preventDefault();
    if (!taskInput.trim() || !apiKey) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/v1/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ task: taskInput.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create job");
      }

      const job = await res.json();
      setLastJobId(job.id);
      setTaskInput("");
      fetchMetrics(); // Refresh metrics
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchMetrics = async () => {
    if (!apiKey) return;

    try {
      const res = await fetch("/api/v1/admin/metrics", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch metrics");
      }

      const data = await res.json();
      setMetrics(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  useEffect(() => {
    // Try to load API key from localStorage
    const savedKey = localStorage.getItem("engine_api_key");
    if (savedKey) {
      setApiKey(savedKey);
    }
  }, []);

  useEffect(() => {
    if (apiKey) {
      localStorage.setItem("engine_api_key", apiKey);
      fetchMetrics();
      const interval = setInterval(fetchMetrics, 10000);
      return () => clearInterval(interval);
    }
  }, [apiKey]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* API Key Input */}
      {!metrics && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
          <label className="block text-sm text-zinc-400 mb-2">
            Enter your admin API key to view metrics
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="engine_live_..."
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
            />
            <button
              onClick={fetchMetrics}
              className="px-4 py-2 bg-white text-black font-medium rounded-lg hover:bg-zinc-200"
            >
              Connect
            </button>
          </div>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </div>
      )}

      {/* Metrics Grid */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Jobs */}
          <MetricCard title="Jobs">
            <div className="text-3xl font-bold mb-2">{metrics.jobs.total}</div>
            <div className="space-y-1 text-sm">
              <StatusRow label="Queued" value={metrics.jobs.by_status.queued || 0} color="yellow" />
              <StatusRow label="Running" value={metrics.jobs.by_status.running || 0} color="blue" />
              <StatusRow label="Completed" value={metrics.jobs.by_status.completed || 0} color="green" />
              <StatusRow label="Failed" value={metrics.jobs.by_status.failed || 0} color="red" />
              <StatusRow label="Waiting" value={metrics.jobs.by_status.waiting_for_user || 0} color="purple" />
            </div>
          </MetricCard>

          {/* Workers */}
          <MetricCard title="Workers">
            <div className="text-3xl font-bold mb-2">{metrics.workers.total}</div>
            <div className="space-y-1 text-sm">
              <StatusRow label="Active" value={metrics.workers.by_status.active || 0} color="green" />
              <StatusRow label="Draining" value={metrics.workers.by_status.draining || 0} color="yellow" />
              <StatusRow label="Dead" value={metrics.workers.by_status.dead || 0} color="red" />
            </div>
          </MetricCard>

          {/* Agents */}
          <MetricCard title="Agents">
            <div className="text-3xl font-bold mb-2">{metrics.agents.total}</div>
            <div className="space-y-1 text-sm">
              <StatusRow label="Verified" value={metrics.agents.verified} color="green" />
              <StatusRow label="Pending" value={metrics.agents.total - metrics.agents.verified} color="yellow" />
            </div>
          </MetricCard>

          {/* API Keys */}
          <MetricCard title="API Keys">
            <div className="text-3xl font-bold mb-2">{metrics.api_keys.total}</div>
            <div className="space-y-1 text-sm">
              <StatusRow label="Active" value={metrics.api_keys.active} color="green" />
              <StatusRow label="Revoked" value={metrics.api_keys.total - metrics.api_keys.active} color="red" />
            </div>
          </MetricCard>
        </div>
      )}

      {/* Job Submission */}
      {metrics && (
        <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Submit a Job</h2>
          <form onSubmit={submitJob} className="space-y-4">
            <div>
              <textarea
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                placeholder="Describe what you want to do in natural language...

Examples:
• Calculate the first 20 prime numbers
• Generate a CSV file with random user data
• Analyze the sentiment of this text: 'I love this product!'"
                rows={4}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 resize-none"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-zinc-500">
                {taskInput.length > 0 && `${taskInput.length} characters`}
              </div>
              <button
                type="submit"
                disabled={!taskInput.trim() || isSubmitting}
                className="px-6 py-2 bg-white text-black font-medium rounded-lg hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Submitting...
                  </>
                ) : (
                  "Submit Job"
                )}
              </button>
            </div>
            {submitError && (
              <p className="text-red-500 text-sm">{submitError}</p>
            )}
            {lastJobId && (
              <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-green-400 text-sm">
                  Job created!{" "}
                  <button
                    type="button"
                    onClick={() => router.push(`/dashboard/jobs/${lastJobId}`)}
                    className="underline hover:text-green-300"
                  >
                    View job →
                  </button>
                </span>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Throughput */}
      {metrics && (
        <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Last Hour</h2>
          <div className="flex gap-8">
            <div>
              <div className="text-2xl font-bold">{metrics.jobs.last_hour.created}</div>
              <div className="text-sm text-zinc-500">Jobs Created</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{metrics.jobs.last_hour.completed}</div>
              <div className="text-sm text-zinc-500">Jobs Completed</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <h3 className="text-sm font-medium text-zinc-400 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function StatusRow({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    green: "bg-green-500",
    yellow: "bg-yellow-500",
    red: "bg-red-500",
    blue: "bg-blue-500",
    purple: "bg-purple-500",
  };

  return (
    <div className="flex items-center justify-between text-zinc-400">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${colors[color]}`} />
        <span>{label}</span>
      </div>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}
