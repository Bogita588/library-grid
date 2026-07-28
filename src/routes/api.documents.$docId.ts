import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/documents/$docId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { requireAuth } = await import("@/lib/pleng/auth.server");
          const { getDocument, listVersions } = await import("@/lib/pleng/documents.server");
          const user = await requireAuth(request);
          return Response.json({
            document: await getDocument(user, params.docId),
            versions: await listVersions(user, params.docId),
          });
        } catch (error) {
          const { fail } = await import("@/lib/pleng/http.server");
          return fail(error);
        }
      },
      PATCH: async ({ request, params }) => {
        try {
          const { readJson } = await import("@/lib/pleng/http.server");
          const { requireAuth } = await import("@/lib/pleng/auth.server");
          const { changeDocumentStatus } = await import("@/lib/pleng/documents.server");
          const user = await requireAuth(request);
          return Response.json({
            document: await changeDocumentStatus(user, params.docId, await readJson(request)),
          });
        } catch (error) {
          const { fail } = await import("@/lib/pleng/http.server");
          return fail(error);
        }
      },
      DELETE: async ({ request, params }) => {
        try {
          const { requireAuth } = await import("@/lib/pleng/auth.server");
          const { deleteDocument } = await import("@/lib/pleng/documents.server");
          const user = await requireAuth(request);
          return Response.json(await deleteDocument(user, params.docId));
        } catch (error) {
          const { fail } = await import("@/lib/pleng/http.server");
          return fail(error);
        }
      },
    },
  },
});
