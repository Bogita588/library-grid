import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { verifyCompanyCode } from "@/lib/access.functions";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/library" });
  },
  head: () => ({ meta: [{ title: "Sign in · Arca-DMS" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [code, setCode] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "register") {
        const { ok } = await verifyCompanyCode({ data: { code } });
        if (!ok) { toast.error("Invalid company access code"); setLoading(false); return; }
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}/library`,
            data: { full_name: fullName },
          },
        });
        if (error) { toast.error(error.message); setLoading(false); return; }
        toast.success("Account created");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { toast.error(error.message); setLoading(false); return; }
      }
      navigate({ to: "/library" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left: brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-foreground text-background relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 border-2 border-background flex items-center justify-center">
              <span className="font-mono font-bold text-sm">A</span>
            </div>
            <span className="font-bold tracking-tight text-lg">ARCA-DMS</span>
          </div>
        </div>
        <div className="relative z-10 space-y-6 animate-reveal">
          <div className="text-[10px] font-mono uppercase tracking-widest opacity-60">
            Document Governance · v1.0
          </div>
          <h1 className="text-5xl font-extrabold tracking-tighter leading-[1.05]">
            The library your firm always needed.
          </h1>
          <p className="text-sm opacity-70 max-w-md leading-relaxed">
            Governance-grade document management for engineering, construction, and
            professional services. Versioned. Searchable. Auditable.
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
      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm space-y-8 animate-reveal">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              {mode === "login" ? "Access · 01" : "Register · 01"}
            </div>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              {mode === "login" ? "Sign in" : "Create account"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "login"
                ? "Enter your credentials to access the library."
                : "Company access code required."}
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {mode === "register" && (
              <>
                <Field label="Full name" value={fullName} onChange={setFullName} required />
                <Field
                  label="Company access code" type="password"
                  value={code} onChange={setCode} required
                  mono
                />
              </>
            )}
            <Field label="Email" type="email" value={email} onChange={setEmail} required />
            <Field label="Password" type="password" value={password} onChange={setPassword} required />

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="pt-4 border-t border-border">
            <button
              onClick={() => setMode(mode === "login" ? "register" : "login")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {mode === "login"
                ? "New here? Register with company code →"
                : "← Already have an account? Sign in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", required, mono,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean; mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1.5 block w-full rounded-sm border border-input bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring ${mono ? "font-mono tracking-wider" : ""}`}
      />
    </label>
  );
}
