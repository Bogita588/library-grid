import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/documents/$docId/view-url")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { requireAuth } = await import("@/lib/pleng/auth.server");
          const { viewUrl } = await import("@/lib/pleng/documents.server");
          const user = await requireAuth(request);
          return Response.json(await viewUrl(user, params.docId));
        } catch (error) {
          const { fail } = await import("@/lib/pleng/http.server");
          return fail(error);
        }
      },
    },
  },
});
