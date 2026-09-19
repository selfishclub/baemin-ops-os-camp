import { mediaBucket } from "../../../lib/supabase/env";
import { getViewerSession, requireViewerApi } from "../../auth";
import { checkSectionAccess, lockedResponse } from "../../../db/portal-store";

export const dynamic = "force-dynamic";

function validKey(value: string) {
  return /^recipes\/[a-zA-Z0-9._-]+\/[a-f0-9-]+\.(?:jpe?g|png|webp|avif)$/.test(value);
}

// 레시피 사진. 로그인한 재직 직원만 볼 수 있다(창고 파일함은 비공개).
export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!validKey(key)) return Response.json({ error: "올바르지 않은 이미지 주소입니다." }, { status: 400 });
  const ctx = await requireViewerApi();
  if ("error" in ctx) return ctx.error;
  if (!(await checkSectionAccess(await getViewerSession(), "recipes")).allowed) return lockedResponse();
  const { data, error } = await ctx.db.storage.from(mediaBucket).download(key);
  if (error || !data) return Response.json({ error: "이미지를 찾을 수 없습니다." }, { status: 404 });
  return new Response(data, {
    headers: {
      "content-type": data.type || "application/octet-stream",
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
