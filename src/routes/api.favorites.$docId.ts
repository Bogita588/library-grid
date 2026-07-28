import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/favorites/$docId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { requireAuth } = await import("@/lib/pleng/auth.server");
          const { getFavorite } = await import("@/lib/pleng/favorites.server");
          return Response.json({
            favorite: await getFavorite(await requireAuth(request), params.docId),
          });
        } catch (error) {
          const { fail } = await import("@/lib/pleng/http.server");
          return fail(error);
        }
      },
      POST: async ({ request, params }) => {
        try {
          const { requireAuth } = await import("@/lib/pleng/auth.server");
          const { addFavorite } = await import("@/lib/pleng/favorites.server");
          return Response.json({
            favorite: await addFavorite(await requireAuth(request), params.docId),
          });
        } catch (error) {
          const { fail } = await import("@/lib/pleng/http.server");
          return fail(error);
        }
      },
      DELETE: async ({ request, params }) => {
        try {
          const { requireAuth } = await import("@/lib/pleng/auth.server");
          const { removeFavorite } = await import("@/lib/pleng/favorites.server");
          return Response.json(await removeFavorite(await requireAuth(request), params.docId));
        } catch (error) {
          const { fail } = await import("@/lib/pleng/http.server");
          return fail(error);
        }
      },
    },
  },
});
