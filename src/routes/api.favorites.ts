import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/favorites")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { requireAuth } = await import("@/lib/pleng/auth.server");
          const { listFavorites } = await import("@/lib/pleng/favorites.server");
          return Response.json({ favorites: await listFavorites(await requireAuth(request)) });
        } catch (error) {
          const { fail } = await import("@/lib/pleng/http.server");
          return fail(error);
        }
      },
    },
  },
});
