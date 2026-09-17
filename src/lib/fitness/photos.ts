import type { Queryable } from "@/lib/db";
import { isIsoDate } from "@/lib/time";

export const PHOTO_KINDS = ["front", "side", "back", "meal"] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

export interface PhotoMeta {
  id: string;
  date: string;
  kind: PhotoKind;
  mime: string;
  width: number | null;
  height: number | null;
  createdAt: string;
}

/** Trust the bytes, not the declared type. */
export function sniffImage(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export async function savePhoto(
  q: Queryable,
  userId: string,
  input: { date: string; kind: PhotoKind; bytes: Uint8Array; width?: number | null; height?: number | null },
  at: string,
): Promise<string> {
  if (!isIsoDate(input.date)) throw new Error("Invalid date.");
  if (!PHOTO_KINDS.includes(input.kind)) throw new Error("Unknown photo type.");
  if (input.bytes.length === 0) throw new Error("The photo is empty.");
  if (input.bytes.length > MAX_PHOTO_BYTES) throw new Error("The photo is too large (3 MB max after resizing).");
  const mime = sniffImage(input.bytes);
  if (!mime) throw new Error("Only JPEG, PNG or WebP photos.");
  const dim = (n: number | null | undefined) => (n && Number.isInteger(n) && n > 0 && n < 20000 ? n : null);
  if (input.kind !== "meal") {
    await q.query(
      `update photos set deleted_at = $4::timestamptz where user_id = $1 and date = $2::date and kind = $3 and deleted_at is null`,
      [userId, input.date, input.kind, at],
    );
  }
  const rows = await q.query<{ id: string }>(
    `insert into photos (user_id, date, kind, mime, bytes, width, height, created_at)
     values ($1, $2::date, $3, $4, $5::bytea, $6::int, $7::int, $8::timestamptz) returning id`,
    [userId, input.date, input.kind, mime, input.bytes, dim(input.width), dim(input.height), at],
  );
  return rows[0].id;
}

export async function listPhotos(q: Queryable, userId: string, kinds: PhotoKind[] = ["front", "side", "back"]): Promise<PhotoMeta[]> {
  const rows = await q.query<{ id: string; date: string; kind: PhotoKind; mime: string; width: number | null; height: number | null; created_at: string }>(
    `select id, date, kind, mime, width, height, created_at from photos
     where user_id = $1 and deleted_at is null and kind = any(string_to_array($2, ','))
     order by date desc, created_at desc`,
    [userId, kinds.join(",")],
  );
  return rows.map((r) => ({ id: r.id, date: r.date, kind: r.kind, mime: r.mime, width: r.width, height: r.height, createdAt: r.created_at }));
}

export async function getPhotoBytes(q: Queryable, userId: string, id: string): Promise<{ mime: string; bytes: Uint8Array } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await q.query<{ mime: string; bytes: Uint8Array }>(
    `select mime, bytes from photos where user_id = $1 and id = $2::uuid and deleted_at is null`,
    [userId, id],
  );
  return rows[0] ?? null;
}

export async function deletePhoto(q: Queryable, userId: string, id: string, at: string): Promise<void> {
  await q.query(`update photos set deleted_at = $3::timestamptz where user_id = $1 and id = $2::uuid`, [userId, id, at]);
}
