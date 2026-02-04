"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  RefreshCw,
  AlertCircle,
  ChevronRight,
  Clock,
  MessageSquare,
  Inbox,
} from "lucide-react";

interface Job {
  id: string;
  task: string;
  status: string;
  priority: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  agent_question: string | null;
}

const statusConfig: Record<string, { color: string; bg: string; border: string }> = {
  queued: { color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  running: { color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  completed: { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  failed: { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
  waiting_for_user: { color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
  cancelled: { color: "text-zinc-400", bg: "bg-zinc-500/10", border: "border-zinc-500/20" },
};

export default function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchJobs = async () => {
    const apiKey = localStorage.getItem("engine_api_key");
    if (!apiKey) {
      setError("No API key configured. Go to Dashboard to set one.");
      setLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/v1/jobs?${params}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch jobs");
      }

      const data = await res.json();
      setJobs(data.jobs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, [statusFilter]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Jobs</h1>
          <p className="text-muted-foreground">View and manage your job queue</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] bg-background">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="waiting_for_user">Waiting for User</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchJobs}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardContent className="p-6 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-12 flex-1" />
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : jobs.length === 0 ? (
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <Inbox className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-1">No jobs found</h3>
            <p className="text-muted-foreground">Submit a new job from the dashboard to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card/50 backdrop-blur border-border/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="text-muted-foreground">Task</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground">Priority</TableHead>
                <TableHead className="text-muted-foreground">Created</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow
                  key={job.id}
                  onClick={() => router.push(`/dashboard/jobs/${job.id}`)}
                  className="cursor-pointer border-border/50 hover:bg-muted/50"
                >
                  <TableCell>
                    <div className="max-w-md">
                      <div className="truncate font-medium">{job.task}</div>
                      <div className="text-xs text-muted-foreground font-mono mt-1">{job.id}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={job.status} />
                    {job.agent_question && (
                      <div className="flex items-center gap-1 text-xs text-purple-400 mt-1.5">
                        <MessageSquare className="w-3 h-3" />
                        <span className="truncate max-w-[200px]">{job.agent_question}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{job.priority}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(job.created_at).toLocaleString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.cancelled;

  return (
    <Badge
      variant="outline"
      className={cn("capitalize", config.color, config.bg, config.border)}
    >
      {status.replace("_", " ")}
    </Badge>
  );
}
