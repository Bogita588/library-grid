import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/users/$userId/role")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        try {
          const { readJson } = await import("@/lib/pleng/http.server");
          const { requireAuth } = await import("@/lib/pleng/auth.server");
          const { updateRole } = await import("@/lib/pleng/admin.server");
          return Response.json(
            await updateRole(await requireAuth(request), params.userId, await readJson(request)),
          );
        } catch (error) {
          const { fail } = await import("@/lib/pleng/http.server");
          return fail(error);
        }
      },
    },
  },
});
