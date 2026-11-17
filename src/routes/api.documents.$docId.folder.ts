import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/documents/$docId/folder")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        try {
          const { readJson } = await import("@/lib/pleng/http.server");
          const { requireAuth } = await import("@/lib/pleng/auth.server");
          const { moveDocument } = await import("@/lib/pleng/folders.server");
          const user = await requireAuth(request);
          return Response.json(await moveDocument(user, params.docId, await readJson(request)));
        } catch (error) {
          const { fail } = await import("@/lib/pleng/http.server");
          return fail(error);
        }
      },
    },
  },
});
