import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Layers,
  Shield,
  ArrowRight,
  Terminal,
  Zap,
  Bot,
  Activity,
} from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 grid-pattern opacity-30" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-violet-500/10 via-transparent to-transparent blur-3xl" />

      <div className="relative max-w-6xl mx-auto px-6 py-20">
        {/* Nav */}
        <nav className="flex items-center justify-between mb-20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center">
              <Zap className="w-4 h-4 text-black" />
            </div>
            <span className="font-semibold text-lg">Engine</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/api/v1/health" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              API Status
            </Link>
            <Button asChild>
              <Link href="/dashboard">
                Dashboard
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </div>
        </nav>

        {/* Hero */}
        <div className="text-center mb-24">
          <Badge variant="secondary" className="mb-6">
            <Activity className="w-3 h-3 mr-1" />
            v1.0.0 — Now with multi-model support
          </Badge>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 tracking-tight">
            <span className="gradient-text">Agent Operations</span>
            <br />
            <span className="text-foreground">Platform</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            Task discovery, job queue management, and secure sandbox execution
            for AI agents. Build, deploy, and orchestrate intelligent workflows.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild className="glow-green">
              <Link href="/dashboard">
                <Bot className="w-5 h-5 mr-2" />
                Open Dashboard
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="#quickstart">
                <Terminal className="w-5 h-5 mr-2" />
                View API Docs
              </Link>
            </Button>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 mb-24">
          <FeatureCard
            title="Task Discovery"
            description="Semantic search over agent registry using vector embeddings. Find the right tools for any task automatically."
            icon={<Search className="w-5 h-5" />}
            gradient="from-blue-500 to-cyan-500"
          />
          <FeatureCard
            title="Job Queue"
            description="Reliable, distributed job processing with priority, retries, and human-in-the-loop support."
            icon={<Layers className="w-5 h-5" />}
            gradient="from-purple-500 to-pink-500"
          />
          <FeatureCard
            title="Sandbox Execution"
            description="Secure, isolated Python environments powered by E2B. Execute untrusted agent code safely."
            icon={<Shield className="w-5 h-5" />}
            gradient="from-violet-500 to-purple-500"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-24">
          <StatCard value="7+" label="LLM Models" />
          <StatCard value="8" label="Built-in Tools" />
          <StatCard value="<1s" label="Avg Latency" />
          <StatCard value="99.9%" label="Uptime SLA" />
        </div>

        {/* Quick Start */}
        <div id="quickstart" className="scroll-mt-20">
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardContent className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <Terminal className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Quick Start</h2>
                  <p className="text-sm text-muted-foreground">Get up and running in minutes</p>
                </div>
              </div>
              <div className="space-y-6">
                <CodeBlock
                  step={1}
                  title="Create a job"
                  code={`curl -X POST https://your-domain.com/api/v1/jobs \\
  -H "Authorization: Bearer engine_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"task": "Analyze the sentiment of this text...", "model": "anthropic/claude-sonnet-4"}'`}
                />
                <CodeBlock
                  step={2}
                  title="Check job status"
                  code={`curl https://your-domain.com/api/v1/jobs/{job_id} \\
  -H "Authorization: Bearer engine_live_..."`}
                />
                <CodeBlock
                  step={3}
                  title="Get results"
                  code={`{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "result": "The sentiment is positive with 94% confidence.",
  "artifacts": [...]
}`}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <footer className="mt-24 pt-8 border-t border-border/50">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="w-6 h-6 rounded bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center">
                <Zap className="w-3 h-3 text-black" />
              </div>
              <span className="text-sm">Engine Platform v1.0.0</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
              <Link href="/api/v1/health" className="hover:text-foreground transition-colors">API Health</Link>
              <Link href="/dashboard/agents" className="hover:text-foreground transition-colors">Tools</Link>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}

function FeatureCard({
  title,
  description,
  icon,
  gradient,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
}) {
  return (
    <Card className="bg-card/50 backdrop-blur border-border/50 hover:border-border transition-all hover:shadow-lg hover:shadow-black/20 group">
      <CardContent className="p-6">
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform`}>
          {icon}
        </div>
        <h3 className="font-semibold text-lg mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </CardContent>
    </Card>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <Card className="bg-card/30 backdrop-blur border-border/50">
      <CardContent className="p-6 text-center">
        <div className="text-3xl font-bold gradient-text mb-1">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

function CodeBlock({ step, title, code }: { step: number; title: string; code: string }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-6 h-6 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-xs font-medium">
          {step}
        </div>
        <span className="text-sm font-medium">{title}</span>
      </div>
      <pre className="bg-black/50 border border-border/50 rounded-lg p-4 overflow-x-auto text-sm text-muted-foreground font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
}
