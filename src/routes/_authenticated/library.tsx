import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import {
  DOCUMENT_STATUSES,
  getDocumentStatusClasses,
  getDocumentStatusLabel,
} from "@/lib/document-status";
import {
  createFolder,
  currentUser,
  deleteDocument,
  deleteFolder,
  documentDownloadUrl,
  listDepartments,
  listDocuments,
  listAllFolders,
  listFolders,
  listUsers,
  moveDocument,
  renameFolder,
  uploadDocument,
  type Department,
  type DocumentRow as DocRow,
  type Folder as FolderRow,
  type FolderCrumb,
} from "@/lib/pleng/api";
import Folder from "@/components/Folder";
import { canContributeRole, isAdminRole, type AppRole } from "@/lib/roles";
import {
  Search,
  Upload,
  FileText,
  Filter,
  LayoutGrid,
  List,
  Shield,
  Loader2,
  Download,
  Eye,
  Mail,
  MessageCircle,
  Trash2,
  FolderPlus,
  FolderInput,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";

const statusSearchSchema = z
  .preprocess(
    (value) => (value === "approved" ? "published" : value),
    z.enum(DOCUMENT_STATUSES).optional(),
  )
  .catch(undefined);

const searchSchema = z.object({
  q: z.string().optional(),
  dept: z.string().optional(),
  status: statusSearchSchema,
  folder: z.string().uuid().optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/library")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({ meta: [{ title: "Library · Pleng Limited" }] }),
  component: LibraryPage,
});

function LibraryPage() {
  const { q, dept, status, folder } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<FolderRow | null>(null);
  const [moveTarget, setMoveTarget] = useState<DocRow | null>(null);
  const qc = useQueryClient();

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["departments"],
    queryFn: async () => (await listDepartments()).departments,
  });

  const deptId = useMemo(() => departments.find((d) => d.slug === dept)?.id, [departments, dept]);

  const { data: currentRole = "viewer" } = useQuery<AppRole>({
    queryKey: ["current-role"],
    queryFn: async () => {
      const { user } = await currentUser();
      return (user?.role ?? "viewer") as AppRole;
    },
  });
  const canUpload = canContributeRole(currentRole);
  const canManageDocuments = isAdminRole(currentRole);

  const { data: me } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { user } = await currentUser();
      return user ? { id: user.id, role: user.role } : null;
    },
  });
  const meIsAdmin = isAdminRole(me?.role);
  const canEditFolder = (f: FolderRow) => Boolean(me && (meIsAdmin || f.created_by === me.id));
  const canMove = (d: DocRow) =>
    Boolean(me && (meIsAdmin || d.owner_id === me.id || d.uploaded_by === me.id));

  const { data: users = [], isLoading: usersLoading } = useQuery<LibraryUser[]>({
    queryKey: ["users", "document-viewers"],
    enabled: canUpload,
    queryFn: async () => (await listUsers()).users,
  });

  const { data: documents = [], isLoading } = useQuery<DocRow[]>({
    queryKey: ["documents", { q, dept, status, folder }],
    queryFn: async () => {
      const { documents } = await listDocuments({
        q: q?.trim() || undefined,
        dept,
        status,
        folder: dept ? folder : undefined,
      });
      return documents;
    },
  });

  const { data: folderData } = useQuery({
    queryKey: ["folders", dept, folder],
    enabled: Boolean(dept),
    queryFn: () => listFolders({ dept: dept!, parent: folder }),
  });
  const searching = Boolean(q?.trim());
  const subfolders = dept && !searching ? (folderData?.folders ?? []) : [];
  const folderPath = folderData?.path ?? [];

  const currentDept = departments.find((d) => d.slug === dept);
  const deptColor = currentDept?.color ?? "oklch(0.43 0.13 198)";
  const hasFilters = Boolean(q?.trim() || dept || status);
  const inFolder = Boolean(dept && folder);

  function goToFolder(id: string | undefined) {
    navigate({
      search: (p: typeof Route.types.searchSchemaInput) => ({ ...p, folder: id }),
    });
  }

  const onFolderDeleted = () => qc.invalidateQueries({ queryKey: ["folders"] });
  const publishedCount = documents.filter((d) => d.status === "published").length;
  const restrictedCount = documents.filter((d) => d.confidentiality !== "public").length;
  const visibleDeptCount =
    currentDept || documents.length === 0
      ? currentDept
        ? 1
        : departments.length
      : new Set(documents.map((d) => d.department_id)).size;

  return (
    <div className="library-surface flex-1 flex flex-col min-h-0 bg-background">
      {/* Header */}
      <header className="library-header shrink-0 px-4 py-5 sm:px-6">
        <div className="relative z-[1] flex flex-col gap-5 xl:flex-row xl:items-end">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase text-muted-foreground">
              <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-primary shadow-sm">
                {currentDept ? currentDept.code : "Catalog"}
              </span>
              <span>{currentDept ? "Department collection" : "Pleng Limited library"}</span>
            </div>
            <div className="mt-2 flex min-w-0 items-center gap-3">
              <h1 className="truncate text-2xl font-bold text-foreground sm:text-3xl">
                {currentDept ? (
                  <FolderBreadcrumbs
                    deptName={currentDept.name}
                    path={inFolder ? folderPath : []}
                    onNavigate={goToFolder}
                  />
                ) : (
                  "All documents"
                )}
              </h1>
              <div className="shrink-0 rounded-md border border-border bg-secondary px-2 py-1 text-[10px] font-mono uppercase text-muted-foreground">
                {documents.length} docs
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <LibraryMetric label="Published" value={publishedCount} />
              <LibraryMetric label="Restricted" value={restrictedCount} />
              <LibraryMetric label="Departments" value={visibleDeptCount} />
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row xl:ml-auto xl:w-[34rem]">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                defaultValue={q ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  navigate({
                    search: (prev: typeof Route.types.searchSchemaInput) => ({
                      ...prev,
                      q: v || undefined,
                    }),
                    replace: true,
                  });
                }}
                placeholder="Search the catalog"
                className="library-search h-11 w-full rounded-md border pl-9 pr-3 text-sm font-semibold outline-none transition focus:border-primary focus:ring-2 focus:ring-ring"
              />
            </div>

            {canUpload && (
              <button
                onClick={() => setUploadOpen(true)}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-md bg-accent px-4 text-xs font-bold uppercase text-accent-foreground shadow-lg shadow-black/10 hover:bg-accent/92"
              >
                <Upload className="h-3.5 w-3.5" /> Upload
              </button>
            )}

            {canUpload && currentDept && (
              <button
                onClick={() => setNewFolderOpen(true)}
                className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-md border border-input bg-card px-4 text-xs font-bold uppercase text-foreground shadow-sm hover:bg-secondary"
              >
                <FolderPlus className="h-3.5 w-3.5" /> New folder
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Filter bar */}
      <div className="shrink-0 border-b border-border bg-card px-4 py-3 shadow-sm sm:px-6">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
            <Filter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <FilterChip
              label="All"
              active={!status}
              onClick={() =>
                navigate({
                  search: (p: Record<string, unknown>) => ({ ...p, status: undefined }),
                  replace: true,
                })
              }
            />
            {DOCUMENT_STATUSES.map((s) => (
              <FilterChip
                key={s}
                label={getDocumentStatusLabel(s)}
                active={status === s}
                onClick={() =>
                  navigate({
                    search: (p: Record<string, unknown>) => ({ ...p, status: s }),
                    replace: true,
                  })
                }
              />
            ))}
          </div>
          <div className="flex-1" />
          <div className="flex w-fit items-center gap-0.5 rounded-md border border-input bg-card p-0.5 shadow-sm">
            <button
              onClick={() => setView("grid")}
              title="Grid view"
              className={`rounded-sm p-1.5 transition-colors ${view === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setView("list")}
              title="List view"
              className={`rounded-sm p-1.5 transition-colors ${view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-background p-4 sm:p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading library…
          </div>
        ) : documents.length === 0 && subfolders.length === 0 ? (
          <EmptyState
            canUpload={canUpload}
            hasFilters={hasFilters && !inFolder}
            inFolder={inFolder}
            onUpload={() => setUploadOpen(true)}
          />
        ) : (
          <>
            {subfolders.length > 0 && (
              <div className="mb-6 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
                {subfolders.map((f) => (
                  <FolderTile
                    key={f.id}
                    folder={f}
                    color={deptColor}
                    canEdit={canEditFolder(f)}
                    onOpen={() => goToFolder(f.id)}
                    onRename={() => setRenameTarget(f)}
                    onDeleted={onFolderDeleted}
                  />
                ))}
              </div>
            )}
            {documents.length === 0 ? null : view === "grid" ? (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {documents.map((doc) => (
                  <DocCard
                    key={doc.id}
                    doc={doc}
                    canManageDocuments={canManageDocuments}
                    canMove={canMove(doc)}
                    onMove={() => setMoveTarget(doc)}
                    onDeleted={() => {
                      qc.invalidateQueries({ queryKey: ["documents"] });
                      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
                      qc.invalidateQueries({ queryKey: ["favorites"] });
                    }}
                  />
                ))}
              </div>
            ) : (
              <DocTable
                docs={documents}
                canManageDocuments={canManageDocuments}
                canMove={canMove}
                onMove={setMoveTarget}
                onDeleted={() => {
                  qc.invalidateQueries({ queryKey: ["documents"] });
                  qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
                  qc.invalidateQueries({ queryKey: ["favorites"] });
                }}
              />
            )}
          </>
        )}
      </div>

      {newFolderOpen && canUpload && currentDept && (
        <FolderNameModal
          departmentId={currentDept.id}
          parentId={inFolder ? folder : undefined}
          onClose={() => setNewFolderOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["folders"] });
            setNewFolderOpen(false);
          }}
        />
      )}

      {renameTarget && (
        <FolderNameModal
          departmentId={renameTarget.department_id}
          parentId={renameTarget.parent_id ?? undefined}
          folder={renameTarget}
          onClose={() => setRenameTarget(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["folders"] });
            setRenameTarget(null);
          }}
        />
      )}

      {moveTarget && (
        <MoveDocumentModal
          doc={moveTarget}
          department={departments.find((d) => d.id === moveTarget.department_id)}
          onClose={() => setMoveTarget(null)}
          onMoved={() => {
            qc.invalidateQueries({ queryKey: ["documents"] });
            qc.invalidateQueries({ queryKey: ["folders"] });
            setMoveTarget(null);
          }}
        />
      )}

      {uploadOpen && canUpload && (
        <UploadModal
          departments={departments}
          users={users}
          usersLoading={usersLoading}
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

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-md px-3 py-1.5 text-[11px] font-bold uppercase transition-colors ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function LibraryMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="library-metric rounded-md px-3 py-2">
      <div className="text-xl font-bold text-foreground">{value}</div>
      <div className="mt-0.5 text-[10px] font-mono uppercase text-muted-foreground">{label}</div>
    </div>
  );
}

async function createDownloadSignedUrl(docId: string) {
  try {
    const result = await documentDownloadUrl(docId);
    if (result.processing) {
      toast.info("PDF is being generated. Try downloading again in a moment.");
      return null;
    }
    if (!result.url) {
      toast.error(result.previewError || "PDF download is not available for this document");
      return null;
    }
    const { url } = result;
    return url;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Could not create download link");
    return null;
  }
}

async function downloadCurrent(docId: string) {
  const signedUrl = await createDownloadSignedUrl(docId);
  if (!signedUrl) return;
  window.open(signedUrl, "_blank");
}

function documentPreviewUrl(docId: string) {
  return new URL(pdfPreviewHref(docId), window.location.origin).toString();
}

async function shareCurrent(doc: DocRow, channel: "whatsapp" | "email") {
  const message = `${doc.title}\n${documentPreviewUrl(doc.id)}`;
  if (channel === "whatsapp") {
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener");
    return;
  }
  window.location.href = `mailto:?subject=${encodeURIComponent(doc.title)}&body=${encodeURIComponent(message)}`;
}

async function deleteCurrent(doc: DocRow, onDeleted: () => void) {
  if (!confirm(`Delete "${doc.title}" and all versions? This cannot be undone.`)) return;
  try {
    await deleteDocument(doc.id);
    toast.success("Document deleted");
    onDeleted();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Delete failed");
  }
}

function addedBy(doc: DocRow) {
  return doc.uploader?.full_name || doc.uploader?.email || "Unknown user";
}

function MoveButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      title="Move to..."
      aria-label={`Move ${title} to another folder`}
      className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-input bg-card text-muted-foreground shadow-sm transition-colors hover:border-primary/50 hover:bg-primary hover:text-primary-foreground"
    >
      <FolderInput className="h-3.5 w-3.5" />
    </button>
  );
}

function DocCard({
  doc,
  canManageDocuments,
  canMove,
  onMove,
  onDeleted,
}: {
  doc: DocRow;
  canManageDocuments: boolean;
  canMove: boolean;
  onMove: () => void;
  onDeleted: () => void;
}) {
  const color = doc.departments?.color ?? "oklch(0.43 0.13 198)";
  return (
    <article
      role="link"
      tabIndex={0}
      onClick={() => openPdfPreview(doc.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openPdfPreview(doc.id);
        }
      }}
      className="library-card group flex h-full min-h-[17rem] cursor-pointer flex-col rounded-lg animate-reveal"
      style={{ "--dept-color": color } as React.CSSProperties}
    >
      <div className="library-spine absolute inset-y-0 left-0 w-1.5" />
      <div className="flex flex-1 flex-col p-4 pl-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="library-document-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-md">
            <FileText className="h-5 w-5" />
          </div>
          <StatusBadge status={doc.status} />
        </div>

        <div className="block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="mb-1 font-mono text-[10px] uppercase text-muted-foreground">
            {doc.document_number ?? "—"}
          </div>
          <div className="min-h-[3rem] text-base font-bold leading-snug text-foreground line-clamp-2 group-hover:text-primary">
            {doc.title}
          </div>
          {doc.description && (
            <p className="mt-2 min-h-[2.5rem] text-sm leading-relaxed text-muted-foreground line-clamp-2">
              {doc.description}
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          <span className="rounded-sm border border-border bg-secondary px-2 py-1 text-[10px] font-mono uppercase text-muted-foreground">
            Shelf {doc.departments?.code ?? "—"}
          </span>
          <span className="rounded-sm border border-border bg-card px-2 py-1 text-[10px] font-mono uppercase text-muted-foreground">
            Version {doc.current_version}
          </span>
        </div>
      </div>

      <div className="mt-auto space-y-2 border-t border-border bg-secondary/70 px-3 py-2.5 pl-5">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 truncate text-xs font-semibold text-muted-foreground">
            {doc.departments?.name ?? "Unassigned"}
          </div>
          {doc.confidentiality !== "public" && <Shield className="h-3 w-3 shrink-0 text-accent" />}
        </div>
        <div className="truncate text-[11px] font-semibold text-muted-foreground">
          Added by <span className="text-foreground">{addedBy(doc)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <a
            href={pdfPreviewHref(doc.id)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => {
              e.stopPropagation();
            }}
            title="View document"
            aria-label={`View ${doc.title}`}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-sm border border-input bg-card px-2.5 text-xs font-bold text-muted-foreground shadow-sm transition-colors hover:border-primary/50 hover:bg-primary hover:text-primary-foreground"
          >
            <Eye className="h-3.5 w-3.5" />
            View
          </a>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              downloadCurrent(doc.id);
            }}
            title="Download PDF"
            aria-label={`Download ${doc.title} as PDF`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-input bg-card text-muted-foreground shadow-sm transition-colors hover:border-primary/50 hover:bg-accent hover:text-accent-foreground"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          {canMove && <MoveButton title={doc.title} onClick={onMove} />}
          {canManageDocuments && (
            <>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  shareCurrent(doc, "whatsapp");
                }}
                title="Share via WhatsApp"
                aria-label={`Share ${doc.title} via WhatsApp`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-input bg-card text-muted-foreground shadow-sm transition-colors hover:border-primary/50 hover:bg-primary hover:text-primary-foreground"
              >
                <MessageCircle className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  shareCurrent(doc, "email");
                }}
                title="Share by email"
                aria-label={`Share ${doc.title} by email`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-input bg-card text-muted-foreground shadow-sm transition-colors hover:border-primary/50 hover:bg-primary hover:text-primary-foreground"
              >
                <Mail className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  deleteCurrent(doc, onDeleted);
                }}
                title="Delete document"
                aria-label={`Delete ${doc.title}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-input bg-card text-destructive shadow-sm transition-colors hover:border-destructive/50 hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function DocTable({
  docs,
  canManageDocuments,
  canMove,
  onMove,
  onDeleted,
}: {
  docs: DocRow[];
  canManageDocuments: boolean;
  canMove: (doc: DocRow) => boolean;
  onMove: (doc: DocRow) => void;
  onDeleted: () => void;
}) {
  return (
    <div className="library-table overflow-x-auto rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary text-[10px] font-mono uppercase text-muted-foreground">
            <th className="px-4 py-3 text-left font-medium">Ref</th>
            <th className="px-4 py-3 text-left font-medium">Title</th>
            <th className="px-4 py-3 text-left font-medium">Dept</th>
            <th className="px-4 py-3 text-left font-medium">Added by</th>
            <th className="px-4 py-3 text-left font-medium">Status</th>
            <th className="px-4 py-3 text-left font-medium">Ver</th>
            <th className="px-4 py-3 text-left font-medium">Updated</th>
            <th className="w-44 px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {docs.map((d) => (
            <tr
              key={d.id}
              onClick={() => openPdfPreview(d.id)}
              className="group cursor-pointer transition-colors hover:bg-secondary/70"
            >
              <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-muted-foreground">
                {d.document_number ?? "—"}
              </td>
              <td className="max-w-[28rem] px-4 py-3 font-semibold text-foreground">
                <span className="line-clamp-1 group-hover:text-primary">{d.title}</span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                {d.departments?.code}
              </td>
              <td className="max-w-[12rem] px-4 py-3 text-xs font-semibold text-muted-foreground">
                <span className="line-clamp-1">{addedBy(d)}</span>
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <StatusBadge status={d.status} />
              </td>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">
                V{d.current_version}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                {new Date(d.updated_at).toLocaleDateString()}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1.5">
                  <a
                    href={pdfPreviewHref(d.id)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    title="View document"
                    aria-label={`View ${d.title}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-input bg-card text-muted-foreground shadow-sm transition-colors hover:border-primary/50 hover:bg-primary hover:text-primary-foreground"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </a>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadCurrent(d.id);
                    }}
                    title="Download PDF"
                    aria-label={`Download ${d.title} as PDF`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-input bg-card text-muted-foreground shadow-sm transition-colors hover:border-primary/50 hover:bg-accent hover:text-accent-foreground"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  {canMove(d) && <MoveButton title={d.title} onClick={() => onMove(d)} />}
                  {canManageDocuments && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          shareCurrent(d, "whatsapp");
                        }}
                        title="Share via WhatsApp"
                        aria-label={`Share ${d.title} via WhatsApp`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-input bg-card text-muted-foreground shadow-sm transition-colors hover:border-primary/50 hover:bg-primary hover:text-primary-foreground"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          shareCurrent(d, "email");
                        }}
                        title="Share by email"
                        aria-label={`Share ${d.title} by email`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-input bg-card text-muted-foreground shadow-sm transition-colors hover:border-primary/50 hover:bg-primary hover:text-primary-foreground"
                      >
                        <Mail className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteCurrent(d, onDeleted);
                        }}
                        title="Delete document"
                        aria-label={`Delete ${d.title}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-input bg-card text-destructive shadow-sm transition-colors hover:border-destructive/50 hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm px-2 py-1 text-[9px] font-mono font-semibold uppercase shadow-sm ${getDocumentStatusClasses(status)}`}
    >
      {getDocumentStatusLabel(status)}
    </span>
  );
}

function FolderBreadcrumbs({
  deptName,
  path,
  onNavigate,
}: {
  deptName: string;
  path: FolderCrumb[];
  onNavigate: (folderId: string | undefined) => void;
}) {
  const crumbs = [{ id: undefined as string | undefined, name: deptName }, ...path];
  return (
    <nav aria-label="Folder path" className="flex min-w-0 items-center gap-2 truncate">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={c.id ?? "root"} className="flex min-w-0 items-center gap-2">
            {i > 0 && <span className="text-muted-foreground">/</span>}
            {last ? (
              <span className="truncate">{c.name}</span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(c.id)}
                className="truncate text-muted-foreground hover:text-primary"
              >
                {c.name}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function FolderTile({
  folder,
  color,
  canEdit,
  onOpen,
  onRename,
  onDeleted,
}: {
  folder: FolderRow;
  color: string;
  canEdit: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDeleted: () => void;
}) {
  const items = Array.from({ length: Math.min(3, folder.document_count) }, () => ({}));

  async function remove(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete folder "${folder.name}"?`)) return;
    try {
      await deleteFolder(folder.id);
      toast.success("Folder deleted");
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Open folder ${folder.name}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group relative flex cursor-pointer flex-col items-center rounded-lg p-2 outline-none hover:z-10 hover:bg-secondary/60 focus-within:z-10 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Folder
        mode="flap"
        variant="solid"
        openOn="hover"
        draggable={false}
        intro={false}
        zoomOnClick={false}
        size={0.8}
        layout="stack"
        tilt={0.2}
        bounce={0.15}
        color={color}
        items={items}
      />
      <div className="mt-1 flex w-full min-w-0 flex-wrap items-baseline justify-center gap-x-2 gap-y-0.5 text-center">
        <span
          className="line-clamp-2 min-w-0 break-words text-2xl font-semibold leading-tight text-foreground"
          title={folder.name}
        >
          {folder.name}
        </span>
        <span className="shrink-0 font-mono text-sm text-muted-foreground">
          {folder.document_count} {folder.document_count === 1 ? "doc" : "docs"}
        </span>
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRename();
          }}
          title="Rename folder"
          aria-label={`Rename folder ${folder.name}`}
          className="absolute left-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-sm border border-input bg-card text-muted-foreground opacity-0 shadow-sm transition-opacity hover:bg-secondary hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      {canEdit && folder.document_count === 0 && (
        <button
          type="button"
          onClick={remove}
          title="Delete folder"
          aria-label={`Delete folder ${folder.name}`}
          className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-sm border border-input bg-card text-destructive opacity-0 shadow-sm transition-opacity hover:bg-destructive/10 group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function FolderNameModal({
  departmentId,
  parentId,
  folder,
  onClose,
  onSaved,
}: {
  departmentId: string;
  parentId: string | undefined;
  folder?: FolderRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(folder?.name ?? "");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      if (folder) {
        await renameFolder(folder.id, trimmed);
        toast.success("Folder renamed");
      } else {
        await createFolder({ department_id: departmentId, parent_id: parentId, name: trimmed });
        toast.success("Folder created");
      }
      onSaved();
    } catch (err) {
      const fallback = folder ? "Could not rename folder" : "Could not create folder";
      toast.error(err instanceof Error ? err.message : fallback);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm">
      <div className="form-panel w-full max-w-md overflow-hidden animate-reveal">
        <div className="form-panel-header flex items-center justify-between px-5 py-4">
          <div>
            <div className="text-xs font-bold uppercase text-primary">
              {folder ? "Edit entry" : "New entry"}
            </div>
            <h2 className="text-lg font-bold">{folder ? "Rename folder" : "New folder"}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg leading-none"
          >
            ×
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-5 p-5">
          <Input label="Name" value={name} onChange={setName} required />
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-2 text-xs font-bold uppercase text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="action-primary h-10 px-4"
            >
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              {folder ? "Save" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MoveDocumentModal({
  doc,
  department,
  onClose,
  onMoved,
}: {
  doc: DocRow;
  department: Department | undefined;
  onClose: () => void;
  onMoved: () => void;
}) {
  const current = doc.folder_id ?? null;
  const [target, setTarget] = useState<string | null>(current);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["folders", { all: department?.slug }],
    enabled: Boolean(department),
    queryFn: () => listAllFolders(department!.slug),
  });
  const options = [
    { id: null as string | null, path: department?.name ?? "Department root" },
    ...(data?.folders ?? []),
  ];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (target === current) return;
    setSaving(true);
    try {
      await moveDocument(doc.id, target);
      toast.success("Document moved");
      onMoved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not move document");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm">
      <div className="form-panel w-full max-w-md overflow-hidden animate-reveal">
        <div className="form-panel-header flex items-center justify-between px-5 py-4">
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase text-primary">Move to...</div>
            <h2 className="truncate text-lg font-bold">{doc.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg leading-none"
          >
            ×
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-5 p-5">
          {isLoading ? (
            <div className="flex items-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading folders…
            </div>
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {options.map((o) => {
                const isCurrent = o.id === current;
                return (
                  <label
                    key={o.id ?? "root"}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${isCurrent ? "text-muted-foreground" : "cursor-pointer hover:bg-secondary"}`}
                  >
                    <input
                      type="radio"
                      name="move-target"
                      checked={target === o.id}
                      disabled={isCurrent}
                      onChange={() => setTarget(o.id)}
                    />
                    <span className="truncate" title={o.path}>
                      {o.path}
                    </span>
                    {isCurrent && (
                      <span className="ml-auto shrink-0 text-[10px] font-mono uppercase">
                        Current
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-2 text-xs font-bold uppercase text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || target === current}
              className="action-primary h-10 px-4"
            >
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              Move
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EmptyState({
  canUpload,
  hasFilters,
  inFolder = false,
  onUpload,
}: {
  canUpload: boolean;
  hasFilters: boolean;
  inFolder?: boolean;
  onUpload: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-16 text-center shadow-sm animate-reveal">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-md border border-primary/25 bg-background text-primary shadow-sm">
        <FileText className="h-7 w-7" />
      </div>
      <div className="text-[10px] font-mono uppercase text-muted-foreground">
        {hasFilters ? "No matches" : "Empty shelf"}
      </div>
      <h3 className="mt-1 text-lg font-bold">
        {hasFilters ? "No documents found" : inFolder ? "This folder is empty" : "No documents yet"}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm">
        {hasFilters
          ? "Try a different search term, department, or status filter."
          : canUpload
            ? "Upload the first document to start building the library."
            : "Documents uploaded by your team will appear here."}
      </p>
      {canUpload && !hasFilters && (
        <button
          onClick={onUpload}
          className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-bold uppercase text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          <Upload className="h-3.5 w-3.5" /> Upload document
        </button>
      )}
    </div>
  );
}

/* --------------------------- Upload modal --------------------------- */

type Dept = Pick<Department, "id" | "name" | "code">;
type LibraryUser = {
  id: string;
  full_name: string | null;
  email: string;
  role: AppRole;
  department_id: string | null;
};

function UploadModal({
  departments,
  users,
  usersLoading,
  defaultDeptId,
  onClose,
  onUploaded,
}: {
  departments: Dept[];
  users: LibraryUser[];
  usersLoading: boolean;
  defaultDeptId: string | undefined;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState("");
  const [deptId, setDeptId] = useState<string>(defaultDeptId ?? departments[0]?.id ?? "");
  const [confidentiality, setConfidentiality] = useState<
    "public" | "internal" | "department" | "confidential" | "strictly_confidential"
  >("public");
  const [viewerIds, setViewerIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const hasDepartments = departments.length > 0;
  const isRestricted = confidentiality !== "public";

  function updateConfidentiality(value: string) {
    const next = value as typeof confidentiality;
    setConfidentiality(next);
    if (next === "public") setViewerIds([]);
  }

  function toggleViewer(userId: string) {
    setViewerIds((selected) =>
      selected.includes(userId) ? selected.filter((id) => id !== userId) : [...selected, userId],
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title || !deptId) return;
    if (!isPdfUpload(file)) {
      toast.error("Only PDF files can be uploaded");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("title", title);
      formData.set("department_id", deptId);
      formData.set("confidentiality", confidentiality);
      if (description.trim()) formData.set("description", description.trim());
      if (keywords.trim()) formData.set("keywords", keywords.trim());
      if (isRestricted) formData.set("viewer_ids", JSON.stringify(viewerIds));

      await uploadDocument(formData);
      toast.success("PDF uploaded");
      onUploaded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm">
      <div className="form-panel w-full max-w-2xl overflow-hidden animate-reveal">
        <div className="form-panel-header flex items-center justify-between px-5 py-4">
          <div>
            <div className="text-xs font-bold uppercase text-primary">New entry</div>
            <h2 className="text-lg font-bold">Upload document</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg leading-none"
          >
            ×
          </button>
        </div>
        <form
          onSubmit={onSubmit}
          className="max-h-[calc(100dvh-8rem)] space-y-5 overflow-y-auto p-5"
        >
          <label className="block">
            <span className="form-label">File</span>
            <input
              type="file"
              required
              accept="application/pdf,.pdf"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (f && !isPdfUpload(f)) {
                  toast.error("Only PDF files can be uploaded");
                  e.target.value = "";
                  setFile(null);
                  return;
                }
                setFile(f);
                if (f && !title) setTitle(f.name.replace(/\.[^/.]+$/, ""));
              }}
              className="form-file"
            />
          </label>
          <Input label="Title" value={title} onChange={setTitle} required />
          <Input label="Description" value={description} onChange={setDescription} textarea />
          <Input label="Keywords" value={keywords} onChange={setKeywords} />
          {!hasDepartments && (
            <div className="rounded-sm border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-muted-foreground">
              Add at least one department before uploading documents.
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Department"
              value={deptId}
              onChange={setDeptId}
              options={departments.map((d) => ({ value: d.id, label: `${d.code} · ${d.name}` }))}
            />
            <Select
              label="Confidentiality"
              value={confidentiality}
              onChange={updateConfidentiality}
              options={[
                { value: "public", label: "Public" },
                { value: "internal", label: "Internal" },
                { value: "department", label: "Department" },
                { value: "confidential", label: "Confidential" },
                { value: "strictly_confidential", label: "Strictly confidential" },
              ]}
            />
          </div>
          {isRestricted && (
            <div className="rounded-md border border-border bg-card p-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="form-label mb-0">Who can view this document</span>
                <span className="rounded-sm border border-border bg-secondary px-2 py-1 text-[10px] font-mono uppercase text-muted-foreground">
                  {viewerIds.length} selected
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Uploader and admins keep access. Select the other users allowed to view it.
              </p>
              <div className="mt-3 max-h-48 overflow-y-auto rounded-md border border-border bg-card">
                {usersLoading ? (
                  <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading users
                  </div>
                ) : users.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-muted-foreground">
                    Add users before restricting a document.
                  </div>
                ) : (
                  users.map((viewer) => {
                    const checked = viewerIds.includes(viewer.id);
                    return (
                      <label
                        key={viewer.id}
                        className="flex cursor-pointer items-center gap-3 border-b border-border/70 px-3 py-2 last:border-b-0 hover:bg-secondary/80"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleViewer(viewer.id)}
                          className="h-4 w-4 accent-primary"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-foreground">
                            {viewer.full_name || viewer.email}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {viewer.email}
                          </span>
                        </span>
                        <span className="rounded-sm bg-secondary px-2 py-1 text-[10px] font-mono uppercase text-muted-foreground">
                          {viewer.role.replace("_", " ")}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-2 text-xs font-bold uppercase text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || !file || !deptId}
              className="action-primary h-10 px-4"
            >
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
  label,
  value,
  onChange,
  required,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  textarea?: boolean;
}) {
  return (
    <label className="block">
      <span className="form-label">{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="form-textarea"
        />
      ) : (
        <input
          value={value}
          required={required}
          onChange={(e) => onChange(e.target.value)}
          className="form-control"
        />
      )}
    </label>
  );
}

function isPdfUpload(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function pdfPreviewHref(docId: string) {
  return `/api/documents/${encodeURIComponent(docId)}/preview`;
}

function openPdfPreview(docId: string) {
  const url = pdfPreviewHref(docId);
  const opened = window.open(url, "_blank", "noopener");
  if (!opened) window.location.href = url;
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="form-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="form-select">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
