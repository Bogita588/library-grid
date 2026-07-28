import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/documents/$docId/versions")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const { requireAuth } = await import("@/lib/pleng/auth.server");
          const { addVersion } = await import("@/lib/pleng/documents.server");
          const user = await requireAuth(request);
          return Response.json(await addVersion(user, params.docId, await request.formData()), {
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
