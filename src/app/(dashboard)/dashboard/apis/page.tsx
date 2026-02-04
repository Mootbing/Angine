"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { cn, formatTimeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Send,
  Paperclip,
  X,
  Loader2,
  AlertCircle,
  Sparkles,
  Search,
  Bot,
  CheckCircle2,
  KeyRound,
  Clock,
  UserCheck,
} from "lucide-react";

const availableModels = [
  { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", provider: "Anthropic" },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic" },
  { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI" },
  { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash", provider: "Google" },
  { id: "deepseek/deepseek-chat", name: "DeepSeek Chat", provider: "DeepSeek" },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B", provider: "Meta" },
];

const timeoutOptions = [
  { value: 60, label: "1 minute" },
  { value: 300, label: "5 minutes" },
  { value: 600, label: "10 minutes" },
  { value: 900, label: "15 minutes" },
  { value: 1800, label: "30 minutes" },
  { value: 3600, label: "1 hour" },
];

const hitlModeOptions = [
  {
    value: "plan_approval",
    label: "Ask after planning",
    description: "Agent creates a plan and asks for approval before executing"
  },
  {
    value: "auto_execute",
    label: "Auto-execute",
    description: "Agent executes immediately without asking for approval"
  },
  {
    value: "always_ask",
    label: "Ask before every action",
    description: "Agent asks for approval before each significant action"
  },
];

interface ApiKey {
  id: string;
  key_prefix: string;
  name: string;
  owner_email: string | null;
  scopes: string[];
  rate_limit_rpm: number;
  is_active: boolean;
  last_used_at: string | null;
  total_requests: number;
}

interface DiscoveredAgent {
  id: string;
  name: string;
  package_name: string;
  similarity: number;
}

export default function ApisPage() {
  const router = useRouter();

  // API Key state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [selectedKeyId, setSelectedKeyId] = useState<string>("");
  const [loadingKeys, setLoadingKeys] = useState(true);

  // Job submission state
  const [taskInput, setTaskInput] = useState("");
  const [selectedModel, setSelectedModel] = useState("anthropic/claude-sonnet-4");
  const [selectedTimeout, setSelectedTimeout] = useState(300);
  const [selectedHitlMode, setSelectedHitlMode] = useState("plan_approval");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const [uploadedFiles, setUploadedFiles] = useState<Array<{
    filename: string;
    storage_path: string;
    public_url: string;
  }>>([]);
  const [isUploading, setIsUploading] = useState(false);

  // MCP Discovery state
  const [discoveryQuery, setDiscoveryQuery] = useState("");
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [discoveredAgents, setDiscoveredAgents] = useState<DiscoveredAgent[]>([]);

  // Fetch API keys on mount
  useEffect(() => {
    const fetchKeys = async () => {
      const savedKey = localStorage.getItem("engine_api_key");
      if (!savedKey) {
        setLoadingKeys(false);
        return;
      }

      try {
        const res = await fetch("/api/v1/admin/keys?active_only=true", {
          headers: { Authorization: `Bearer ${savedKey}` },
        });

        if (res.ok) {
          const data = await res.json();
          setApiKeys(data.keys || []);
          // Default to the first key
          if (data.keys?.length > 0) {
            setSelectedKeyId(data.keys[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to fetch API keys:", err);
      } finally {
        setLoadingKeys(false);
      }
    };

    fetchKeys();
  }, []);

  const getApiKey = () => localStorage.getItem("engine_api_key");

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    const apiKey = getApiKey();
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

        if (res.ok) {
          const uploaded = await res.json();
          setUploadedFiles((prev) => [...prev, uploaded]);
        }
      }
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const submitJob = async (e: FormEvent) => {
    e.preventDefault();
    const apiKey = getApiKey();
    if (!taskInput.trim() || !apiKey) return;

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

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
          timeout_seconds: selectedTimeout,
          hitl_mode: selectedHitlMode,
          attachments: uploadedFiles.length > 0 ? uploadedFiles : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create job");
      }

      const job = await res.json();
      setSubmitSuccess(`Job created: ${job.id}`);
      setTaskInput("");
      setUploadedFiles([]);

      // Navigate to job page after short delay
      setTimeout(() => {
        router.push(`/dashboard/jobs/${job.id}`);
      }, 1000);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const discoverTools = async (e: FormEvent) => {
    e.preventDefault();
    const apiKey = getApiKey();
    if (!discoveryQuery.trim() || !apiKey) return;

    setIsDiscovering(true);
    setDiscoveryError(null);
    setDiscoveredAgents([]);

    try {
      const res = await fetch("/api/v1/agents/discover", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          task: discoveryQuery.trim(),
          limit: 5,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to discover tools");
      }

      const data = await res.json();
      setDiscoveredAgents(data.agents || []);
    } catch (err) {
      setDiscoveryError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsDiscovering(false);
    }
  };

  const selectedKey = apiKeys.find(k => k.id === selectedKeyId);

  return (
    <div className="page-container space-y-8">
      {/* Header */}
      <div>
        <h1 className="page-title">API Playground</h1>
        <p className="page-description">
          Test API endpoints visually
        </p>
      </div>

      {/* API Key Selector */}
      <Card className="card-glass overflow-hidden">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="card-header-icon">
              <KeyRound className="card-header-icon-inner" />
            </div>
            <div>
              <CardTitle>Select API Key</CardTitle>
              <CardDescription className="text-red-400">This key will be used for all tests below</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className={selectedKey ? "pb-4" : ""}>
          <Select value={selectedKeyId} onValueChange={setSelectedKeyId} disabled={loadingKeys}>
            <SelectTrigger className="w-full bg-background">
              {loadingKeys ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading keys...
                </div>
              ) : (
                <SelectValue placeholder="Select an API key" />
              )}
            </SelectTrigger>
            <SelectContent>
              {apiKeys.map((key) => (
                <SelectItem key={key.id} value={key.id}>
                  <span className="font-medium">{key.name}</span>
                  <code className="text-xs text-muted-foreground ml-2">{key.key_prefix}</code>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
        {selectedKey && (
          <div className="overflow-x-auto border-t border-border/50">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="text-muted-foreground whitespace-nowrap">Name</TableHead>
                  <TableHead className="text-muted-foreground whitespace-nowrap">Key</TableHead>
                  <TableHead className="text-muted-foreground whitespace-nowrap">Scopes</TableHead>
                  <TableHead className="text-muted-foreground whitespace-nowrap">Usage</TableHead>
                  <TableHead className="text-muted-foreground whitespace-nowrap">Last Used</TableHead>
                  <TableHead className="text-muted-foreground whitespace-nowrap">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="border-border/50">
                  <TableCell className="whitespace-nowrap">
                    <div className="font-medium">{selectedKey.name}</div>
                    {selectedKey.owner_email && (
                      <div className="text-xs text-muted-foreground">{selectedKey.owner_email}</div>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <code className="text-sm text-muted-foreground font-mono">
                      {selectedKey.key_prefix}
                    </code>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex gap-1">
                      {selectedKey.scopes.slice(0, 3).map((scope) => (
                        <Badge key={scope} variant="secondary" className="text-xs">
                          {scope}
                        </Badge>
                      ))}
                      {selectedKey.scopes.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{selectedKey.scopes.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="text-sm">{selectedKey.total_requests.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">
                      {selectedKey.rate_limit_rpm} rpm
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="text-sm text-muted-foreground">
                      {selectedKey.last_used_at
                        ? formatTimeAgo(Math.floor((Date.now() - new Date(selectedKey.last_used_at).getTime()) / 1000))
                        : "Never"}
                    </div>
                  </TableCell>
                  <TableCell className="table-cell">
                    {selectedKey.is_active ? (
                      <Badge className="status-success">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="status-danger">
                        Revoked
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Job Submission */}
        <Card className="card-glass">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="card-header-icon">
                <Sparkles className="card-header-icon-inner" />
              </div>
              <div>
                <CardTitle>POST /api/v1/jobs</CardTitle>
                <CardDescription>Submit a new job to the queue</CardDescription>
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
• Scrape the top posts from Hacker News
• Generate a CSV file with random user data
• Analyze the sentiment of this text: 'I love this product!'"
                rows={5}
                className="bg-background resize-none"
              />

              {uploadedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {uploadedFiles.map((file, index) => (
                    <Badge key={index} variant="secondary" className="pl-2 pr-1 py-1.5 gap-2">
                      <Paperclip className="w-3 h-3" />
                      <span className="max-w-[150px] truncate">{file.filename}</span>
                      <button
                        type="button"
                        onClick={() => setUploadedFiles(prev => prev.filter((_, i) => i !== index))}
                        className="ml-1 hover:bg-muted rounded p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Model & Attach */}
              <div className="flex items-center gap-3">
                <label
                  htmlFor="file-upload"
                  className={cn(
                    "cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                    isUploading && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                  {isUploading ? "Uploading..." : "Attach"}
                  <input
                    id="file-upload"
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    disabled={isUploading}
                    className="hidden"
                  />
                </label>

                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="flex-1 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        <span className="font-medium">{model.name}</span>
                        <span className="text-muted-foreground ml-2 text-xs">{model.provider}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Timeout & HITL Mode */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    Timeout
                  </Label>
                  <Select value={String(selectedTimeout)} onValueChange={(v) => setSelectedTimeout(Number(v))}>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timeoutOptions.map((opt) => (
                        <SelectItem key={opt.value} value={String(opt.value)}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <UserCheck className="w-3 h-3" />
                    Human Approval
                  </Label>
                  <Select value={selectedHitlMode} onValueChange={setSelectedHitlMode}>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {hitlModeOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex flex-col">
                            <span className="font-medium">{opt.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* HITL Mode Description */}
              <p className={cn(
                "text-xs",
                selectedHitlMode === "auto_execute" ? "text-red-400 font-medium" : "text-muted-foreground"
              )}>
                {selectedHitlMode === "auto_execute" && <span className="font-bold">[DANGER] </span>}
                {hitlModeOptions.find(o => o.value === selectedHitlMode)?.description}
              </p>

              <Button type="submit" disabled={!taskInput.trim() || isSubmitting} className="w-full">
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Submit Job
                  </>
                )}
              </Button>

              {submitError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              )}

              {submitSuccess && (
                <Alert className="alert-success">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <AlertDescription className="text-success">{submitSuccess}</AlertDescription>
                </Alert>
              )}
            </form>
          </CardContent>
        </Card>

        {/* MCP Tool Discovery */}
        <Card className="card-glass">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="card-header-icon">
                <Search className="card-header-icon-inner" />
              </div>
              <div>
                <CardTitle>POST /api/v1/agents/discover</CardTitle>
                <CardDescription>Search for MCP tools using vector similarity</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={discoverTools} className="space-y-4">
              <Input
                value={discoveryQuery}
                onChange={(e) => setDiscoveryQuery(e.target.value)}
                placeholder="e.g., web browsing, file management, database..."
                className="bg-background"
              />

              <Button type="submit" disabled={!discoveryQuery.trim() || isDiscovering} className="w-full">
                {isDiscovering ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Searching
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Discover Tools
                  </>
                )}
              </Button>

              {discoveryError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{discoveryError}</AlertDescription>
                </Alert>
              )}

              {discoveredAgents.length > 0 && (
                <ScrollArea className="h-[300px] rounded-lg border border-border/50 bg-background/50">
                  <div className="p-4 space-y-3">
                    {discoveredAgents.map((agent) => (
                      <div
                        key={agent.id}
                        className="p-3 rounded-lg border border-border/50 bg-card/50 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Bot className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{agent.name}</span>
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            {(agent.similarity * 100).toFixed(0)}% match
                          </Badge>
                        </div>
                        <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded inline-block">
                          {agent.package_name}
                        </code>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}

              {discoveredAgents.length === 0 && !isDiscovering && !discoveryError && discoveryQuery && (
                <div className="text-center py-8 text-muted-foreground">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Enter a query and click search to discover tools</p>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
