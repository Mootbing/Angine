"use client";

import { useEffect, useState } from "react";
import { cn, formatTimeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";

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

const allScopes = [
  "jobs:read",
  "jobs:write",
  "jobs:delete",
  "agents:read",
  "agents:write",
  "admin",
];

export default function KeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">API Keys</h1>
          <p className="page-description">Manage authentication credentials</p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Key
            </Button>
          </DialogTrigger>
          <CreateKeyDialog
            onClose={() => setShowCreateDialog(false)}
            onCreated={(data) => {
              setNewKeyData(data);
              setShowCreateDialog(false);
              fetchKeys();
            }}
          />
        </Dialog>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* New Key Display */}
      {newKeyData && (
        <Alert className="alert-success">
          <ShieldCheck className="h-4 w-4 text-green-400" />
          <AlertDescription className="space-y-3">
            <div>
              <p className="font-medium text-green-400">New API Key Created</p>
              <p className="text-sm text-muted-foreground">
                Copy this key now. You won&apos;t be able to see it again!
              </p>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-black/30 rounded-lg px-4 py-2.5 font-mono text-sm text-green-300 break-all">
                {newKeyData.key}
              </code>
              <Button
                size="sm"
                onClick={() => {
                  copyToClipboard(newKeyData.key);
                }}
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setNewKeyData(null)}
            >
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <Card className="card-glass">
          <CardContent className="p-6 space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-12 flex-1" />
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : keys.length === 0 ? (
        <Card className="card-glass">
          <CardContent className="card-empty-state">
            <div className="card-empty-icon">
              <KeyRound className="card-empty-icon-inner" />
            </div>
            <h3 className="text-lg font-medium mb-1">No API keys found</h3>
            <p className="page-description">Create an API key to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="card-glass overflow-hidden">
          <div className="table-container px-6 pb-6">
          <Table>
            <TableHeader>
              <TableRow className="table-row-base hover:bg-transparent">
                <TableHead className="table-head-cell">Name</TableHead>
                <TableHead className="table-head-cell">Key</TableHead>
                <TableHead className="table-head-cell">Scopes</TableHead>
                <TableHead className="table-head-cell">Usage</TableHead>
                <TableHead className="table-head-cell">Last Used</TableHead>
                <TableHead className="table-head-cell">Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id} className="table-row-base">
                  <TableCell className="table-cell">
                    <div className="font-medium">{key.name}</div>
                    {key.owner_email && (
                      <div className="text-xs text-muted-foreground">{key.owner_email}</div>
                    )}
                  </TableCell>
                  <TableCell className="table-cell">
                    <code className="text-sm text-muted-foreground">
                      {key.key_prefix}
                    </code>
                  </TableCell>
                  <TableCell className="table-cell">
                    <div className="flex gap-1">
                      {key.scopes.slice(0, 3).map((scope) => (
                        <Badge key={scope} variant="secondary" className="text-xs">
                          {scope}
                        </Badge>
                      ))}
                      {key.scopes.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{key.scopes.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="table-cell">
                    <div className="text-sm">{key.total_requests.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">
                      {key.rate_limit_rpm} rpm
                    </div>
                  </TableCell>
                  <TableCell className="table-cell">
                    <div className="text-sm text-muted-foreground">
                      {key.last_used_at
                        ? formatTimeAgo(Math.floor((Date.now() - new Date(key.last_used_at).getTime()) / 1000))
                        : "Never"}
                    </div>
                  </TableCell>
                  <TableCell className="table-cell">
                    {key.is_active ? (
                      <Badge variant="status" className="status-success">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="status" className="status-danger">
                        <XCircle className="w-3 h-3 mr-1" />
                        Revoked
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="table-cell">
                    {key.is_active && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-danger hover:text-red-300 hover:bg-red-500/10"
                        onClick={() => handleRevoke(key.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </Card>
      )}
    </div>
  );
}

function CreateKeyDialog({
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
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Create API Key</DialogTitle>
        <DialogDescription>
          Generate a new API key for authentication.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My API Key"
            className="bg-background"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Owner Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@example.com"
            className="bg-background"
          />
        </div>
        <div className="space-y-2">
          <Label>Scopes</Label>
          <div className="flex flex-wrap gap-2">
            {allScopes.map((scope) => (
              <Badge
                key={scope}
                variant={scopes.includes(scope) ? "default" : "outline"}
                className={cn(
                  "cursor-pointer transition-colors",
                  scopes.includes(scope)
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                )}
                onClick={() => toggleScope(scope)}
              >
                {scope}
              </Badge>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rateLimit">Rate Limit (requests/minute)</Label>
          <Input
            id="rateLimit"
            type="number"
            value={rateLimit}
            onChange={(e) => setRateLimit(e.target.value)}
            min="1"
            max="10000"
            className="bg-background"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleCreate} disabled={creating || !name.trim()}>
          {creating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            "Create"
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
