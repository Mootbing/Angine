"use client";

import { useEffect, useState } from "react";
import { cn, formatTimeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Server,
  AlertTriangle,
  XCircle,
} from "lucide-react";

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

// Use CSS classes from globals.css for consistent status styling
const workerStatusClasses: Record<string, string> = {
  active: "worker-active",
  draining: "worker-draining",
  dead: "worker-dead",
};

const healthClasses: Record<string, string> = {
  healthy: "health-healthy",
  warning: "health-warning",
  dead: "health-dead",
};

const healthIcons: Record<string, React.ReactNode> = {
  healthy: <CheckCircle2 className="w-4 h-4" />,
  warning: <AlertTriangle className="w-4 h-4" />,
  dead: <XCircle className="w-4 h-4" />,
};

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
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Workers</h1>
          <p className="page-description">Monitor worker health and status</p>
        </div>
        <Button variant="outline" size="icon" onClick={fetchWorkers}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SummaryCard
            label="Healthy"
            value={data.summary.healthy}
            icon={<CheckCircle2 className="w-5 h-5" />}
            variant="success"
          />
          <SummaryCard
            label="Warning"
            value={data.summary.warning}
            icon={<AlertTriangle className="w-5 h-5" />}
            variant="warning"
          />
          <SummaryCard
            label="Dead"
            value={data.summary.dead}
            icon={<XCircle className="w-5 h-5" />}
            variant="danger"
          />
        </div>
      )}

      {loading ? (
        <Card className="card-glass">
          <CardContent className="p-6 space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-12 flex-1" />
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : !data || data.workers.length === 0 ? (
        <Card className="card-glass">
          <CardContent className="card-empty-state">
            <div className="card-empty-icon">
              <Server className="card-empty-icon-inner" />
            </div>
            <h3 className="text-lg font-medium mb-1">No workers registered</h3>
            <p className="page-description">Start a worker to begin processing jobs.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="card-glass overflow-hidden">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="text-muted-foreground whitespace-nowrap">Worker ID</TableHead>
                <TableHead className="text-muted-foreground whitespace-nowrap">Status</TableHead>
                <TableHead className="text-muted-foreground whitespace-nowrap">Health</TableHead>
                <TableHead className="text-muted-foreground whitespace-nowrap">Active Jobs</TableHead>
                <TableHead className="text-muted-foreground whitespace-nowrap">Last Heartbeat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.workers.map((worker) => (
                  <TableRow key={worker.id} className="table-row-base">
                    <TableCell className="table-cell">
                      <div className="font-mono text-sm">{worker.id}</div>
                      {worker.hostname && (
                        <div className="text-xs text-muted-foreground">{worker.hostname}</div>
                      )}
                    </TableCell>
                    <TableCell className="table-cell">
                      <Badge
                        variant="outline"
                        className={cn("capitalize", workerStatusClasses[worker.status] || "status-neutral")}
                      >
                        {worker.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="table-cell">
                      <div className={cn("flex items-center gap-2", healthClasses[worker.health] || "health-dead")}>
                        {healthIcons[worker.health] || healthIcons.dead}
                        <span className="text-sm capitalize">{worker.health}</span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant="secondary">{worker.active_jobs}</Badge>
                    </TableCell>
                    <TableCell className="table-cell">
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Clock className="w-3.5 h-3.5" />
                        {formatTimeAgo(worker.seconds_since_heartbeat)}
                      </div>
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

function SummaryCard({
  label,
  value,
  icon,
  variant,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  variant: "success" | "warning" | "danger";
}) {
  const gradientClasses = {
    success: "gradient-success",
    warning: "gradient-warning",
    danger: "gradient-danger",
  };

  return (
    <Card className="card-glass">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
          </div>
          <div className={cn("gradient-icon", gradientClasses[variant])}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
