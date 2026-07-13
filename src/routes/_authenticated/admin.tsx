import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAllUsers, updateUserRole } from "@/lib/users.functions";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Shield } from "lucide-react";
import { toast } from "sonner";

const ROLES = [
  { value: "super_admin", label: "Super admin" },
  { value: "admin", label: "Admin" },
  { value: "dept_manager", label: "Dept. manager" },
  { value: "contributor", label: "Contributor" },
  { value: "viewer", label: "Viewer" },
] as const;

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Users & roles · Arca-DMS" }] }),
  component: AdminPage,
});

function AdminPage() {
  const fetchUsers = useServerFn(listAllUsers);
  const setRole = useServerFn(updateUserRole);
  const qc = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => fetchUsers(),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await supabase.from("departments").select("*").order("name")).data ?? [],
  });

  async function change(userId: string, role: string) {
    try {
      await setRole({
        data: { user_id: userId, role: role as (typeof ROLES)[number]["value"] },
      });
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="h-14 border-b border-border bg-card/50 backdrop-blur flex items-center gap-3 px-6 shrink-0">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">ADMIN</div>
        <div className="text-muted-foreground/40">/</div>
        <h1 className="font-semibold text-sm tracking-tight">Users & roles</h1>
        <div className="ml-2 px-1.5 py-0.5 bg-muted rounded-sm text-[10px] font-mono text-muted-foreground">
          {users.length}
        </div>
      </header>

      <div className="p-6 overflow-auto flex-1">
        <div className="max-w-5xl">
          <div className="mb-6 p-4 border border-border rounded-sm bg-card">
            <div className="flex items-start gap-3">
              <Shield className="h-4 w-4 text-primary mt-0.5" />
              <div className="text-xs text-muted-foreground leading-relaxed">
                Every registered user starts as <b className="text-foreground">Viewer</b> (except the first
                account, which becomes <b className="text-foreground">Super admin</b> automatically). Assign each
                user a role appropriate to their department and responsibility level.
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading users…
            </div>
          ) : (
            <div className="bg-card border border-border rounded-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    <th className="text-left px-4 py-2 font-medium">Name</th>
                    <th className="text-left px-4 py-2 font-medium">Email</th>
                    <th className="text-left px-4 py-2 font-medium">Department</th>
                    <th className="text-left px-4 py-2 font-medium">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium">{u.full_name ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {departments.find((d) => d.id === u.department_id)?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={u.role}
                          onChange={(e) => change(u.id, e.target.value)}
                          className="rounded-sm border border-input bg-background px-2 py-1 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                        >
                          {ROLES.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
