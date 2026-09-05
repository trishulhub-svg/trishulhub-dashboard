import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/format";
import { EmptyState } from "./finance-ui";
import { HEALTH_CLASS, HEALTH_LABEL, type AgencyFinanceOverview } from "./finance-view-model";

export function ProjectsView({ data }: { data: AgencyFinanceOverview }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Project financials</h2>
          <p className="text-sm text-muted-foreground">
            Existing projects connected to invoices, expenses, recurring costs
            and tracked hours.
          </p>
        </div>
        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-right">
          <p className="text-[11px] text-muted-foreground">
            Active project value
          </p>
          <p className="font-semibold tabular-nums">
            {formatCurrency(data.summary.activeProjectValue)}
          </p>
        </div>
      </div>

      {data.projects.length === 0 ? (
        <EmptyState
          title="No project finance data"
          description="Create projects and link transactions to see this view."
        />
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {data.projects.map((project) => (
              <Card key={project.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{project.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {project.clientName || "Internal / no client"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={HEALTH_CLASS[project.health]}
                    >
                      {HEALTH_LABEL[project.health]}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <ProjectValue
                      label="Budget"
                      value={
                        project.budget
                          ? formatCurrency(project.budget)
                          : "Not set"
                      }
                    />
                    <ProjectValue
                      label="Invoiced"
                      value={formatCurrency(project.invoiced)}
                    />
                    <ProjectValue
                      label="Collected"
                      value={formatCurrency(project.collected)}
                    />
                    <ProjectValue
                      label="Outstanding"
                      value={formatCurrency(project.outstanding)}
                    />
                    <ProjectValue
                      label="Visible costs"
                      value={formatCurrency(project.recordedCosts)}
                    />
                    <ProjectValue
                      label="Tracked hours"
                      value={project.trackedHours.toLocaleString("en-GB")}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  {[
                    "Project",
                    "Health",
                    "Budget",
                    "Invoiced",
                    "Collected",
                    "Outstanding",
                    "Visible costs",
                    "Hours",
                  ].map((heading, index) => (
                    <th
                      key={heading}
                      className={`px-3 py-3 font-medium ${index > 1 ? "text-right" : ""}`}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.projects.map((project) => (
                  <tr key={project.id} className="border-t">
                    <td className="px-3 py-3">
                      <p className="font-medium">{project.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {project.clientName || "Internal / no client"}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <Badge
                        variant="outline"
                        className={HEALTH_CLASS[project.health]}
                      >
                        {HEALTH_LABEL[project.health]}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {project.budget ? formatCurrency(project.budget) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatCurrency(project.invoiced)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatCurrency(project.collected)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatCurrency(project.outstanding)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatCurrency(project.recordedCosts)}
                      {project.monthlyRecurringCost > 0 && (
                        <p className="text-[10px] text-muted-foreground">
                          incl. {formatCurrency(project.monthlyRecurringCost)}
                          /mo
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {project.trackedHours.toLocaleString("en-GB")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function ProjectValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

export function ClientsView({
  clients,
}: {
  clients: AgencyFinanceOverview["clients"];
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Client commercial view</h2>
        <p className="text-sm text-muted-foreground">
          Billing and collection position grouped by client.
        </p>
      </div>
      {clients.length === 0 ? (
        <EmptyState
          title="No client billing data"
          description="Clients will appear after projects or invoices are connected."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {clients.map((client) => {
            const collectedPercent =
              client.invoiced > 0
                ? Math.min((client.collected / client.invoiced) * 100, 100)
                : 0;
            return (
              <Card key={client.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="h-4 w-4 text-primary" /> {client.name}
                  </CardTitle>
                  <CardDescription>
                    {client.projectCount} linked project
                    {client.projectCount === 1 ? "" : "s"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <ProjectValue
                      label="Invoiced"
                      value={formatCurrency(client.invoiced)}
                    />
                    <ProjectValue
                      label="Collected"
                      value={formatCurrency(client.collected)}
                    />
                    <ProjectValue
                      label="Open"
                      value={formatCurrency(client.outstanding)}
                    />
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                      <span>Collection progress</span>
                      <span>{Math.round(collectedPercent)}%</span>
                    </div>
                    <Progress value={collectedPercent} className="h-1.5" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
