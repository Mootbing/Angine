"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Briefcase,
  Server,
  Bot,
  KeyRound,
  Loader2,
  FlaskConical,
  ArrowRight,
} from "lucide-react";

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
  const supabase = createClient();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState<string | null>(null);

  // Get or create API key for the current user
  useEffect(() => {
    const initApiKey = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check localStorage first
      const savedKey = localStorage.getItem("engine_api_key");
      if (savedKey) {
        setApiKey(savedKey);
        return;
      }

      // Create a new API key for this user
      const keyValue = `engine_user_${user.id.slice(0, 8)}_${crypto.randomUUID().slice(0, 16)}`;

      const { error } = await supabase.from("api_keys").insert({
        key_prefix: keyValue.slice(0, 20),
        key_hash: await hashKey(keyValue),
        name: `Auto-generated for ${user.email}`,
        owner_email: user.email,
        scopes: ["jobs:read", "jobs:write", "agents:read", "admin"],
      });

      if (!error) {
        localStorage.setItem("engine_api_key", keyValue);
        setApiKey(keyValue);
      }
    };

    initApiKey();
  }, [supabase]);

  // Hash API key (simple SHA-256)
  async function hashKey(key: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  const fetchMetrics = async () => {
    if (!apiKey) return;

    try {
      const res = await fetch("/api/v1/admin/metrics", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch (err) {
      console.error("Failed to fetch metrics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (apiKey) {
      fetchMetrics();
      const interval = setInterval(fetchMetrics, 10000);
      return () => clearInterval(interval);
    }
  }, [apiKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in min-w-0">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Monitor your agent operations at a glance.
        </p>
      </div>

      {/* Metrics Grid */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Total Jobs"
            value={metrics.jobs.total}
            icon={<Briefcase className="w-5 h-5" />}
          >
            <div className="mt-4 space-y-2">
              <StatusRow label="Queued" value={metrics.jobs.by_status.queued || 0} color="yellow" />
              <StatusRow label="Running" value={metrics.jobs.by_status.running || 0} color="blue" />
              <StatusRow label="Completed" value={metrics.jobs.by_status.completed || 0} color="green" />
              <StatusRow label="Failed" value={metrics.jobs.by_status.failed || 0} color="red" />
              <StatusRow label="Waiting" value={metrics.jobs.by_status.waiting_for_user || 0} color="yellow" />
            </div>
          </MetricCard>

          <MetricCard
            title="Workers"
            value={metrics.workers.total}
            icon={<Server className="w-5 h-5" />}
          >
            <div className="mt-4 space-y-2">
              <StatusRow label="Active" value={metrics.workers.by_status.active || 0} color="green" />
              <StatusRow label="Draining" value={metrics.workers.by_status.draining || 0} color="yellow" />
              <StatusRow label="Dead" value={metrics.workers.by_status.dead || 0} color="red" />
            </div>
          </MetricCard>

          <MetricCard
            title="Agents"
            value={metrics.agents.total}
            icon={<Bot className="w-5 h-5" />}
          >
            <div className="mt-4 space-y-2">
              <StatusRow label="Verified" value={metrics.agents.verified} color="green" />
              <StatusRow label="Pending" value={metrics.agents.total - metrics.agents.verified} color="yellow" />
            </div>
          </MetricCard>

          <MetricCard
            title="API Keys"
            value={metrics.api_keys.total}
            icon={<KeyRound className="w-5 h-5" />}
          >
            <div className="mt-4 space-y-2">
              <StatusRow label="Active" value={metrics.api_keys.active} color="green" />
              <StatusRow label="Revoked" value={metrics.api_keys.total - metrics.api_keys.active} color="red" />
            </div>
          </MetricCard>
        </div>
      )}

      {/* API Playground Card */}
      <div className="max-w-md">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-foreground flex items-center justify-center">
                <FlaskConical className="w-5 h-5 text-background" />
              </div>
              <div>
                <CardTitle>API Playground</CardTitle>
                <CardDescription>Test and deploy agents</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Submit jobs, discover MCP tools, and test API endpoints visually.
            </p>
            <Button asChild className="w-full">
              <Link href="/dashboard/apis">
                Open Playground
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon,
  children,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
            {icon}
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function StatusRow({ label, value, color }: { label: string; value: number; color: string }) {
  const colorClasses: Record<string, string> = {
    green: "bg-green-500",
    yellow: "bg-yellow-500",
    red: "bg-red-500",
    blue: "bg-blue-500",
  };

  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <div className={`w-2 h-2 rounded-full ${colorClasses[color]}`} />
        {label}
      </div>
      <span className="font-medium">{value}</span>
    </div>
  );
}
