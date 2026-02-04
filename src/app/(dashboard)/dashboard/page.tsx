"use client";

import { useEffect, useState } from "react";

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
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");

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
