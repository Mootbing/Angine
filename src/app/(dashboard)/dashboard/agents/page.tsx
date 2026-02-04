"use client";

import { useEffect, useState } from "react";

interface Agent {
  id: string;
  name: string;
  description: string;
  package_name: string;
  version: string;
  verified: boolean;
  created_at: string;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUnverified, setShowUnverified] = useState(false);

  const fetchAgents = async () => {
    const apiKey = localStorage.getItem("engine_api_key");
    if (!apiKey) {
      setError("No API key configured. Go to Dashboard to set one.");
      setLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams();
      params.set("verified_only", showUnverified ? "false" : "true");

      const res = await fetch(`/api/v1/agents?${params}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch agents");
      }

      const data = await res.json();
      setAgents(data.agents);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, [showUnverified]);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Agents</h1>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={showUnverified}
            onChange={(e) => setShowUnverified(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-800 text-blue-500"
          />
          Show unverified
        </label>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6 text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-zinc-500">Loading...</div>
      ) : agents.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500">
          No agents found
        </div>
      ) : (
        <div className="grid gap-4">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-semibold text-white">{agent.name}</h3>
                  <p className="text-sm text-zinc-500 font-mono">{agent.package_name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">v{agent.version}</span>
                  {agent.verified ? (
                    <span className="px-2 py-1 text-xs bg-green-500/10 text-green-500 border border-green-500/20 rounded">
                      Verified
                    </span>
                  ) : (
                    <span className="px-2 py-1 text-xs bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 rounded">
                      Pending
                    </span>
                  )}
                </div>
              </div>
              <p className="text-sm text-zinc-400">{agent.description}</p>
              <p className="text-xs text-zinc-600 mt-3">
                Registered {new Date(agent.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
