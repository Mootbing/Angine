"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { cn, formatDuration } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  MessageSquare,
  Package,
  Send,
  Terminal,
  Timer,
  RotateCcw,
  ArrowLeft,
  Edit3,
  X,
  Check,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import ReactMarkdown from "react-markdown";
import Link from "next/link";

interface Job {
  id: string;
  task: string;
  status: string;
  priority: number;
  timeout_seconds: number;
  tools_discovered: string[] | null;
  result: string | null;
  error_message: string | null;
  agent_question: string | null;
  retry_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  paused_at: string | null;
  artifacts: Array<{
    id: string;
    filename: string;
    mime_type: string;
    url: string;
    size_bytes: number;
  }>;
}

interface Log {
  id: number;
  level: string;
  message: string;
  timestamp: string;
}

const statusConfig: Record<string, { color: string; bg: string; border: string; icon: React.ReactNode }> = {
  queued: { color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", icon: <Clock className="w-4 h-4" /> },
  running: { color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", icon: <Loader2 className="w-4 h-4 animate-spin" /> },
  completed: { color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/20", icon: <CheckCircle2 className="w-4 h-4" /> },
  failed: { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", icon: <AlertCircle className="w-4 h-4" /> },
  waiting_for_user: { color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20", icon: <MessageSquare className="w-4 h-4" /> },
  cancelled: { color: "text-zinc-400", bg: "bg-zinc-500/10", border: "border-zinc-500/20", icon: <AlertCircle className="w-4 h-4" /> },
};

export default function JobDetailPage() {
  const params = useParams();
  const jobId = params.id as string;

  const [job, setJob] = useState<Job | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editedPlan, setEditedPlan] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const getApiKey = () => localStorage.getItem("engine_api_key") || "";

  // Parse agent_question to detect JSON plan vs plain text
  type ParsedMessage =
    | { type: "plan"; plan: string; question: string }
    | { type: "text"; question: string };

  const parseAgentMessage = (raw: string | null): ParsedMessage | null => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.type === "plan" && typeof parsed.plan === "string") {
        return { type: "plan", plan: parsed.plan, question: parsed.question || "Should I proceed?" };
      }
    } catch {
      // Not JSON, treat as plain text
    }
    return { type: "text", question: raw };
  };

  const fetchJob = async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setError("No API key configured");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/v1/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch job");
      }

      const data = await res.json();
      setJob(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    const apiKey = getApiKey();
    if (!apiKey) return;

    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/logs`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
      }
    } catch {}
  };

  const submitResponse = async (action: "approve" | "reject" | "edit" | "respond") => {
    // For approve, we don't require answer text
    if (action !== "approve" && !answer.trim() && action !== "edit") return;
    // For edit, we need editedPlan
    if (action === "edit" && !editedPlan.trim()) return;

    setSubmitting(true);
    try {
      const body: { answer: string; action: string; editedPlan?: string } = {
        answer: answer.trim() || (action === "approve" ? "Approved" : ""),
        action,
      };
      if (action === "edit") {
        body.editedPlan = editedPlan;
      }

      const res = await fetch(`/api/v1/jobs/${jobId}/respond`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getApiKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit response");
      }

      setAnswer("");
      setEditedPlan("");
      setIsEditing(false);
      fetchJob();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to submit response");
    } finally {
      setSubmitting(false);
    }
  };

  // Legacy function for backward compatibility
  const submitAnswer = () => submitResponse("respond");

  useEffect(() => {
    fetchJob();
    fetchLogs();

    const interval = setInterval(() => {
      fetchJob();
      fetchLogs();
    }, 3000);

    return () => clearInterval(interval);
  }, [jobId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!job) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Job not found</AlertDescription>
      </Alert>
    );
  }

  const config = statusConfig[job.status] || statusConfig.cancelled;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/jobs">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Job Details</h1>
          <p className="text-sm text-muted-foreground font-mono">{job.id}</p>
        </div>
      </div>

      {/* Task & Status Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Task
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap leading-relaxed">{job.task}</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Status
              <Badge
                variant="outline"
                className={cn("ml-2 capitalize", config.color, config.bg, config.border)}
              >
                {config.icon}
                <span className="ml-1">{job.status.replace("_", " ")}</span>
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow icon={<Timer className="w-4 h-4" />} label="Priority" value={String(job.priority)} />
            <InfoRow icon={<Clock className="w-4 h-4" />} label="Timeout" value={formatDuration(job.timeout_seconds)} />
            <InfoRow icon={<RotateCcw className="w-4 h-4" />} label="Retries" value={String(job.retry_count)} />
            <Separator className="bg-border/50" />
            <InfoRow label="Created" value={new Date(job.created_at).toLocaleString()} />
            {job.started_at && <InfoRow label="Started" value={new Date(job.started_at).toLocaleString()} />}
            {job.completed_at && <InfoRow label="Completed" value={new Date(job.completed_at).toLocaleString()} />}
          </CardContent>
        </Card>
      </div>

      {/* HITL Question / Plan Approval */}
      {job.status === "waiting_for_user" && job.agent_question && (() => {
        const parsed = parseAgentMessage(job.agent_question);
        if (!parsed) return null;

        if (parsed.type === "plan") {
          // Enhanced Plan Approval UI
          return (
            <Card className="bg-yellow-500/5 border-yellow-500/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-yellow-400">
                  <MessageSquare className="w-5 h-5" />
                  Plan Approval Required
                </CardTitle>
                <CardDescription>{parsed.question}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Plan Display / Edit */}
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">Editing Plan</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setIsEditing(false);
                          setEditedPlan("");
                        }}
                      >
                        <X className="w-4 h-4 mr-1" />
                        Cancel
                      </Button>
                    </div>
                    <Textarea
                      value={editedPlan}
                      onChange={(e) => setEditedPlan(e.target.value)}
                      placeholder="Edit the plan..."
                      className="min-h-[200px] font-mono text-sm bg-background"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">Proposed Plan</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditedPlan(parsed.plan);
                          setIsEditing(true);
                        }}
                      >
                        <Edit3 className="w-4 h-4 mr-1" />
                        Edit Plan
                      </Button>
                    </div>
                    <div className="prose prose-sm prose-invert max-w-none bg-black/30 rounded-lg p-4 overflow-x-auto
                      prose-headings:text-foreground prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
                      prose-p:text-foreground/90 prose-p:my-2
                      prose-li:text-foreground/90 prose-li:my-1
                      prose-strong:text-foreground prose-code:text-blue-400 prose-code:bg-black/40 prose-code:px-1 prose-code:rounded
                      prose-ol:my-2 prose-ul:my-2">
                      <ReactMarkdown>{parsed.plan}</ReactMarkdown>
                    </div>
                  </div>
                )}

                {/* Feedback textarea */}
                <div className="space-y-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    {isEditing ? "Additional Feedback (optional)" : "Response / Feedback (optional for approve)"}
                  </span>
                  <Textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder={isEditing ? "Any additional instructions..." : "Add feedback or instructions..."}
                    className="min-h-[80px] bg-background"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2">
                  {isEditing ? (
                    <Button
                      onClick={() => submitResponse("edit")}
                      disabled={submitting || !editedPlan.trim()}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {submitting ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      ) : (
                        <Check className="w-4 h-4 mr-1" />
                      )}
                      Submit Edited Plan
                    </Button>
                  ) : (
                    <>
                      <Button
                        onClick={() => submitResponse("approve")}
                        disabled={submitting}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {submitting ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1" />
                        ) : (
                          <Check className="w-4 h-4 mr-1" />
                        )}
                        Approve Plan
                      </Button>
                      <Button
                        onClick={() => submitResponse("reject")}
                        disabled={submitting || !answer.trim()}
                        variant="destructive"
                      >
                        {submitting ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1" />
                        ) : (
                          <X className="w-4 h-4 mr-1" />
                        )}
                        Reject
                      </Button>
                      <Button
                        onClick={() => submitResponse("respond")}
                        disabled={submitting || !answer.trim()}
                        variant="secondary"
                      >
                        {submitting ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1" />
                        ) : (
                          <Send className="w-4 h-4 mr-1" />
                        )}
                        Send Response
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        }

        // Plain text question UI (existing behavior)
        return (
          <Card className="bg-yellow-500/5 border-yellow-500/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-400">
                <MessageSquare className="w-5 h-5" />
                Agent Question
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-foreground">{parsed.question}</p>
              <div className="flex gap-2">
                <Input
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Your response..."
                  className="bg-background"
                  onKeyDown={(e) => e.key === "Enter" && submitAnswer()}
                />
                <Button
                  onClick={submitAnswer}
                  disabled={submitting || !answer.trim()}
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Result */}
      {job.result && (
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-400">
              <CheckCircle2 className="w-5 h-5" />
              Result
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap font-mono text-sm bg-black/30 rounded-lg p-4 overflow-x-auto">
              {job.result}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {job.error_message && (
        <Card className="bg-red-500/5 border-red-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-5 h-5" />
              Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap font-mono text-sm text-red-300">
              {job.error_message}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Tools & Artifacts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tools */}
        {job.tools_discovered && job.tools_discovered.length > 0 && (
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Discovered Tools
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {job.tools_discovered.map((tool) => (
                  <Badge key={tool} variant="secondary">
                    {tool}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Artifacts */}
        {job.artifacts && job.artifacts.length > 0 && (
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="w-5 h-5" />
                Artifacts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {job.artifacts.map((artifact) => (
                  <a
                    key={artifact.id}
                    href={artifact.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg hover:bg-secondary transition-colors"
                  >
                    <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{artifact.filename}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatBytes(artifact.size_bytes)}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Logs */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="w-5 h-5" />
            Logs
          </CardTitle>
          <CardDescription>Real-time execution logs</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-muted-foreground text-sm">No logs yet</p>
          ) : (
            <ScrollArea className="h-[300px]">
              <div className="space-y-1 font-mono text-sm pr-4">
                {logs.map((log) => (
                  <div key={log.id} className="flex gap-3">
                    <span className="text-muted-foreground/50 shrink-0 w-20">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <LogLevel level={log.level} />
                    <span className="text-foreground/80 break-all">{log.message}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function LogLevel({ level }: { level: string }) {
  const config: Record<string, string> = {
    debug: "text-zinc-500",
    info: "text-blue-400",
    warn: "text-amber-400",
    error: "text-red-400",
  };

  return (
    <span className={cn("shrink-0 w-14 uppercase text-xs font-medium", config[level] || config.info)}>
      [{level}]
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
