"use client";

import { useEffect, useState, useRef, useCallback } from "react";
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

// Use CSS classes from globals.css for consistent status styling
const statusClasses: Record<string, string> = {
  queued: "status-queued",
  running: "status-running",
  completed: "status-completed",
  failed: "status-failed",
  waiting_for_user: "status-waiting_for_user",
  cancelled: "status-cancelled",
};

export default function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftShadow, setShowLeftShadow] = useState(false);
  const [showRightShadow, setShowRightShadow] = useState(false);

  const updateScrollShadows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setShowLeftShadow(scrollLeft > 0);
    setShowRightShadow(scrollLeft + clientWidth < scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateScrollShadows();
    window.addEventListener("resize", updateScrollShadows);
    return () => window.removeEventListener("resize", updateScrollShadows);
  }, [updateScrollShadows, jobs]);

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
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Jobs</h1>
          <p className="page-description">View and manage your job queue</p>
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
        <Card className="card-glass">
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
        <Card className="card-glass">
          <CardContent className="card-empty-state">
            <div className="card-empty-icon">
              <Inbox className="card-empty-icon-inner" />
            </div>
            <h3 className="text-lg font-medium mb-1">No jobs found</h3>
            <p className="page-description">Submit a new job from the dashboard to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="card-glass overflow-hidden relative">
          {/* Scroll shadows */}
          <div className={cn("scroll-shadow-left transition-opacity duration-200", showLeftShadow ? "opacity-100" : "opacity-0")} />
          <div className={cn("scroll-shadow-right transition-opacity duration-200", showRightShadow ? "opacity-100" : "opacity-0")} />
          <div
            ref={scrollRef}
            onScroll={updateScrollShadows}
            className="overflow-x-auto"
          >
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="text-muted-foreground min-w-[250px]">Task</TableHead>
                  <TableHead className="text-muted-foreground min-w-[140px]">Status</TableHead>
                  <TableHead className="text-muted-foreground min-w-[80px]">Priority</TableHead>
                  <TableHead className="text-muted-foreground min-w-[180px]">Created</TableHead>
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
                      <div className="min-w-[250px]">
                        <div className="truncate font-medium max-w-[300px]">{job.task}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-1">{job.id}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={job.status} />
                      {job.agent_question && (
                        <div className="flex items-center gap-1 text-xs text-yellow-400 mt-1.5">
                          <MessageSquare className="w-3 h-3" />
                          <span className="truncate max-w-[200px]">{job.agent_question}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{job.priority}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground whitespace-nowrap">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
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
          </div>
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("capitalize", statusClasses[status] || "status-neutral")}
    >
      {status.replace("_", " ")}
    </Badge>
  );
}
