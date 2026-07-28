import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/document-versions/$versionId/download-url")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { requireAuth } = await import("@/lib/pleng/auth.server");
          const { versionDownloadUrl } = await import("@/lib/pleng/documents.server");
          const user = await requireAuth(request);
          return Response.json(await versionDownloadUrl(user, params.versionId));
        } catch (error) {
          const { fail } = await import("@/lib/pleng/http.server");
          return fail(error);
        }
      },
    },
  },
});
