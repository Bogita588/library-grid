import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/folders/$folderId")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        try {
          const { readJson } = await import("@/lib/pleng/http.server");
          const { requireAuth } = await import("@/lib/pleng/auth.server");
          const { renameFolder } = await import("@/lib/pleng/folders.server");
          const user = await requireAuth(request);
          return Response.json(await renameFolder(user, params.folderId, await readJson(request)));
        } catch (error) {
          const { fail } = await import("@/lib/pleng/http.server");
          return fail(error);
        }
      },
      DELETE: async ({ request, params }) => {
        try {
          const { requireAuth } = await import("@/lib/pleng/auth.server");
          const { deleteFolder } = await import("@/lib/pleng/folders.server");
          const user = await requireAuth(request);
          return Response.json(await deleteFolder(user, params.folderId));
        } catch (error) {
          const { fail } = await import("@/lib/pleng/http.server");
          return fail(error);
        }
      },
    },
  },
});
