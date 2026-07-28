export const DOCUMENT_STATUSES = ["draft", "under_review", "published", "archived"] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

const STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: "Draft",
  under_review: "Under review",
  published: "Published",
  archived: "Archived",
};

export function getDocumentStatusLabel(status: string) {
  return STATUS_LABELS[status as DocumentStatus] ?? status.replaceAll("_", " ");
}

export function getDocumentStatusClasses(status: string) {
  const map: Record<DocumentStatus, string> = {
    draft: "bg-muted text-muted-foreground",
    under_review: "bg-warning/15 text-warning",
    published: "bg-success/15 text-success",
    archived: "bg-muted text-muted-foreground/60",
  };

  return map[status as DocumentStatus] ?? "bg-muted";
}
