import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  DOCUMENT_STATUSES,
  type DocumentStatus,
  getDocumentStatusLabel,
} from "@/lib/document-status";
import {
  addFavorite,
  currentUser,
  deleteDocument as deleteDocumentApi,
  documentDownloadUrl,
  documentVersionDownloadUrl,
  documentViewUrl,
  getDocument,
  getFavorite,
  removeFavorite,
  updateDocumentStatus,
  uploadVersion,
  type Version,
} from "@/lib/pleng/api";
import { canContributeRole, isAdminRole, type AppRole } from "@/lib/roles";
import {
  ArrowLeft,
  Download,
  FileText,
  Loader2,
  Shield,
  Upload,
  History,
  Trash2,
  Star,
  Mail,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";

type DocumentPreview = {
  url: string | null;
  mimeType: string;
  fileName: string;
  standardized: boolean;
  processing: boolean;
  previewError: string | null;
};

export const Route = createFileRoute("/_authenticated/library/$docId")({
  head: () => ({ meta: [{ title: "Document · Pleng Limited" }] }),
  component: DocumentPage,
});

function DocumentPage() {
  const { docId } = Route.useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [uploadingNewVersion, setUploadingNewVersion] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const { data: authz } = useQuery<{
    userId: string | null;
    role: AppRole;
    departmentId: string | null;
  }>({
    queryKey: ["document-authz"],
    queryFn: async () => {
      const { user } = await currentUser();
      return {
        userId: user?.id ?? null,
        role: (user?.role ?? "viewer") as AppRole,
        departmentId: user?.department_id ?? null,
      };
    },
  });

  const { data: documentPayload, isLoading } = useQuery({
    queryKey: ["document", docId],
    queryFn: () => getDocument(docId),
  });

  const doc = documentPayload?.document;
  const versions = documentPayload?.versions ?? [];

  const currentVersion = versions[0];
  const userId = authz?.userId ?? null;
  const isAdmin = isAdminRole(authz?.role);
  const canContribute = canContributeRole(authz?.role);
  const canEditDocument = Boolean(
    doc && userId && (isAdmin || doc.owner_id === userId || doc.uploaded_by === userId),
  );
  const canPublishDocument = Boolean(
    doc &&
    (isAdmin || (authz?.role === "dept_manager" && authz?.departmentId === doc.department_id)),
  );
  const canChangeStatus = canEditDocument || canPublishDocument;

  const { data: favorite } = useQuery({
    queryKey: ["favorite", docId, userId],
    enabled: Boolean(userId),
    queryFn: async () => (await getFavorite(docId)).favorite,
  });

  async function toggleFavorite() {
    if (!userId) return;
    try {
      if (favorite) {
        await removeFavorite(docId);
      } else {
        await addFavorite(docId);
      }
      qc.invalidateQueries({ queryKey: ["favorite", docId] });
      qc.invalidateQueries({ queryKey: ["favorites"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update favorite");
    }
  }

  // Sign the current version for preview. Large Office files may need a server-side
  // PDF generation pass before the iframe can load.
  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;

    if (!currentVersion) {
      setPreview(null);
      setPreviewLoading(false);
      setPreviewError(null);
      return;
    }

    async function loadPreview() {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const nextPreview = await documentViewUrl(docId);
        if (cancelled) return;
        setPreview(nextPreview);
        if (nextPreview.processing) {
          pollTimer = setTimeout(loadPreview, 3000);
          return;
        }
        setPreviewLoading(false);
      } catch (error) {
        if (!cancelled) {
          setPreview(null);
          setPreviewLoading(false);
          setPreviewError(error instanceof Error ? error.message : "Could not prepare preview");
        }
      }
    }

    void loadPreview();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [currentVersion?.id, docId, previewAttempt]);

  async function downloadVersion(v: Version) {
    if (!isAdmin) {
      toast.error("Only admins can download documents");
      return;
    }
    try {
      const { url } = await documentVersionDownloadUrl(v.id);
      window.open(url, "_blank");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create download link");
    }
  }

  async function downloadCurrentDocument() {
    if (!doc) return;
    try {
      const result = await documentDownloadUrl(doc.id);
      if (result.processing) {
        toast.info("PDF is being generated. Try downloading again in a moment.");
        return;
      }
      if (!result.url) {
        toast.error(result.previewError || "PDF download is not available for this document");
        return;
      }
      window.open(result.url, "_blank");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create download link");
    }
  }

  function shareDocument(channel: "email" | "whatsapp") {
    if (!doc || !isAdmin) return;
    const url = new URL(`/library/${doc.id}`, window.location.origin).toString();
    const message = `${doc.title}\n${url}`;
    if (channel === "whatsapp") {
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener");
      return;
    }
    window.location.href = `mailto:?subject=${encodeURIComponent(doc.title)}&body=${encodeURIComponent(message)}`;
  }

  async function onNewVersion(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !doc) return;
    if (!userId || !canEditDocument || !canContribute) {
      toast.error("You do not have permission to upload a new version");
      e.target.value = "";
      return;
    }
    setUploadingNewVersion(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadVersion(doc.id, formData);

      toast.success(`Version ${result.version} uploaded`);
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
    if (!isAdmin) {
      toast.error("Only admins can delete documents");
      return;
    }
    if (!confirm(`Delete "${doc.title}" and all versions? This cannot be undone.`)) return;
    try {
      await deleteDocumentApi(doc.id);
      toast.success("Document deleted");
      qc.invalidateQueries({ queryKey: ["documents"] });
      router.navigate({ to: "/library" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function changeStatus(nextStatus: DocumentStatus) {
    if (!doc || !canChangeStatus) return;
    setUpdatingStatus(true);
    try {
      await updateDocumentStatus(doc.id, nextStatus);
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["document", docId] });
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Status update failed");
    } finally {
      setUpdatingStatus(false);
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
  const previewMime = preview?.mimeType ?? "";
  const isPdf = previewMime === "application/pdf";
  const isImage = previewMime.startsWith("image/");
  const isText = previewMime.startsWith("text/") || previewMime === "application/json";
  const isOffice = currentVersion ? isOfficeDocument(currentVersion.file_name, mime) : false;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="border-b border-border bg-card/50 backdrop-blur flex flex-wrap items-center gap-2 px-4 py-3 sm:px-6 shrink-0">
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
        <h1 className="min-w-[12rem] flex-1 font-semibold text-sm tracking-tight truncate">
          {doc.title}
        </h1>

        <div className="flex flex-wrap items-center gap-1.5">
          {canEditDocument && canContribute && (
            <label className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-input px-2.5 text-xs font-bold uppercase tracking-wider hover:bg-muted cursor-pointer">
              {uploadingNewVersion ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">New version</span>
              <input
                type="file"
                hidden
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg"
                onChange={onNewVersion}
                disabled={uploadingNewVersion}
              />
            </label>
          )}

          {currentVersion && (
            <button
              onClick={downloadCurrentDocument}
              title="Download PDF"
              className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-primary px-2.5 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>
          )}

          {isAdmin && (
            <>
              <button
                onClick={() => shareDocument("whatsapp")}
                title="Share via WhatsApp"
                className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-input px-2.5 text-xs font-bold uppercase text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                WhatsApp
              </button>
              <button
                onClick={() => shareDocument("email")}
                title="Share by email"
                className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-input px-2.5 text-xs font-bold uppercase text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Mail className="h-3.5 w-3.5" />
                Email
              </button>
            </>
          )}

          <button
            onClick={toggleFavorite}
            title={favorite ? "Unpin" : "Pin to favorites"}
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-input text-xs hover:bg-muted"
          >
            <Star
              className={`h-3.5 w-3.5 ${favorite ? "fill-warning text-warning" : "text-muted-foreground"}`}
            />
          </button>

          {isAdmin && (
            <button
              onClick={deleteDocument}
              title="Delete document"
              className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-input px-2.5 text-xs font-bold uppercase text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] min-h-0">
        {/* Preview */}
        <div className="min-h-0 overflow-hidden bg-muted/30 border-r border-border">
          {!currentVersion ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              No file attached.
            </div>
          ) : previewLoading || preview?.processing ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {preview?.processing ? "Generating PDF preview" : "Preparing preview"}
                </div>
                <div className="mt-1 max-w-sm text-xs leading-relaxed">
                  {preview?.processing
                    ? "Large Word, Excel, or PowerPoint files can take about a minute the first time they are opened."
                    : "Opening the document viewer."}
                </div>
              </div>
            </div>
          ) : previewError ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 px-6 text-center">
              <div className="h-14 w-14 rounded-sm border-2 border-dashed border-border flex items-center justify-center">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <div className="text-sm font-semibold">Preview could not load</div>
                <div className="mt-1 text-xs text-muted-foreground">{previewError}</div>
              </div>
              <button
                onClick={() => setPreviewAttempt((attempt) => attempt + 1)}
                className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
              >
                Try again
              </button>
            </div>
          ) : !preview?.url ? (
            <PreviewUnavailable
              isOffice={isOffice}
              mime={mime}
              previewMime={previewMime}
              conversionError={preview?.previewError}
              currentVersion={currentVersion}
              onDownload={downloadCurrentDocument}
            />
          ) : isPdf ? (
            <iframe src={preview.url} className="w-full h-full" title={doc.title} />
          ) : isImage ? (
            <div className="w-full h-full flex items-center justify-center p-6">
              <img
                src={preview.url}
                alt={doc.title}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          ) : isText ? (
            <iframe src={preview.url} className="w-full h-full bg-background" title={doc.title} />
          ) : (
            <PreviewUnavailable
              isOffice={isOffice}
              mime={mime}
              previewMime={previewMime}
              conversionError={preview?.previewError}
              currentVersion={currentVersion}
              onDownload={downloadCurrentDocument}
            />
          )}
        </div>

        {/* Sidebar: metadata + versions */}
        <aside className="overflow-y-auto p-5 space-y-6 bg-card">
          <section>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
              Metadata
            </div>
            <dl className="space-y-2 text-xs">
              <Row
                label="Status"
                value={
                  canChangeStatus ? (
                    <select
                      value={doc.status}
                      disabled={updatingStatus}
                      onChange={(e) => changeStatus(e.target.value as DocumentStatus)}
                      className="rounded-sm border border-input bg-background px-2 py-1 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-50"
                    >
                      {DOCUMENT_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {getDocumentStatusLabel(status)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    getDocumentStatusLabel(doc.status)
                  )
                }
              />
              <Row label="Department" value={doc.departments?.name ?? "—"} />
              <Row label="Added by" value={doc.uploader?.full_name || doc.uploader?.email || "—"} />
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
              {doc.published_at && (
                <>
                  <Row
                    label="Published by"
                    value={doc.publisher?.full_name || doc.publisher?.email || "—"}
                  />
                  <Row label="Published" value={new Date(doc.published_at).toLocaleString()} />
                </>
              )}
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
              {versions.map((v) => {
                const Wrapper = isAdmin ? "button" : "div";
                return (
                  <Wrapper
                    key={v.id}
                    onClick={isAdmin ? () => downloadVersion(v) : undefined}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm border border-border hover:border-primary/50 hover:bg-muted text-left"
                  >
                    <span className="font-mono text-[10px] font-bold text-foreground">
                      V{v.version_number}
                    </span>
                    <span className="flex-1 truncate text-xs">{v.file_name}</span>
                    {v.preview_mime_type === "application/pdf" && (
                      <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-[9px] font-mono uppercase text-muted-foreground">
                        PDF view
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {v.file_size ? formatSize(v.file_size) : ""}
                    </span>
                    {isAdmin && <Download className="h-3 w-3 text-muted-foreground" />}
                  </Wrapper>
                );
              })}
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

function PreviewUnavailable({
  isOffice,
  mime,
  previewMime,
  conversionError,
  currentVersion,
  onDownload,
}: {
  isOffice: boolean;
  mime: string;
  previewMime: string;
  conversionError?: string | null;
  currentVersion: Version;
  onDownload: () => void;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-6">
      <div className="h-14 w-14 rounded-sm border-2 border-dashed border-border flex items-center justify-center">
        <FileText className="h-6 w-6 text-muted-foreground" />
      </div>
      <div>
        <div className="text-sm font-semibold">Preview not available</div>
        <div className="text-xs text-muted-foreground mt-1">
          {isOffice
            ? "A PDF preview could not be generated for this Office document."
            : `This file type (${mime || previewMime || "unknown"}) can't be previewed in the browser.`}
        </div>
      </div>
      <button
        onClick={onDownload}
        className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
      >
        <Download className="h-3.5 w-3.5" /> Download PDF
      </button>
      {(conversionError || currentVersion.preview_error) && (
        <div className="max-w-sm text-xs text-muted-foreground">
          {conversionError || currentVersion.preview_error}
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function isOfficeDocument(fileName: string, mime: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return (
    ["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(extension ?? "") ||
    [
      "application/msword",
      "application/vnd.ms-excel",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ].includes(mime)
  );
}
