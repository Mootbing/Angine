import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-900 to-black">
      <div className="max-w-5xl mx-auto px-6 py-20">
        {/* Hero */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            Engine
          </h1>
          <p className="text-xl text-zinc-400 mb-8">
            Agent Operations Platform
          </p>
          <p className="text-zinc-500 max-w-2xl mx-auto">
            Task discovery, job queue management, and secure sandbox execution
            for AI agents. Build, deploy, and orchestrate intelligent workflows.
          </p>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          <FeatureCard
            title="Task Discovery"
            description="Semantic search over agent registry using vector embeddings. Find the right tools for any task."
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
          />
          <FeatureCard
            title="Job Queue"
            description="Reliable, distributed job processing with priority, retries, and HITL (human-in-the-loop) support."
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            }
          />
          <FeatureCard
            title="Sandbox Execution"
            description="Secure, isolated Python environments powered by E2B. Execute untrusted agent code safely."
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            }
          />
        </div>

        {/* Quick Links */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <Link
            href="/dashboard"
            className="px-6 py-3 bg-white text-black font-medium rounded-lg hover:bg-zinc-200 transition-colors text-center"
          >
            Open Dashboard
          </Link>
          <Link
            href="/api/v1/health"
            className="px-6 py-3 border border-zinc-700 text-zinc-300 font-medium rounded-lg hover:border-zinc-500 hover:text-white transition-colors text-center"
          >
            API Health Check
          </Link>
        </div>

        {/* API Quick Start */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Quick Start</h2>
          <div className="space-y-4">
            <CodeBlock
              title="Create a job"
              code={`curl -X POST https://your-domain.com/api/v1/jobs \\
  -H "Authorization: Bearer engine_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"task": "Analyze the sentiment of this text..."}'`}
            />
            <CodeBlock
              title="Check job status"
              code={`curl https://your-domain.com/api/v1/jobs/{job_id} \\
  -H "Authorization: Bearer engine_live_..."`}
            />
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-16 text-center text-zinc-600 text-sm">
          <p>Engine Platform v1.0.0</p>
        </footer>
      </div>
    </main>
  );
}

function FeatureCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors">
      <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center text-zinc-400 mb-4">
        {icon}
      </div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-zinc-500">{description}</p>
    </div>
  );
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  return (
    <div>
      <p className="text-sm text-zinc-500 mb-2">{title}</p>
      <pre className="bg-black/50 border border-zinc-800 rounded-lg p-4 overflow-x-auto text-sm text-zinc-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}
