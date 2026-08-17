import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listFavorites } from "@/lib/pleng/api";
import { Star, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/favorites")({
  head: () => ({ meta: [{ title: "Favorites · Pleng Limited" }] }),
  component: FavoritesPage,
});

function FavoritesPage() {
  const { data: favorites = [], isLoading } = useQuery({
    queryKey: ["favorites"],
    queryFn: async () => (await listFavorites()).favorites,
  });

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="h-14 border-b border-border bg-card/50 backdrop-blur flex items-center gap-3 px-6 shrink-0">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          PINNED
        </div>
        <div className="text-muted-foreground/40">/</div>
        <h1 className="font-semibold text-sm tracking-tight">Favorites</h1>
        <div className="ml-2 px-1.5 py-0.5 bg-muted rounded-sm text-[10px] font-mono text-muted-foreground">
          {favorites.length}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="text-center text-muted-foreground py-12 text-sm">Loading…</div>
        ) : favorites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-14 w-14 rounded-sm border-2 border-dashed border-border flex items-center justify-center mb-4">
              <Star className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-bold tracking-tight">No favorites yet</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              Pin documents from their detail page to find them quickly here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {favorites.map((f) => {
              const d = f.documents!;
              const color = d.departments?.color ?? "oklch(0.43 0.13 198)";
              return (
                <a
                  key={f.id}
                  href={pdfPreviewHref(d.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="group bg-card border border-border rounded-sm p-4 hover:border-primary/50 hover:shadow-sm transition-all block"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className="h-8 w-8 flex items-center justify-center rounded-sm"
                      style={{ backgroundColor: `${color}20`, color }}
                    >
                      <FileText className="h-4 w-4" />
                    </div>
                    <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mb-1">
                    {d.document_number ?? "—"}
                  </div>
                  <div className="font-semibold text-sm leading-snug line-clamp-2 min-h-[2.5rem]">
                    {d.title}
                  </div>
                  <div className="mt-3 pt-3 border-t border-border text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    V{d.current_version} · {d.departments?.code}
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function pdfPreviewHref(docId: string) {
  return `/api/documents/${encodeURIComponent(docId)}/preview`;
}
