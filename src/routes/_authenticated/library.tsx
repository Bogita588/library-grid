import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  Search, Upload, FileText, Filter, LayoutGrid, List,
  Shield, Loader2, Download,
} from "lucide-react";
import { toast } from "sonner";

const searchSchema = z.object({
  q: z.string().optional(),
  dept: z.string().optional(),
  status: z.enum(["draft", "under_review", "approved", "archived"]).optional(),
});

export const Route = createFileRoute("/_authenticated/library")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({ meta: [{ title: "Library · Arca-DMS" }] }),
  component: LibraryPage,
});

function LibraryPage() {
  const { q, dept, status } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [uploadOpen, setUploadOpen] = useState(false);
  const qc = useQueryClient();

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await supabase.from("departments").select("*").order("name")).data ?? [],
  });

  const deptId = useMemo(
    () => departments.find((d) => d.slug === dept)?.id,
    [departments, dept],
  );

  const { data: documents = [], isLoading } = useQuery<DocRow[]>({
    queryKey: ["documents", { q, deptId, status }],
    queryFn: async () => {
      let query = supabase
        .from("documents")
        .select("*, departments(name, code, color)")
        .order("updated_at", { ascending: false })
        .limit(200);
      if (deptId) query = query.eq("department_id", deptId);
      if (status) query = query.eq("status", status);
      if (q && q.trim()) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%,keywords.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as DocRow[];
    },
  });

  const currentDept = departments.find((d) => d.slug === dept);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <header className="h-14 border-b border-border bg-card/50 backdrop-blur flex items-center gap-3 px-6 shrink-0">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          {currentDept ? currentDept.code : "ALL"}
        </div>
        <div className="text-muted-foreground/40">/</div>
        <h1 className="font-semibold text-sm tracking-tight">
          {currentDept ? currentDept.name : "All documents"}
        </h1>
        <div className="ml-2 px-1.5 py-0.5 bg-muted rounded-sm text-[10px] font-mono text-muted-foreground">
          {documents.length}
        </div>

        <div className="flex-1" />

        {/* Search */}
        <div className="relative w-80">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            defaultValue={q ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              navigate({ search: (prev: typeof Route.types.searchSchemaInput) => ({ ...prev, q: v || undefined }), replace: true });
            }}
            placeholder="Search documents, keywords, tags…"
            className="w-full pl-8 pr-3 py-1.5 bg-background border border-input rounded-sm text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        <button
          onClick={() => setUploadOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
        >
          <Upload className="h-3.5 w-3.5" /> Upload
        </button>
      </header>

      {/* Filter bar */}
      <div className="h-11 border-b border-border px-6 flex items-center gap-2 shrink-0 bg-background">
        <Filter className="h-3 w-3 text-muted-foreground" />
        <FilterChip
          label="All"
          active={!status}
          onClick={() => navigate({ search: (p: Record<string, unknown>) => ({ ...p, status: undefined }), replace: true })}
        />
        {(["draft", "under_review", "approved", "archived"] as const).map((s) => (
          <FilterChip
            key={s}
            label={s.replace("_", " ")}
            active={status === s}
            onClick={() => navigate({ search: (p: Record<string, unknown>) => ({ ...p, status: s }), replace: true })}
          />
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-0.5 border border-input rounded-sm p-0.5">
          <button
            onClick={() => setView("grid")}
            className={`p-1 rounded-sm ${view === "grid" ? "bg-muted text-foreground" : "text-muted-foreground"}`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setView("list")}
            className={`p-1 rounded-sm ${view === "list" ? "bg-muted text-foreground" : "text-muted-foreground"}`}
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading library…
          </div>
        ) : documents.length === 0 ? (
          <EmptyState onUpload={() => setUploadOpen(true)} />
        ) : view === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {documents.map((doc) => <DocCard key={doc.id} doc={doc} />)}
          </div>
        ) : (
          <DocTable docs={documents} />
        )}
      </div>

      {uploadOpen && (
        <UploadModal
          departments={departments}
          defaultDeptId={deptId}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            qc.invalidateQueries({ queryKey: ["documents"] });
            setUploadOpen(false);
          }}
        />
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-sm text-[11px] font-medium uppercase tracking-wider transition-colors ${
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

type DocRow = {
  id: string; title: string; document_number: string | null;
  description: string | null; status: string; confidentiality: string;
  current_version: number; updated_at: string;
  departments?: { name: string; code: string; color: string | null } | null;
  profiles?: { full_name: string | null } | null;
};

function DocCard({ doc }: { doc: DocRow }) {
  const color = doc.departments?.color ?? "oklch(0.52 0.19 258)";
  return (
    <div className="group bg-card border border-border rounded-sm p-4 hover:border-primary/50 hover:shadow-sm transition-all animate-reveal">
      <div className="flex items-start justify-between mb-3">
        <div
          className="h-8 w-8 flex items-center justify-center rounded-sm"
          style={{ backgroundColor: `${color}20`, color }}
        >
          <FileText className="h-4 w-4" />
        </div>
        <StatusBadge status={doc.status} />
      </div>
      <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mb-1">
        {doc.document_number ?? "—"}
      </div>
      <div className="font-semibold text-sm text-foreground leading-snug line-clamp-2 min-h-[2.5rem]">
        {doc.title}
      </div>
      {doc.description && (
        <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{doc.description}</p>
      )}
      <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        <span>V{doc.current_version}</span>
        <span className="text-muted-foreground/40">·</span>
        <span className="truncate">{doc.departments?.code}</span>
        <span className="flex-1" />
        {doc.confidentiality !== "public" && (
          <Shield className="h-2.5 w-2.5 text-accent" />
        )}
      </div>
    </div>
  );
}

function DocTable({ docs }: { docs: DocRow[] }) {
  return (
    <div className="bg-card border border-border rounded-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            <th className="text-left px-4 py-2 font-medium">Ref</th>
            <th className="text-left px-4 py-2 font-medium">Title</th>
            <th className="text-left px-4 py-2 font-medium">Dept</th>
            <th className="text-left px-4 py-2 font-medium">Status</th>
            <th className="text-left px-4 py-2 font-medium">Ver</th>
            <th className="text-left px-4 py-2 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/30">
              <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{d.document_number ?? "—"}</td>
              <td className="px-4 py-2.5 font-medium">{d.title}</td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">{d.departments?.code}</td>
              <td className="px-4 py-2.5"><StatusBadge status={d.status} /></td>
              <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">V{d.current_version}</td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">
                {new Date(d.updated_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    under_review: "bg-warning/15 text-warning",
    approved: "bg-success/15 text-success",
    archived: "bg-muted text-muted-foreground/60",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[9px] font-mono uppercase tracking-widest ${map[status] ?? "bg-muted"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center animate-reveal">
      <div className="h-14 w-14 rounded-sm border-2 border-dashed border-border flex items-center justify-center mb-4">
        <FileText className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        Empty shelf
      </div>
      <h3 className="mt-1 font-bold tracking-tight">No documents yet</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm">
        Upload the first document to start building the library.
      </p>
      <button
        onClick={onUpload}
        className="mt-5 inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
      >
        <Upload className="h-3.5 w-3.5" /> Upload document
      </button>
    </div>
  );
}

/* --------------------------- Upload modal --------------------------- */

type Dept = { id: string; name: string; code: string };

function UploadModal({
  departments, defaultDeptId, onClose, onUploaded,
}: {
  departments: Dept[];
  defaultDeptId: string | undefined;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deptId, setDeptId] = useState<string>(defaultDeptId ?? departments[0]?.id ?? "");
  const [confidentiality, setConfidentiality] = useState<"public" | "internal" | "department" | "confidential" | "strictly_confidential">("internal");
  const [uploading, setUploading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title || !deptId) return;
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      const path = `${deptId}/${crypto.randomUUID()}-${file.name}`;

      const { error: upErr } = await supabase.storage
        .from("documents").upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;

      const { data: doc, error: docErr } = await supabase
        .from("documents")
        .insert({
          title, description: description || null,
          department_id: deptId,
          confidentiality,
          status: "draft",
          current_version: 1,
          owner_id: uid,
          uploaded_by: uid,
        })
        .select("id").single();
      if (docErr) throw docErr;

      const { error: vErr } = await supabase.from("document_versions").insert({
        document_id: doc.id,
        version_number: 1,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        storage_path: path,
        uploaded_by: uid,
      });
      if (vErr) throw vErr;

      toast.success("Document uploaded");
      onUploaded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-sm w-full max-w-lg shadow-xl animate-reveal">
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              New entry
            </div>
            <h2 className="font-bold tracking-tight text-sm">Upload document</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
        </div>
        <form onSubmit={onSubmit} className="p-5 space-y-4">
          <label className="block">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              File
            </span>
            <input
              type="file" required
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !title) setTitle(f.name.replace(/\.[^/.]+$/, ""));
              }}
              className="mt-1.5 block w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-sm file:border-0 file:bg-foreground file:text-background file:text-[10px] file:font-bold file:uppercase file:tracking-wider file:cursor-pointer"
            />
          </label>
          <Input label="Title" value={title} onChange={setTitle} required />
          <Input label="Description" value={description} onChange={setDescription} textarea />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Department" value={deptId} onChange={setDeptId}
              options={departments.map((d) => ({ value: d.id, label: `${d.code} · ${d.name}` }))} />
            <Select label="Confidentiality" value={confidentiality}
              onChange={(v) => setConfidentiality(v as typeof confidentiality)}
              options={[
                { value: "public", label: "Public" },
                { value: "internal", label: "Internal" },
                { value: "department", label: "Department" },
                { value: "confidential", label: "Confidential" },
                { value: "strictly_confidential", label: "Strictly confidential" },
              ]} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            <button type="submit" disabled={uploading || !file}
              className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {uploading && <Loader2 className="h-3 w-3 animate-spin" />}
              Upload
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Input({
  label, value, onChange, required, textarea,
}: { label: string; value: string; onChange: (v: string) => void; required?: boolean; textarea?: boolean }) {
  const cls = "mt-1.5 block w-full rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring";
  return (
    <label className="block">
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className={cls} />
      ) : (
        <input value={value} required={required} onChange={(e) => onChange(e.target.value)} className={cls} />
      )}
    </label>
  );
}

function Select({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="block">
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 block w-full rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
