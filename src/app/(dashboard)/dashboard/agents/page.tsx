"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Sparkles,
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
    <div className="space-y-6 animate-fade-in min-w-0">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agents</h1>
          <p className="text-muted-foreground">Browse available tools and capabilities</p>
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

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="bg-card/50 backdrop-blur border-border/50">
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
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <Bot className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-1">No agents found</h3>
            <p className="text-muted-foreground">Register new agents to expand capabilities.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {agents.map((agent) => (
            <Card
              key={agent.id}
              className="bg-card/50 backdrop-blur border-border/50 hover:border-border transition-all group overflow-hidden"
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
                        <Badge variant="secondary" className="text-xs">
                          v{agent.version}
                        </Badge>
                        {agent.verified ? (
                          <Badge className="bg-green-500/10 text-green-400 border-green-500/20">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Verified
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-400 border-amber-500/20">
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
