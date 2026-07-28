import "@tanstack/react-start/server-only";

import { type AuthUser } from "./auth.server";
import { query } from "./db.server";
import { getDocument } from "./documents.server";

type FavoriteRow = {
  id: string;
  created_at: string;
  document_id: string;
};

export async function listFavorites(user: AuthUser) {
  const { rows } = await query<FavoriteRow>(
    "SELECT id, created_at, document_id FROM favorites WHERE user_id = $1 AND document_id IS NOT NULL ORDER BY created_at DESC",
    [user.id],
  );
  const favorites = await Promise.all(
    rows.map(async (favorite) => ({
      ...favorite,
      documents: await getDocument(user, favorite.document_id).catch(() => null),
    })),
  );
  return favorites.filter((favorite) => favorite.documents);
}

export async function getFavorite(user: AuthUser, documentId: string) {
  const { rows } = await query<{ id: string }>(
    "SELECT id FROM favorites WHERE user_id = $1 AND document_id = $2 LIMIT 1",
    [user.id, documentId],
  );
  return rows[0] ?? null;
}

export async function addFavorite(user: AuthUser, documentId: string) {
  await getDocument(user, documentId);
  const { rows } = await query<{ id: string }>(
    `
      INSERT INTO favorites (user_id, document_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      RETURNING id
    `,
    [user.id, documentId],
  );
  return rows[0] ?? (await getFavorite(user, documentId));
}

export async function removeFavorite(user: AuthUser, documentId: string) {
  await query("DELETE FROM favorites WHERE user_id = $1 AND document_id = $2", [
    user.id,
    documentId,
  ]);
  return { ok: true };
}
