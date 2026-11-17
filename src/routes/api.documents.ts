import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/documents")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { requireAuth } = await import("@/lib/pleng/auth.server");
          const { listDocuments } = await import("@/lib/pleng/documents.server");
          const user = await requireAuth(request);
          const url = new URL(request.url);
          const filters = {
            q: url.searchParams.get("q") || undefined,
            dept: url.searchParams.get("dept") || undefined,
            status: url.searchParams.get("status") || undefined,
            folder: url.searchParams.get("folder") || undefined,
          };
          return Response.json({ documents: await listDocuments(user, filters) });
        } catch (error) {
          const { fail } = await import("@/lib/pleng/http.server");
          return fail(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const { requireAuth } = await import("@/lib/pleng/auth.server");
          const { createDocument } = await import("@/lib/pleng/documents.server");
          const user = await requireAuth(request);
          return Response.json(await createDocument(user, await request.formData()), {
            status: 201,
          });
        } catch (error) {
          const { fail } = await import("@/lib/pleng/http.server");
          return fail(error);
        }
      },
    },
  },
});
