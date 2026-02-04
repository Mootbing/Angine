"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Clock,
  Package,
  Search,
  Sparkles,
  Loader2,
} from "lucide-react";

interface Agent {
  id: string;
  name: string;
  description: string;
  package_name: string;
  version: string;
  category?: string;
  verified: boolean;
  created_at: string;
  similarity?: number;
}

const categoryColors: Record<string, string> = {
  web: "from-blue-500 to-cyan-500",
  data: "from-neutral-500 to-pink-500",
  visualization: "from-orange-500 to-amber-500",
  media: "from-red-500 to-rose-500",
  math: "from-neutral-500 to-neutral-500",
  file: "from-indigo-500 to-neutral-500",
  text: "from-teal-500 to-cyan-500",
  general: "from-zinc-500 to-zinc-600",
};

export default function ToolsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUnverified, setShowUnverified] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchAgents = useCallback(async () => {
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
  }, [showUnverified]);

  const searchAgents = useCallback(async (query: string) => {
    const apiKey = localStorage.getItem("engine_api_key");
    if (!apiKey) return;

    setSearching(true);
    try {
      const res = await fetch("/api/v1/agents/discover", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ task: query, threshold: 0.2, limit: 20 }),
      });

      if (!res.ok) {
        throw new Error("Search failed");
      }

      const data = await res.json();

      // Fetch full details for discovered agents
      if (data.agents && data.agents.length > 0) {
        const detailsRes = await fetch(`/api/v1/agents?verified_only=${!showUnverified}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });

        if (detailsRes.ok) {
          const detailsData = await detailsRes.json();
          const agentsMap = new Map(detailsData.agents.map((a: Agent) => [a.id, a]));

          const enrichedAgents = data.agents
            .map((a: any) => {
              const full = agentsMap.get(a.id);
              if (full) {
                return { ...full, similarity: a.similarity };
              }
              return null;
            })
            .filter(Boolean);

          setAgents(enrichedAgents);
        }
      } else {
        setAgents([]);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }, [showUnverified]);

  // Fetch or search based on query
  useEffect(() => {
    if (debouncedQuery.trim()) {
      searchAgents(debouncedQuery);
    } else {
      fetchAgents();
    }
  }, [debouncedQuery, fetchAgents, searchAgents]);

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Tools & MCPs</h1>
          <p className="page-description">Browse available MCP servers and capabilities</p>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="show-unverified"
            checked={showUnverified}
            onCheckedChange={(checked) => setShowUnverified(checked === true)}
          />
          <Label htmlFor="show-unverified" className="text-sm text-muted-foreground cursor-pointer">
            Show unverified
          </Label>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search tools by capability (e.g., 'web browsing', 'file management')..."
          className="pl-10 bg-background"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="card-glass">
              <CardContent className="p-6">
                <div className="flex gap-4">
                  <Skeleton className="w-12 h-12 rounded-xl shrink-0" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : agents.length === 0 ? (
        <Card className="card-glass">
          <CardContent className="card-empty-state">
            <div className="card-empty-icon">
              <Bot className="card-empty-icon-inner" />
            </div>
            <h3 className="text-lg font-medium mb-1">
              {searchQuery ? "No matching tools found" : "No agents found"}
            </h3>
            <p className="page-description">
              {searchQuery
                ? "Try a different search query or check 'Show unverified'."
                : "Register new agents to expand capabilities."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {agents.map((agent) => (
            <Card
              key={agent.id}
              className="card-glass hover:border-border transition-all group overflow-hidden"
            >
              <CardContent className="p-6">
                <div className="flex gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br",
                    categoryColors[agent.category || "general"] || categoryColors.general,
                    "group-hover:scale-110 transition-transform"
                  )}>
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold truncate">{agent.name}</h3>
                        <p className="text-sm text-muted-foreground font-mono break-all">
                          {agent.package_name}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        {agent.similarity !== undefined && (
                          <Badge variant="secondary" className="text-xs">
                            {Math.round(agent.similarity * 100)}% match
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-xs">
                          v{agent.version}
                        </Badge>
                        {agent.verified ? (
                          <Badge className="status-success">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Verified
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="status-warning">
                            <Clock className="w-3 h-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                      {agent.description}
                    </p>
                    <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground/70">
                      <Package className="w-3 h-3 shrink-0" />
                      <span>Registered {new Date(agent.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
