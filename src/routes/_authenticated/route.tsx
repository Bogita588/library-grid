import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useRouterState,
  useNavigate,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LayoutGrid, Users, LogOut, Search, FolderTree, Shield } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data: profile } = useQuery({
    queryKey: ["profile", user.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles").select("*").eq("id", user.id).maybeSingle();
      return data;
    },
  });

  const { data: role } = useQuery({
    queryKey: ["role", user.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      return data?.role ?? "viewer";
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("departments").select("*").order("name");
      return data ?? [];
    },
  });

  const isAdmin = role === "admin" || role === "super_admin";

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-sidebar flex flex-col shrink-0">
        <div className="h-14 px-4 flex items-center gap-2 border-b border-border">
          <div className="h-7 w-7 bg-foreground text-background flex items-center justify-center">
            <span className="font-mono font-bold text-xs">A</span>
          </div>
          <span className="font-bold tracking-tight text-sm">ARCA-DMS</span>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-6">
          <NavSection label="Library">
            <NavItem to="/library" active={pathname === "/library"} icon={LayoutGrid}>
              All documents
            </NavItem>
          </NavSection>

          <NavSection label="Departments" count={departments.length}>
            {departments.map((d) => {
              const to = "/library" as const;
              const active = pathname === to && false; // filter via query, not path
              return (
                <Link
                  key={d.id}
                  to={to}
                  search={{ dept: d.slug }}
                  className={`group flex items-center gap-2 px-2 py-1.5 rounded-sm text-[13px] transition-colors ${
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-sm shrink-0"
                    style={{ backgroundColor: d.color ?? "oklch(0.52 0.19 258)" }}
                  />
                  <span className="truncate flex-1">{d.name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground/60">
                    {d.code}
                  </span>
                </Link>
              );
            })}
          </NavSection>

          {isAdmin && (
            <NavSection label="Administration">
              <NavItem to="/admin" active={pathname === "/admin"} icon={Users}>
                Users & roles
              </NavItem>
            </NavSection>
          )}
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2 px-1 py-2">
            <div className="h-8 w-8 bg-primary text-primary-foreground flex items-center justify-center rounded-sm text-xs font-bold uppercase">
              {(profile?.full_name ?? user.email ?? "?").slice(0, 1)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate">{profile?.full_name ?? "—"}</div>
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
                <Shield className="h-2.5 w-2.5" />
                {role?.replace("_", " ")}
              </div>
            </div>
            <button
              onClick={signOut}
              title="Sign out"
              className="p-1.5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}

function NavSection({
  label, count, children,
}: {
  label: string; count?: number; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between px-2 mb-1.5">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          {label}
        </div>
        {count !== undefined && (
          <div className="text-[10px] font-mono text-muted-foreground/60">{count}</div>
        )}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function NavItem({
  to, icon: Icon, active, children,
}: {
  to: "/library" | "/admin";
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-sm text-[13px] transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-foreground hover:bg-sidebar-accent"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{children}</span>
    </Link>
  );
}

// Also export a suppress-unused hint for icons used by children
export const _icons = { FolderTree, Search };
