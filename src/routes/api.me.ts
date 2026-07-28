import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { getAuthUser } = await import("@/lib/pleng/auth.server");
          const user = await getAuthUser(request);
          return Response.json({ user });
        } catch (error) {
          const { fail } = await import("@/lib/pleng/http.server");
          return fail(error);
        }
      },
    },
  },
});
