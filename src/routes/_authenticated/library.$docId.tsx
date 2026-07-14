import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft, Download, FileText, Loader2, Shield, Upload, History, Trash2, Star,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/library/$docId")({
  head: () => ({ meta: [{ title: "Document · Arca-DMS" }] }),
  component: DocumentPage,
});

type Version = {
  id: string;
  version_number: number;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  storage_path: string;
  created_at: string;
};

function DocumentPage() {
  const { docId } = Route.useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadingNewVersion, setUploadingNewVersion] = useState(false);

  const { data: doc, isLoading } = useQuery({
    queryKey: ["document", docId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*, departments(name, code, color)")
        .eq("id", docId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: versions = [] } = useQuery<Version[]>({
    queryKey: ["document-versions", docId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_versions")
        .select("*")
        .eq("document_id", docId)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Version[];
    },
  });

  const currentVersion = versions[0];

  const { data: favorite } = useQuery({
    queryKey: ["favorite", docId],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return null;
      const { data } = await supabase
        .from("favorites")
        .select("id")
        .eq("user_id", userData.user.id)
        .eq("document_id", docId)
        .maybeSingle();
      return data;
    },
  });

  async function toggleFavorite() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    if (favorite) {
      await supabase.from("favorites").delete().eq("id", favorite.id);
    } else {
      await supabase.from("favorites").insert({ user_id: userData.user.id, document_id: docId });
    }
    qc.invalidateQueries({ queryKey: ["favorite", docId] });
    qc.invalidateQueries({ queryKey: ["favorites"] });
  }

  // Sign the current version for preview
  useEffect(() => {
    let cancelled = false;
    if (!currentVersion) { setPreviewUrl(null); return; }
    (async () => {
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(currentVersion.storage_path, 60 * 10);
      if (!cancelled && !error) setPreviewUrl(data?.signedUrl ?? null);
    })();
    return () => { cancelled = true; };
  }, [currentVersion]);

  async function downloadVersion(v: Version) {
    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(v.storage_path, 60, { download: v.file_name });
    if (error || !data) { toast.error("Could not create download link"); return; }
    window.open(data.signedUrl, "_blank");
  }

  async function onNewVersion(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !doc) return;
    setUploadingNewVersion(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      const nextVersion = (doc.current_version ?? 0) + 1;
      const path = `${doc.department_id}/${crypto.randomUUID()}-${file.name}`;

      const { error: upErr } = await supabase.storage
        .from("documents").upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;

      const { error: vErr } = await supabase.from("document_versions").insert({
        document_id: doc.id,
        version_number: nextVersion,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        storage_path: path,
        uploaded_by: uid,
      });
      if (vErr) throw vErr;

      const { error: dErr } = await supabase.from("documents")
        .update({ current_version: nextVersion, updated_at: new Date().toISOString() })
        .eq("id", doc.id);
      if (dErr) throw dErr;

      toast.success(`Version ${nextVersion} uploaded`);
      qc.invalidateQueries({ queryKey: ["document", docId] });
      qc.invalidateQueries({ queryKey: ["document-versions", docId] });
      qc.invalidateQueries({ queryKey: ["documents"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingNewVersion(false);
      e.target.value = "";
    }
  }

  async function deleteDocument() {
    if (!doc) return;
    if (!confirm(`Delete "${doc.title}" and all versions? This cannot be undone.`)) return;
    try {
      // Delete files
      const paths = versions.map((v) => v.storage_path);
      if (paths.length) await supabase.storage.from("documents").remove(paths);
      const { error } = await supabase.from("documents").delete().eq("id", doc.id);
      if (error) throw error;
      toast.success("Document deleted");
      qc.invalidateQueries({ queryKey: ["documents"] });
      router.navigate({ to: "/library" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <div className="text-sm text-muted-foreground">Document not found.</div>
        <Link to="/library" className="text-xs font-bold uppercase tracking-wider underline">
          Back to library
        </Link>
      </div>
    );
  }

  const mime = currentVersion?.mime_type ?? "";
  const isPdf = mime === "application/pdf";
  const isImage = mime.startsWith("image/");
  const isText = mime.startsWith("text/") || mime === "application/json";

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="h-14 border-b border-border bg-card/50 backdrop-blur flex items-center gap-3 px-6 shrink-0">
        <Link
          to="/library"
          className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Library
        </Link>
        <div className="text-muted-foreground/40">/</div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          {doc.document_number ?? "—"}
        </div>
        <div className="text-muted-foreground/40">/</div>
        <h1 className="font-semibold text-sm tracking-tight truncate">{doc.title}</h1>

        <div className="flex-1" />

        <label className="inline-flex items-center gap-1.5 rounded-sm border border-input px-3 py-1.5 text-xs font-bold uppercase tracking-wider hover:bg-muted cursor-pointer">
          {uploadingNewVersion
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Upload className="h-3.5 w-3.5" />}
          New version
          <input type="file" hidden onChange={onNewVersion} disabled={uploadingNewVersion} />
        </label>

        {currentVersion && (
          <button
            onClick={() => downloadVersion(currentVersion)}
            className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </button>
        )}

        <button
          onClick={toggleFavorite}
          title={favorite ? "Unpin" : "Pin to favorites"}
          className="inline-flex items-center gap-1.5 rounded-sm border border-input px-2 py-1.5 text-xs hover:bg-muted"
        >
          <Star className={`h-3.5 w-3.5 ${favorite ? "fill-warning text-warning" : "text-muted-foreground"}`} />
        </button>

        <button
          onClick={deleteDocument}
          title="Delete document"
          className="inline-flex items-center gap-1.5 rounded-sm border border-input px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] min-h-0">
        {/* Preview */}
        <div className="min-h-0 overflow-hidden bg-muted/30 border-r border-border">
          {!currentVersion ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              No file attached.
            </div>
          ) : !previewUrl ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Preparing preview…
            </div>
          ) : isPdf ? (
            <iframe src={previewUrl} className="w-full h-full" title={doc.title} />
          ) : isImage ? (
            <div className="w-full h-full flex items-center justify-center p-6">
              <img src={previewUrl} alt={doc.title} className="max-w-full max-h-full object-contain" />
            </div>
          ) : isText ? (
            <iframe src={previewUrl} className="w-full h-full bg-background" title={doc.title} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-6">
              <div className="h-14 w-14 rounded-sm border-2 border-dashed border-border flex items-center justify-center">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <div className="text-sm font-semibold">Preview not available</div>
                <div className="text-xs text-muted-foreground mt-1">
                  This file type ({mime || "unknown"}) can't be previewed in the browser.
                </div>
              </div>
              <button
                onClick={() => downloadVersion(currentVersion)}
                className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
              >
                <Download className="h-3.5 w-3.5" /> Download file
              </button>
            </div>
          )}
        </div>

        {/* Sidebar: metadata + versions */}
        <aside className="overflow-y-auto p-5 space-y-6 bg-card">
          <section>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
              Metadata
            </div>
            <dl className="space-y-2 text-xs">
              <Row label="Status" value={doc.status.replace("_", " ")} />
              <Row label="Department" value={doc.departments?.name ?? "—"} />
              <Row label="Version" value={`V${doc.current_version}`} mono />
              <Row
                label="Confidentiality"
                value={
                  <span className="inline-flex items-center gap-1">
                    {doc.confidentiality !== "public" && <Shield className="h-3 w-3 text-accent" />}
                    {doc.confidentiality.replace("_", " ")}
                  </span>
                }
              />
              <Row label="Updated" value={new Date(doc.updated_at).toLocaleString()} />
              <Row label="Created" value={new Date(doc.created_at).toLocaleDateString()} />
            </dl>
            {doc.description && (
              <div className="mt-4">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
                  Description
                </div>
                <p className="text-xs leading-relaxed text-foreground/80">{doc.description}</p>
              </div>
            )}
          </section>

          <section>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
              <History className="h-3 w-3" /> Version history
            </div>
            <div className="space-y-1.5">
              {versions.map((v) => (
                <button
                  key={v.id}
                  onClick={() => downloadVersion(v)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm border border-border hover:border-primary/50 hover:bg-muted text-left"
                >
                  <span className="font-mono text-[10px] font-bold text-foreground">V{v.version_number}</span>
                  <span className="flex-1 truncate text-xs">{v.file_name}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {v.file_size ? formatSize(v.file_size) : ""}
                  </span>
                  <Download className="h-3 w-3 text-muted-foreground" />
                </button>
              ))}
              {versions.length === 0 && (
                <div className="text-xs text-muted-foreground">No versions yet.</div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-24 shrink-0 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className={`flex-1 text-foreground ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
