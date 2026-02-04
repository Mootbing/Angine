"use client";

import { useEffect, useState } from "react";

interface ApiKey {
  id: string;
  key_prefix: string;
  name: string;
  owner_email: string | null;
  scopes: string[];
  rate_limit_rpm: number;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  total_requests: number;
}

export default function KeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyData, setNewKeyData] = useState<{ key: string; id: string } | null>(null);

  const fetchKeys = async () => {
    const apiKey = localStorage.getItem("engine_api_key");
    if (!apiKey) {
      setError("No API key configured. Go to Dashboard to set one.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/v1/admin/keys?active_only=false", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch API keys");
      }

      const data = await res.json();
      setKeys(data.keys);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleRevoke = async (keyId: string) => {
    if (!confirm("Are you sure you want to revoke this API key?")) return;

    const apiKey = localStorage.getItem("engine_api_key");
    try {
      const res = await fetch(`/api/v1/admin/keys/${keyId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to revoke key");
      }

      fetchKeys();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to revoke key");
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">API Keys</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-white text-black font-medium rounded-lg hover:bg-zinc-200"
        >
          Create Key
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6 text-red-400">
          {error}
        </div>
      )}

      {/* New Key Display */}
      {newKeyData && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-6 mb-6">
          <h3 className="text-green-400 font-medium mb-2">New API Key Created</h3>
          <p className="text-sm text-zinc-400 mb-4">
            Copy this key now. You won&apos;t be able to see it again!
          </p>
          <div className="flex gap-2">
            <code className="flex-1 bg-black/50 rounded-lg px-4 py-2 font-mono text-sm text-green-300 break-all">
              {newKeyData.key}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(newKeyData.key);
                alert("Copied to clipboard!");
              }}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500"
            >
              Copy
            </button>
          </div>
          <button
            onClick={() => setNewKeyData(null)}
            className="mt-4 text-sm text-zinc-400 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-zinc-500">Loading...</div>
      ) : keys.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500">
          No API keys found
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-sm text-zinc-400">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Key</th>
                <th className="px-4 py-3 font-medium">Scopes</th>
                <th className="px-4 py-3 font-medium">Usage</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} className="border-b border-zinc-800 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{key.name}</div>
                    {key.owner_email && (
                      <div className="text-xs text-zinc-500">{key.owner_email}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-zinc-400">
                    {key.key_prefix}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {key.scopes.map((scope) => (
                        <span
                          key={scope}
                          className="px-1.5 py-0.5 text-xs bg-zinc-800 text-zinc-400 rounded"
                        >
                          {scope}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div>{key.total_requests.toLocaleString()} requests</div>
                    <div className="text-xs text-zinc-500">
                      {key.rate_limit_rpm} rpm limit
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {key.is_active ? (
                      <span className="px-2 py-1 text-xs bg-green-500/10 text-green-500 border border-green-500/20 rounded">
                        Active
                      </span>
                    ) : (
                      <span className="px-2 py-1 text-xs bg-red-500/10 text-red-500 border border-red-500/20 rounded">
                        Revoked
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {key.is_active && (
                      <button
                        onClick={() => handleRevoke(key.id)}
                        className="text-sm text-red-400 hover:text-red-300"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateKeyModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(data) => {
            setNewKeyData(data);
            setShowCreateModal(false);
            fetchKeys();
          }}
        />
      )}
    </div>
  );
}

function CreateKeyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (data: { key: string; id: string }) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [scopes, setScopes] = useState<string[]>(["jobs:read", "jobs:write"]);
  const [rateLimit, setRateLimit] = useState("60");
  const [creating, setCreating] = useState(false);

  const allScopes = [
    "jobs:read",
    "jobs:write",
    "jobs:delete",
    "agents:read",
    "agents:write",
    "admin",
  ];

  const toggleScope = (scope: string) => {
    if (scopes.includes(scope)) {
      setScopes(scopes.filter((s) => s !== scope));
    } else {
      setScopes([...scopes, scope]);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) return;

    setCreating(true);
    const apiKey = localStorage.getItem("engine_api_key");

    try {
      const res = await fetch("/api/v1/admin/keys", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          owner_email: email || undefined,
          scopes,
          rate_limit_rpm: parseInt(rateLimit, 10),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create key");
      }

      const data = await res.json();
      onCreated({ key: data.key, id: data.id });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Create API Key</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My API Key"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Owner Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@example.com"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Scopes</label>
            <div className="flex flex-wrap gap-2">
              {allScopes.map((scope) => (
                <button
                  key={scope}
                  onClick={() => toggleScope(scope)}
                  className={`px-2 py-1 text-xs rounded border ${
                    scopes.includes(scope)
                      ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                      : "bg-zinc-800 text-zinc-400 border-zinc-700"
                  }`}
                >
                  {scope}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Rate Limit (requests/minute)</label>
            <input
              type="number"
              value={rateLimit}
              onChange={(e) => setRateLimit(e.target.value)}
              min="1"
              max="10000"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-zinc-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            className="px-4 py-2 bg-white text-black font-medium rounded-lg hover:bg-zinc-200 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
