import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/folders")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { requireAuth } = await import("@/lib/pleng/auth.server");
          const { listFolders } = await import("@/lib/pleng/folders.server");
          const user = await requireAuth(request);
          const url = new URL(request.url);
          return Response.json(
            await listFolders(user, {
              dept: url.searchParams.get("dept") || undefined,
              parent: url.searchParams.get("parent") || undefined,
            }),
          );
        } catch (error) {
          const { fail } = await import("@/lib/pleng/http.server");
          return fail(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const { readJson } = await import("@/lib/pleng/http.server");
          const { requireAuth } = await import("@/lib/pleng/auth.server");
          const { createFolder } = await import("@/lib/pleng/folders.server");
          const user = await requireAuth(request);
          return Response.json(await createFolder(user, await readJson(request)), {
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
