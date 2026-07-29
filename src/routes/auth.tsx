import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useThemeMode } from "@/lib/use-theme";
import { currentUser, login } from "@/lib/pleng/api";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Moon, Sun } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { user } = await currentUser();
    if (user) throw redirect({ to: "/library" });
  },
  head: () => ({ meta: [{ title: "Sign in · Pleng Limited" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { isDark, toggleTheme } = useThemeMode();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      navigate({ to: "/library" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid bg-background lg:grid-cols-[0.92fr_1.08fr]">
      <button
        type="button"
        onClick={toggleTheme}
        title={isDark ? "Use light mode" : "Use dark mode"}
        aria-label={isDark ? "Use light mode" : "Use dark mode"}
        className="fixed right-4 top-4 z-20 inline-flex h-9 w-9 items-center justify-center rounded-sm border border-input bg-card text-muted-foreground shadow-sm transition-colors hover:bg-secondary hover:text-foreground"
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      {/* Left: brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-sidebar text-sidebar-foreground relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <img
              src="/pleng-logo.png"
              alt=""
              className="h-9 w-9 rounded-full bg-white object-contain"
            />
            <span className="font-bold tracking-tight text-lg">Pleng Limited</span>
          </div>
        </div>
        <div className="relative z-10 space-y-6 animate-reveal">
          <div className="text-[10px] font-mono uppercase tracking-widest opacity-60">
            Document Library · v1.0
          </div>
          <h1 className="text-5xl font-extrabold tracking-tighter leading-[1.05]">
            The library your firm always needed.
          </h1>
          <p className="text-sm opacity-70 max-w-md leading-relaxed">
            Governance-grade document management for engineering, construction, and professional
            services. Versioned. Searchable. Auditable.
          </p>
          <div className="grid grid-cols-3 gap-4 pt-6 border-t border-background/10">
            {[
              ["11", "Departments"],
              ["∞", "Versions"],
              ["100%", "Audited"],
            ].map(([v, l]) => (
              <div key={l}>
                <div className="text-2xl font-bold font-mono">{v}</div>
                <div className="text-[10px] uppercase tracking-widest opacity-60 mt-1">{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      {/* Right: form */}
      <div className="flex items-center justify-center p-5 sm:p-8 lg:p-12">
        <div className="form-panel w-full max-w-md overflow-hidden animate-reveal">
          <div className="form-panel-header px-6 py-5 sm:px-8">
            <div className="mb-5 flex items-center gap-3 lg:hidden">
              <img
                src="/pleng-logo.png"
                alt=""
                className="h-10 w-10 rounded-full bg-white object-contain shadow-sm"
              />
              <div>
                <div className="text-sm font-bold">Pleng Limited</div>
                <div className="font-mono text-[10px] uppercase text-muted-foreground">
                  Document library
                </div>
              </div>
            </div>
            <div className="text-xs font-bold uppercase text-primary">Secure access</div>
            <h2 className="mt-1 text-2xl font-bold">Sign in</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Use the email added by an administrator and the shared library password.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5 px-6 py-6 sm:px-8">
            <Field label="Email" type="email" value={email} onChange={setEmail} required />
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              required
            />

            <button type="submit" disabled={loading} className="action-primary h-11 w-full px-4">
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Sign in
            </button>
          </form>
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
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  mono?: boolean;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && showPassword ? "text" : type;

  return (
    <label className="block">
      <span className="form-label">{label}</span>
      <span className="relative block">
        <input
          type={inputType}
          value={value}
          required={required}
          onChange={(e) => onChange(e.target.value)}
          className={`form-control ${isPassword ? "pr-11" : ""} ${mono ? "font-mono" : ""}`}
        />
        {isPassword && value.length > 0 && (
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((visible) => !visible)}
            className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </span>
    </label>
  );
}
