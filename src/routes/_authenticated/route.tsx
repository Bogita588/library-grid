import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useRouterState,
  useNavigate,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useThemeMode } from "@/lib/use-theme";
import { currentUser, listDepartments, logout } from "@/lib/pleng/api";
import {
  LayoutGrid,
  Users,
  LogOut,
  Shield,
  LayoutDashboard,
  Star,
  Menu,
  X,
  Moon,
  Sun,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { user } = await currentUser();
    if (!user) throw redirect({ to: "/auth" });
    return { user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const currentSearch = useRouterState({
    select: (s) => s.location.search as Record<string, unknown>,
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isDark, toggleTheme } = useThemeMode();

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await listDepartments()).departments,
  });

  const isAdmin = user.role === "admin" || user.role === "super_admin";

  async function signOut() {
    await logout();
    toast.success("Signed out");
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-dvh bg-sidebar text-foreground xl:flex">
      <button
        type="button"
        aria-label="Open navigation"
        className={`fixed left-3 top-3 z-30 inline-flex h-10 w-10 items-center justify-center rounded-sm border border-border bg-card text-foreground shadow-md transition-opacity xl:hidden ${
          sidebarOpen ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
        onClick={() => setSidebarOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </button>

      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-foreground/45 backdrop-blur-[1px] xl:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        data-open={sidebarOpen ? "true" : "false"}
        className="dms-sidebar fixed inset-y-0 left-0 z-50 flex h-dvh min-h-0 w-[min(18rem,86vw)] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl xl:sticky xl:top-0 xl:z-auto xl:w-64 xl:shadow-none"
      >
        <div className="h-14 shrink-0 px-4 flex items-center gap-2 border-b border-sidebar-border">
          <img
            src="/pleng-logo.png"
            alt=""
            className="h-8 w-8 rounded-full bg-white object-contain shadow-sm"
          />
          <span className="font-bold tracking-tight text-sm text-sidebar-foreground">
            Pleng Limited
          </span>
          <button
            type="button"
            aria-label="Close navigation"
            className="ml-auto rounded-sm p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground xl:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto p-3 space-y-6">
          <NavSection label="Workspace">
            <NavItem
              to="/dashboard"
              active={pathname === "/dashboard"}
              icon={LayoutDashboard}
              onNavigate={() => setSidebarOpen(false)}
            >
              Dashboard
            </NavItem>
            <NavItem
              to="/library"
              active={pathname === "/library" && !currentSearch.dept}
              icon={LayoutGrid}
              onNavigate={() => setSidebarOpen(false)}
            >
              All documents
            </NavItem>
            <NavItem
              to="/favorites"
              active={pathname === "/favorites"}
              icon={Star}
              onNavigate={() => setSidebarOpen(false)}
            >
              Favorites
            </NavItem>
          </NavSection>

          <NavSection label="Departments" count={departments.length}>
            {departments.map((d) => {
              const to = "/library" as const;
              const active = pathname === to && currentSearch.dept === d.slug;
              return (
                <Link
                  key={d.id}
                  to={to}
                  search={{ dept: d.slug }}
                  onClick={() => setSidebarOpen(false)}
                  className={`group flex items-center gap-2 px-2 py-1.5 rounded-sm text-[13px] transition-colors ${
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-sm shrink-0"
                    style={{ backgroundColor: d.color ?? "oklch(0.43 0.13 198)" }}
                  />
                  <span className="truncate flex-1">{d.name}</span>
                  <span className="font-mono text-[10px] text-sidebar-foreground/45 group-hover:text-sidebar-accent-foreground/70">
                    {d.code}
                  </span>
                </Link>
              );
            })}
          </NavSection>

          {isAdmin && (
            <NavSection label="Administration">
              <NavItem
                to="/admin"
                active={pathname === "/admin"}
                icon={Users}
                onNavigate={() => setSidebarOpen(false)}
              >
                Users & roles
              </NavItem>
            </NavSection>
          )}
        </nav>

        <div className="shrink-0 border-t border-sidebar-border bg-sidebar p-3">
          <div className="flex items-center gap-2 px-1 py-2">
            <div className="h-8 w-8 bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center rounded-sm text-xs font-bold uppercase shadow-sm">
              {(user.full_name ?? user.email ?? "?").slice(0, 1)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate text-sidebar-foreground">
                {user.full_name ?? "—"}
              </div>
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-sidebar-foreground/55 font-mono">
                <Shield className="h-2.5 w-2.5" />
                {user.role.replace("_", " ")}
              </div>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              title={isDark ? "Use light mode" : "Use dark mode"}
              aria-label={isDark ? "Use light mode" : "Use dark mode"}
              className="rounded-sm p-1.5 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={signOut}
              title="Sign out"
              aria-label="Sign out"
              className="p-1.5 rounded-sm text-sidebar-foreground/60 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col bg-background">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-card/95 px-3 pl-16 backdrop-blur xl:hidden">
          <div className="min-w-0">
            <div className="text-sm font-bold tracking-tight">Pleng Limited</div>
            <div className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {user.role.replace("_", " ")}
            </div>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            title={isDark ? "Use light mode" : "Use dark mode"}
            aria-label={isDark ? "Use light mode" : "Use dark mode"}
            className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-sm border border-input bg-card text-muted-foreground shadow-sm transition-colors hover:bg-secondary hover:text-foreground"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </header>

        <main className="flex min-w-0 flex-1 flex-col bg-background">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavSection({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between px-2 mb-1.5">
        <div className="text-[10px] font-mono uppercase tracking-widest text-sidebar-foreground/55">
          {label}
        </div>
        {count !== undefined && (
          <div className="text-[10px] font-mono text-sidebar-foreground/45">{count}</div>
        )}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function NavItem({
  to,
  icon: Icon,
  active,
  children,
  onNavigate,
}: {
  to: "/library" | "/admin" | "/dashboard" | "/favorites";
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  children: React.ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-sm text-[13px] transition-colors ${
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{children}</span>
    </Link>
  );
}
