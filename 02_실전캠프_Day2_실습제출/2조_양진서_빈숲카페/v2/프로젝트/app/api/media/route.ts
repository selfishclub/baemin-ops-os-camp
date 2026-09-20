import { mediaBucket } from "../../../lib/supabase/env";
import { getViewerSession, requireViewerApi } from "../../auth";
import { checkSectionAccess, lockedResponse } from "../../../db/portal-store";
import { readPublishedContent } from "../../../db/recipe-store";
import { readableManuals } from "../../manual/manual-data";

export const dynamic = "force-dynamic";

function validKey(value: string) {
  return /^recipes\/[a-zA-Z0-9._-]+\/[a-f0-9-]+\.(?:jpe?g|png|webp|avif)$/.test(value);
}

// 올릴 때(app/api/admin/media)와 같은 규칙으로 폴더 이름을 만든다
function safeFolder(value: string) {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

// 레시피·매뉴얼 사진. 로그인한 재직 직원만 볼 수 있다(창고 파일함은 비공개).
// 잠금도 따른다: 레시피 사진은 레시피 영역, 매뉴얼 사진(폴더가 manual-… )은 그 문서가 속한 영역이 잠겨 있으면 안 나간다.
export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!validKey(key)) return Response.json({ error: "올바르지 않은 이미지 주소입니다." }, { status: 400 });
  const ctx = await requireViewerApi();
  if ("error" in ctx) return ctx.error;
  const session = await getViewerSession();
  const folder = key.split("/")[1];
  let sectionId = "recipes";
  if (folder.startsWith("manual-")) {
    const doc = readableManuals(await readPublishedContent(ctx.db)).find((item) => safeFolder(`manual-${item.id}`) === folder);
    // 공식본에 없는(아직 초안뿐이거나 지워진) 문서의 사진은 사장만 본다
    if (!doc && ctx.viewer.role !== "owner") return lockedResponse();
    sectionId = doc?.sectionId ?? "recipes";
  }
  if (!(await checkSectionAccess(session, sectionId)).allowed) return lockedResponse();
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
