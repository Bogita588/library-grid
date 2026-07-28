import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getDashboard } from "@/lib/pleng/api";
import { FileText, Users, FolderOpen, Clock, TrendingUp, Shield } from "lucide-react";
import { getDocumentStatusLabel } from "@/lib/document-status";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · Pleng Limited" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => (await getDashboard()).dashboard,
  });

  const byDept = stats?.byDept ?? [];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="h-14 border-b border-border bg-card/50 backdrop-blur flex items-center gap-3 px-6 shrink-0">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          OVERVIEW
        </div>
        <div className="text-muted-foreground/40">/</div>
        <h1 className="font-semibold text-sm tracking-tight">Dashboard</h1>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Documents" value={stats?.docs ?? 0} icon={FileText} />
          <Stat label="Departments" value={stats?.depts ?? 0} icon={FolderOpen} />
          <Stat label="Users" value={stats?.users ?? 0} icon={Users} />
          <Stat label="Published" value={stats?.statusCounts.published ?? 0} icon={Shield} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-card border border-border rounded-sm">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <h2 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Recently updated
              </h2>
            </div>
            <div className="divide-y divide-border">
              {stats?.recent.length === 0 && (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  No documents yet.
                </div>
              )}
              {stats?.recent.map((d) => (
                <Link
                  key={d.id}
                  to="/library/$docId"
                  params={{ docId: d.id }}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40"
                >
                  <div
                    className="h-6 w-6 rounded-sm flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: `color-mix(in oklch, ${d.departments?.color ?? "oklch(0.43 0.13 198)"} 16%, transparent)`,
                      color: d.departments?.color ?? "oklch(0.43 0.13 198)",
                    }}
                  >
                    <FileText className="h-3 w-3" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{d.title}</div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      {d.document_number} · {d.departments?.code} ·{" "}
                      {getDocumentStatusLabel(d.status)}
                    </div>
                  </div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    {new Date(d.updated_at).toLocaleDateString()}
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className="bg-card border border-border rounded-sm">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
              <h2 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                By department
              </h2>
            </div>
            <div className="p-4 space-y-2">
              {byDept.map((d) => {
                const max = Math.max(1, ...byDept.map((x) => x.count));
                const pct = (d.count / max) * 100;
                return (
                  <Link
                    key={d.id}
                    to="/library"
                    search={{ dept: (d as { slug?: string }).slug }}
                    className="block group"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="h-2 w-2 rounded-sm shrink-0"
                        style={{ backgroundColor: d.color ?? "oklch(0.43 0.13 198)" }}
                      />
                      <span className="text-xs font-medium flex-1 truncate group-hover:text-primary">
                        {d.name}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">{d.count}</span>
                    </div>
                    <div className="h-1 bg-muted rounded-sm overflow-hidden">
                      <div
                        className="h-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: d.color ?? "oklch(0.43 0.13 198)",
                        }}
                      />
                    </div>
                  </Link>
                );
              })}
              {byDept.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-4">
                  No departments configured.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-card border border-border rounded-sm p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          {label}
        </div>
      </div>
      <div className="text-2xl font-bold tracking-tight tabular-nums">{value}</div>
    </div>
  );
}
