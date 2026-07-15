"use client";

import { BarChart3, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { safeNumber, safeText } from "@/lib/utils";
import type { AnalyticsData } from "./types";
import { BAR_COLORS } from "./types";
import { formatHours } from "./utils";

interface InsightsViewProps {
  analyticsTab: string;
  dateRange: string;
  data: AnalyticsData | null;
  loading: boolean;
  isAdmin: boolean;
  onAnalyticsTab: (v: string) => void;
  onDateRange: (v: string) => void;
}

export function InsightsView({
  analyticsTab,
  dateRange,
  data,
  loading,
  isAdmin,
  onAnalyticsTab,
  onDateRange,
}: InsightsViewProps) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <Tabs value={analyticsTab} onValueChange={onAnalyticsTab}>
          <TabsList>
            <TabsTrigger value="employee">{isAdmin ? "By employee" : "My hours"}</TabsTrigger>
            <TabsTrigger value="project">By project</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={dateRange} onValueChange={onDateRange}>
          <SelectTrigger className="w-full sm:w-40 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">This week</SelectItem>
            <SelectItem value="month">This month</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border py-14 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading insights...</span>
        </div>
      ) : data && data.data.length > 0 ? (
        <section className="rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <div className="th-stat-icon !h-8 !w-8">
              <BarChart3 className="h-3.5 w-3.5" />
            </div>
            <div>
              <h3 className="text-sm font-medium">
                {analyticsTab === "employee"
                  ? isAdmin
                    ? "Hours by employee"
                    : "Your hours"
                  : "Hours by project"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {analyticsTab === "employee" && !isAdmin
                  ? `Total ${formatHours(safeNumber(data.totalHours))} in this period`
                  : `Total ${formatHours(safeNumber(data.totalHours))} across ${data.data.length} ${
                      analyticsTab === "employee" ? "people" : "projects"
                    }`}
              </p>
            </div>
          </div>
          <div className="p-4 space-y-4">
            {data.data.map((item, i) => {
              const name =
                analyticsTab === "employee"
                  ? safeText(item.name, "Unknown")
                  : safeText(item.projectName, "No Project");
              const hours = safeNumber(item.totalHours);
              const maxHours = safeNumber(data.data[0]?.totalHours, 1) || 1;
              const percentage =
                safeNumber(data.totalHours) > 0
                  ? Math.round((hours / safeNumber(data.totalHours)) * 100)
                  : 0;
              const barWidth = Math.max(3, (hours / maxHours) * 100);
              const color = BAR_COLORS[i % BAR_COLORS.length];
              const stableKey = analyticsTab === "employee" ? item.userId : item.projectId;

              return (
                <div key={stableKey || i} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm gap-3">
                    <span className="font-medium truncate min-w-0">{name}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-muted-foreground text-xs tabular-nums">{percentage}%</span>
                      <span className="font-semibold tabular-nums w-16 text-right">
                        {formatHours(hours)}
                      </span>
                    </div>
                  </div>
                  <div className="h-2.5 w-full bg-muted/80 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${color} rounded-full transition-all duration-500 ease-out`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  {analyticsTab === "project" && item.contributorCount != null && isAdmin && (
                    <p className="text-[10px] text-muted-foreground">
                      {item.contributorCount} contributor{item.contributorCount === 1 ? "" : "s"}
                      {item.entries != null ? ` · ${item.entries} entries` : ""}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="rounded-xl border border-border py-14 text-center">
          <BarChart3 className="h-11 w-11 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No data for this period</p>
        </div>
      )}
    </div>
  );
}
