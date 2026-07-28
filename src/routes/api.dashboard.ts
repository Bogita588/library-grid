import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/dashboard")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { requireAuth } = await import("@/lib/pleng/auth.server");
          const { dashboard } = await import("@/lib/pleng/dashboard.server");
          return Response.json({ dashboard: await dashboard(await requireAuth(request)) });
        } catch (error) {
          const { fail } = await import("@/lib/pleng/http.server");
          return fail(error);
        }
      },
    },
  },
});
