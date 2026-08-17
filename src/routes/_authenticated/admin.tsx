import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createUser,
  listDepartments,
  listUsers,
  updateUserRole,
  type AppRole,
} from "@/lib/pleng/api";
import { Loader2, Shield, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const ROLES = [
  { value: "super_admin", label: "Super admin" },
  { value: "admin", label: "Admin" },
  { value: "dept_manager", label: "Dept. manager" },
  { value: "contributor", label: "Normal user" },
  { value: "viewer", label: "Viewer" },
] as const;

const CREATE_ROLES = [
  { value: "contributor", label: "Normal user" },
  { value: "admin", label: "Admin" },
] as const;

const DEFAULT_LIBRARY_PASSWORD = "docs.pleng";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Users & roles · Pleng Limited" }] }),
  component: AdminPage,
});

function AdminPage() {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"contributor" | "admin">("contributor");
  const [departmentId, setDepartmentId] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await listUsers()).users,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await listDepartments()).departments,
  });

  async function change(userId: string, nextRole: string) {
    try {
      await updateUserRole(userId, nextRole as AppRole);
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await createUser({
        full_name: fullName.trim(),
        email: email.trim(),
        role,
        department_id: departmentId || null,
      });
      toast.success("User added");
      setFullName("");
      setEmail("");
      setRole("contributor");
      setDepartmentId("");
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add user");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="shrink-0 border-b border-border bg-card px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Admin
            </div>
            <h1 className="text-lg font-bold tracking-tight">Users & roles</h1>
          </div>
          <div className="sm:ml-auto rounded-sm border border-border bg-secondary px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            {users.length} users
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="form-panel overflow-hidden">
            <div className="form-panel-header px-4 py-4 sm:px-5">
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-primary" />
                <h2 className="text-base font-bold">Add user</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Create a library account with the shared password for quick access.
              </p>
            </div>
            <form
              onSubmit={addUser}
              className="grid gap-4 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-4"
            >
              <Field label="Full name" value={fullName} onChange={setFullName} required />
              <Field label="Email" type="email" value={email} onChange={setEmail} required />
              <label className="block">
                <span className="form-label">User type</span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as typeof role)}
                  className="form-select"
                >
                  {CREATE_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="form-label">Department</span>
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="form-select"
                >
                  <option value="">No department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} · {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="md:col-span-2 xl:col-span-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="form-hint flex items-start gap-2">
                  <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  New users sign in with the shared password{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {DEFAULT_LIBRARY_PASSWORD}
                  </span>
                  . Normal users can upload, search, view, and download PDF documents. Admins can
                  also delete and share.
                </div>
                <button
                  type="submit"
                  disabled={creating || !fullName || !email}
                  className="action-primary h-10 px-4"
                >
                  {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Add user
                </button>
              </div>
            </form>
          </section>

          {isLoading ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading users…
            </div>
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-lg border border-border bg-card shadow-sm md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary text-xs font-bold uppercase text-muted-foreground">
                      <th className="text-left px-4 py-3 font-medium">Name</th>
                      <th className="text-left px-4 py-3 font-medium">Email</th>
                      <th className="text-left px-4 py-3 font-medium">Department</th>
                      <th className="text-left px-4 py-3 font-medium">Role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-secondary/50">
                        <td className="px-4 py-3 font-medium">{u.full_name ?? "—"}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{u.email}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {departments.find((d) => d.id === u.department_id)?.name ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <RoleSelect value={u.role} onChange={(next) => change(u.id, next)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 md:hidden">
                {users.map((u) => (
                  <article
                    key={u.id}
                    className="rounded-lg border border-border bg-card p-4 shadow-sm"
                  >
                    <div className="font-semibold">{u.full_name ?? "—"}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{u.email}</div>
                    <div className="mt-3 text-[10px] font-mono uppercase text-muted-foreground">
                      {departments.find((d) => d.id === u.department_id)?.name ?? "No department"}
                    </div>
                    <div className="mt-3">
                      <RoleSelect value={u.role} onChange={(next) => change(u.id, next)} />
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="form-label">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="form-control"
      />
    </label>
  );
}

function RoleSelect({ value, onChange }: { value: string; onChange: (role: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="form-select text-sm md:w-44"
    >
      {ROLES.map((r) => (
        <option key={r.value} value={r.value}>
          {r.label}
        </option>
      ))}
    </select>
  );
}
