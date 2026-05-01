"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Code2, Crosshair, DollarSign, ClipboardList, Users, PenTool, HeadphonesIcon,
  ArrowRight, Bot, MessageSquare, Calendar, Zap, Brain,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_COLORS, AGENT_TYPES } from "@/lib/types";
import type { AgentStatus, AgentType } from "@/lib/types";

const agentIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  DEV: Code2,
  CLIENT_HUNTER: Crosshair,
  FINANCE: DollarSign,
  PROJECT_MANAGER: ClipboardList,
  HR: Users,
  CONTENT: PenTool,
  SUPPORT: HeadphonesIcon,
};

export default function AgentsPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents", { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        // Handle API error responses that return objects instead of arrays
        if (Array.isArray(data)) {
          setAgents(data);
        } else if (data && typeof data === 'object' && data.error) {
          console.error('API error fetching agents:', data.error, data.details);
          setAgents([]);
        } else {
          setAgents([]);
        }
      } else {
        console.error('Failed to fetch agents:', res.status, await res.text().catch(() => ''));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">AI Agents</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-56 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Agents</h1>
          <p className="text-muted-foreground text-sm">Manage and interact with your AI-powered agents</p>
        </div>
        <Badge variant="outline" className="text-xs">
          {agents.length} agents available
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(agents as any[]).length === 0 ? (
          <div className="col-span-full text-center py-12">
            <Bot className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No agents found. Please check your database configuration.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => { setLoading(true); fetchAgents(); }}>
              Refresh
            </Button>
          </div>
        ) : (agents as any[]).map((agent) => {
          const Icon = agentIcons[agent.type] || Bot;
          const agentConfig = AGENT_TYPES[agent.type as AgentType];
          const statusColor = STATUS_COLORS[agent.status as AgentStatus] || "bg-gray-400";
          const chatCount = agent._count?.chats || agent._count?.conversations || 0;

          // Parse role config features
          let features: Record<string, boolean> = {};
          try {
            if (agent.roleConfig?.features) {
              features = typeof agent.roleConfig.features === 'string'
                ? JSON.parse(agent.roleConfig.features)
                : agent.roleConfig.features;
            }
          } catch {}

          // Parse quick actions count
          let quickActionsCount = 0;
          try {
            if (agent.roleConfig?.quickActions) {
              const actions = typeof agent.roleConfig.quickActions === 'string'
                ? JSON.parse(agent.roleConfig.quickActions)
                : agent.roleConfig.quickActions;
              quickActionsCount = Array.isArray(actions) ? actions.length : 0;
            }
          } catch {}

          return (
            <Card
              key={agent.id}
              className="hover:shadow-md transition-all cursor-pointer border hover:border-primary/20 group"
              onClick={() => router.push(`/dashboard/agents/${agent.id}`)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-11 w-11 rounded-lg ${agentConfig?.bgColor || 'bg-muted'} flex items-center justify-center`}>
                      <Icon className={`h-5 w-5 ${agentConfig?.color || "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {agent.name}
                        <div className={`h-2 w-2 rounded-full ${statusColor}`} />
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">{agent.model}</CardDescription>
                    </div>
                  </div>
                  <Badge
                    variant={agent.status === "IDLE" ? "secondary" : agent.status === "RUNNING" ? "default" : agent.status === "ERROR" ? "destructive" : "outline"}
                    className="text-xs"
                  >
                    {agent.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {agentConfig?.description || agent.description}
                </p>

                {/* Features Badges */}
                <div className="flex flex-wrap gap-1.5">
                  {features.agentic && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300 border-purple-200 dark:border-purple-800">
                      <Brain className="h-2.5 w-2.5 mr-0.5" /> Agentic
                    </Badge>
                  )}
                  {features.webSearch && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      <Zap className="h-2.5 w-2.5 mr-0.5" /> Web Search
                    </Badge>
                  )}
                  {features.crossAgent && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      <MessageSquare className="h-2.5 w-2.5 mr-0.5" /> Cross-Agent
                    </Badge>
                  )}
                  {features.approvalRequired && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      Approval Gate
                    </Badge>
                  )}
                  {quickActionsCount > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {quickActionsCount} Actions
                    </Badge>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {chatCount} chats
                    </span>
                  </div>
                  <Button size="sm" variant="ghost" className="group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    Chat <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
