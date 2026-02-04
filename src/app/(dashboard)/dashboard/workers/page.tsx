"use client";

import { useEffect, useState } from "react";

interface Worker {
  id: string;
  last_heartbeat: string;
  active_jobs: number;
  status: string;
  hostname: string | null;
  version: string | null;
  health: "healthy" | "warning" | "dead";
  seconds_since_heartbeat: number;
}

interface WorkerData {
  workers: Worker[];
  summary: {
    healthy: number;
    warning: number;
    dead: number;
  };
}

export default function WorkersPage() {
  const [data, setData] = useState<WorkerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkers = async () => {
    const apiKey = localStorage.getItem("engine_api_key");
    if (!apiKey) {
      setError("No API key configured. Go to Dashboard to set one.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/v1/admin/workers", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch workers");
      }

      const result = await res.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkers();
    const interval = setInterval(fetchWorkers, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Workers</h1>
        <button
          onClick={fetchWorkers}
          className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white hover:bg-zinc-700"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6 text-red-400">
          {error}
        </div>
      )}

      {/* Summary */}
      {data && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <SummaryCard label="Healthy" value={data.summary.healthy} color="green" />
          <SummaryCard label="Warning" value={data.summary.warning} color="yellow" />
          <SummaryCard label="Dead" value={data.summary.dead} color="red" />
        </div>
      )}

      {loading ? (
        <div className="text-zinc-500">Loading...</div>
      ) : !data || data.workers.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500">
          No workers registered
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-sm text-zinc-400">
                <th className="px-4 py-3 font-medium">Worker ID</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Health</th>
                <th className="px-4 py-3 font-medium">Active Jobs</th>
                <th className="px-4 py-3 font-medium">Last Heartbeat</th>
              </tr>
            </thead>
            <tbody>
              {data.workers.map((worker) => (
                <tr key={worker.id} className="border-b border-zinc-800 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-mono text-sm">{worker.id}</div>
                    {worker.hostname && (
                      <div className="text-xs text-zinc-500">{worker.hostname}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={worker.status} />
                  </td>
                  <td className="px-4 py-3">
                    <HealthBadge health={worker.health} />
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {worker.active_jobs}
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-400">
                    {worker.seconds_since_heartbeat}s ago
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    green: "text-green-500",
    yellow: "text-yellow-500",
    red: "text-red-500",
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className={`text-2xl font-bold ${colors[color]}`}>{value}</div>
      <div className="text-sm text-zinc-500">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-500/10 text-green-500 border-green-500/20",
    draining: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    dead: "bg-red-500/10 text-red-500 border-red-500/20",
  };

  return (
    <span className={`inline-block px-2 py-1 text-xs font-medium rounded border ${styles[status] || styles.dead}`}>
      {status}
    </span>
  );
}

function HealthBadge({ health }: { health: string }) {
  const styles: Record<string, string> = {
    healthy: "bg-green-500",
    warning: "bg-yellow-500",
    dead: "bg-red-500",
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${styles[health]}`} />
      <span className="text-sm text-zinc-400">{health}</span>
    </div>
  );
}
