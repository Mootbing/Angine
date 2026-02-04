"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  ListTodo,
  Bot,
  Server,
  KeyRound,
  Zap,
  ExternalLink,
  ChevronRight,
} from "lucide-react";

const navigation = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { name: "Jobs", href: "/dashboard/jobs", icon: ListTodo },
  { name: "Agents", href: "/dashboard/agents", icon: Bot },
  { name: "Workers", href: "/dashboard/workers", icon: Server },
  { name: "API Keys", href: "/dashboard/keys", icon: KeyRound },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-sidebar-background border-r border-sidebar-border flex flex-col">
        {/* Logo */}
        <div className="p-6">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:shadow-emerald-500/40 transition-shadow">
              <Zap className="w-5 h-5 text-black" />
            </div>
            <div>
              <h1 className="font-semibold text-foreground">Engine</h1>
              <p className="text-xs text-muted-foreground">Operations Platform</p>
            </div>
          </Link>
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Navigation */}
        <ScrollArea className="flex-1 px-3 py-4">
          <nav className="space-y-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));

              return (
                <Tooltip key={item.name}>
                  <TooltipTrigger asChild>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <item.icon className={cn(
                        "w-5 h-5",
                        isActive ? "text-emerald-400" : ""
                      )} />
                      <span className="flex-1">{item.name}</span>
                      {isActive && (
                        <ChevronRight className="w-4 h-4 text-emerald-400" />
                      )}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="hidden">
                    {item.name}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </nav>
        </ScrollArea>

        <Separator className="bg-sidebar-border" />

        {/* Footer */}
        <div className="p-4">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            asChild
          >
            <a href="/api/v1/health" target="_blank" rel="noopener noreferrer">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-2" />
              API Status
              <ExternalLink className="w-3 h-3 ml-auto" />
            </a>
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-64">
        <div className="min-h-screen">
          {/* Top gradient line */}
          <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

          <div className="p-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
