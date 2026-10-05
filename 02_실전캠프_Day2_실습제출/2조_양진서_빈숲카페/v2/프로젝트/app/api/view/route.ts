import { requireViewerApi } from "../../auth";
import { readPublishedContent } from "../../../db/recipe-store";
import { recordView } from "../../../db/view-store";
import { requestOrigin } from "../../../lib/request-origin";
import { readableManuals } from "../../manual/manual-data";

export const dynamic = "force-dynamic";

// 화면에서 "이걸 열어 봤어요"를 알려 주는 곳. 레시피·매뉴얼 문서를 열면 브라우저가 여기로 보낸다 (로그인·로그아웃은 서버가 직접 남긴다).
// 이름은 브라우저가 보낸 걸 믿지 않고 공식본에서 다시 찾는다.
export async function POST(request: Request) {
  const ctx = await requireViewerApi();
  if ("error" in ctx) return ctx.error;
  const body = await request.json().catch(() => ({})) as { kind?: string; id?: string };
  const kind = body.kind === "recipe" || body.kind === "manual" || body.kind === "login" ? body.kind : null;
  const id = String(body.id ?? "").slice(0, 120);
  if (!kind || (kind !== "login" && !id)) return Response.json({ error: "기록할 내용이 없습니다." }, { status: 400 });

  let name = "";
  if (kind !== "login") {
    const content = await readPublishedContent(ctx.db);
    name = kind === "recipe"
      ? content.recipes.find((recipe) => recipe.id === id)?.name ?? ""
      : readableManuals(content).find((doc) => doc.id === id)?.title ?? "";
    // 공식본에 없는 것(초안·지워진 것)은 사장이 편집 중에 본 것뿐이므로 id 만 남긴다
  }
  await recordView(ctx.db, ctx.viewer, { kind, targetId: kind === "login" ? "" : id, targetName: name }, await requestOrigin());
  return Response.json({ ok: true });
}
