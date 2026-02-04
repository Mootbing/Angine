"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Briefcase,
  Server,
  Bot,
  KeyRound,
  TrendingUp,
  Clock,
  Send,
  Paperclip,
  X,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ArrowRight,
  Sparkles,
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

const availableModels = [
  { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", provider: "Anthropic" },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic" },
  { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI" },
  { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash", provider: "Google" },
  { id: "deepseek/deepseek-chat", name: "DeepSeek Chat", provider: "DeepSeek" },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B", provider: "Meta" },
];

export default function DashboardPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");

  const [taskInput, setTaskInput] = useState("");
  const [selectedModel, setSelectedModel] = useState("anthropic/claude-sonnet-4");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [uploadedFiles, setUploadedFiles] = useState<Array<{
    filename: string;
    storage_path: string;
    public_url: string;
    mime_type?: string;
    size_bytes?: number;
  }>>([]);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !apiKey) return;

    setIsUploading(true);

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/v1/jobs/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Upload failed");
        }

        const uploaded = await res.json();
        setUploadedFiles((prev) => [...prev, uploaded]);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const submitJob = async (e: FormEvent) => {
    e.preventDefault();
    if (!taskInput.trim() || !apiKey) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/v1/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          task: taskInput.trim(),
          model: selectedModel,
          attachments: uploadedFiles.length > 0 ? uploadedFiles : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create job");
      }

      const job = await res.json();
      router.push(`/dashboard/jobs/${job.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchMetrics = async () => {
    if (!apiKey) return;

    try {
      const res = await fetch("/api/v1/admin/metrics", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch metrics");
      }

      const data = await res.json();
      setMetrics(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  useEffect(() => {
    const savedKey = localStorage.getItem("engine_api_key");
    if (savedKey) {
      setApiKey(savedKey);
    }
  }, []);

  useEffect(() => {
    if (apiKey) {
      localStorage.setItem("engine_api_key", apiKey);
      fetchMetrics();
      const interval = setInterval(fetchMetrics, 10000);
      return () => clearInterval(interval);
    }
  }, [apiKey]);

  // API Key Input View
  if (!metrics) {
    return (
      <div className="max-w-lg mx-auto mt-20">
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader className="text-center pb-2">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center">
              <KeyRound className="w-7 h-7 text-black" />
            </div>
            <CardTitle className="text-2xl">Welcome to Engine</CardTitle>
            <CardDescription>
              Enter your admin API key to access the dashboard
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="engine_live_..."
                className="bg-background"
              />
            </div>
            <Button onClick={fetchMetrics} className="w-full" size="lg">
              Connect
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in min-w-0">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Monitor your agent operations and submit new jobs.
        </p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Jobs"
          value={metrics.jobs.total}
          icon={<Briefcase className="w-5 h-5" />}
          gradient="from-blue-500 to-cyan-500"
        >
          <div className="mt-4 space-y-2">
            <StatusRow label="Queued" value={metrics.jobs.by_status.queued || 0} color="amber" />
            <StatusRow label="Running" value={metrics.jobs.by_status.running || 0} color="blue" />
            <StatusRow label="Completed" value={metrics.jobs.by_status.completed || 0} color="violet" />
            <StatusRow label="Failed" value={metrics.jobs.by_status.failed || 0} color="red" />
            <StatusRow label="Waiting" value={metrics.jobs.by_status.waiting_for_user || 0} color="purple" />
          </div>
        </MetricCard>

        <MetricCard
          title="Workers"
          value={metrics.workers.total}
          icon={<Server className="w-5 h-5" />}
          gradient="from-purple-500 to-pink-500"
        >
          <div className="mt-4 space-y-2">
            <StatusRow label="Active" value={metrics.workers.by_status.active || 0} color="violet" />
            <StatusRow label="Draining" value={metrics.workers.by_status.draining || 0} color="amber" />
            <StatusRow label="Dead" value={metrics.workers.by_status.dead || 0} color="red" />
          </div>
        </MetricCard>

        <MetricCard
          title="Agents"
          value={metrics.agents.total}
          icon={<Bot className="w-5 h-5" />}
          gradient="from-violet-500 to-purple-500"
        >
          <div className="mt-4 space-y-2">
            <StatusRow label="Verified" value={metrics.agents.verified} color="violet" />
            <StatusRow label="Pending" value={metrics.agents.total - metrics.agents.verified} color="amber" />
          </div>
        </MetricCard>

        <MetricCard
          title="API Keys"
          value={metrics.api_keys.total}
          icon={<KeyRound className="w-5 h-5" />}
          gradient="from-orange-500 to-amber-500"
        >
          <div className="mt-4 space-y-2">
            <StatusRow label="Active" value={metrics.api_keys.active} color="violet" />
            <StatusRow label="Revoked" value={metrics.api_keys.total - metrics.api_keys.active} color="red" />
          </div>
        </MetricCard>
      </div>

      {/* Job Submission */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-black" />
            </div>
            <div>
              <CardTitle>Submit a Job</CardTitle>
              <CardDescription>Describe what you want to accomplish in natural language</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitJob} className="space-y-4">
            <Textarea
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              placeholder="Describe what you want to do...

Examples:
• Calculate the first 20 prime numbers
• Generate a CSV file with random user data
• Analyze the sentiment of this text: 'I love this product!'"
              rows={5}
              className="bg-background resize-none"
            />

            {/* Uploaded files */}
            {uploadedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {uploadedFiles.map((file, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="pl-2 pr-1 py-1.5 gap-2"
                  >
                    <Paperclip className="w-3 h-3" />
                    <span className="max-w-[150px] truncate">{file.filename}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="ml-1 hover:bg-muted rounded p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {/* File upload */}
                <Label
                  htmlFor="file-upload"
                  className={cn(
                    "cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                    isUploading && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Paperclip className="w-4 h-4" />
                  )}
                  {isUploading ? "Uploading..." : "Attach"}
                  <input
                    id="file-upload"
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    disabled={isUploading}
                    className="hidden"
                  />
                </Label>

                {/* Model selector */}
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="w-[200px] bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        <span className="font-medium">{model.name}</span>
                        <span className="text-muted-foreground ml-2 text-xs">
                          {model.provider}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="submit"
                disabled={!taskInput.trim() || isSubmitting}
                className="min-w-[120px]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Submit
                  </>
                )}
              </Button>
            </div>

            {submitError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Throughput */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle>Last Hour</CardTitle>
              <CardDescription>Job throughput metrics</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-8">
            <div>
              <div className="text-4xl font-bold">{metrics.jobs.last_hour.created}</div>
              <div className="flex items-center gap-2 text-muted-foreground mt-1">
                <Clock className="w-4 h-4" />
                Jobs Created
              </div>
            </div>
            <div>
              <div className="text-4xl font-bold text-violet-400">{metrics.jobs.last_hour.completed}</div>
              <div className="flex items-center gap-2 text-muted-foreground mt-1">
                <CheckCircle2 className="w-4 h-4" />
                Jobs Completed
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon,
  gradient,
  children,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  gradient: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
          </div>
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white`}>
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
    violet: "bg-violet-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    blue: "bg-blue-500",
    purple: "bg-purple-500",
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
