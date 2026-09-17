import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getPhotoBytes } from "@/lib/fitness/photos";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in.", { status: 401 });
  const { id } = await ctx.params;
  const photo = await getPhotoBytes(await getDb(), user.id, id);
  if (!photo) return new Response("Not found.", { status: 404 });
  return new Response(Buffer.from(photo.bytes), {
    headers: {
      "Content-Type": photo.mime,
      "Cache-Control": "private, max-age=86400, immutable",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
