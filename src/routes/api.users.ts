import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { requireAuth } = await import("@/lib/pleng/auth.server");
          const { listUsers } = await import("@/lib/pleng/admin.server");
          return Response.json({ users: await listUsers(await requireAuth(request)) });
        } catch (error) {
          const { fail } = await import("@/lib/pleng/http.server");
          return fail(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const { readJson } = await import("@/lib/pleng/http.server");
          const { requireAuth } = await import("@/lib/pleng/auth.server");
          const { createUser } = await import("@/lib/pleng/admin.server");
          const user = await requireAuth(request);
          return Response.json(await createUser(user, await readJson(request)), { status: 201 });
        } catch (error) {
          const { fail } = await import("@/lib/pleng/http.server");
          return fail(error);
        }
      },
    },
  },
});
