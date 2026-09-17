import { RecipeContent } from "../../../recipes/recipe-data";
import { requireOwnerApi } from "../../../auth";
import { readAdminWorkspace, saveDraft } from "../../../../db/recipe-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await requireOwnerApi();
  if ("error" in ctx) return ctx.error;
  try {
    return Response.json({ ...(await readAdminWorkspace(ctx.db)), actor: ctx.actor });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "관리 데이터를 읽지 못했습니다." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const ctx = await requireOwnerApi();
  if ("error" in ctx) return ctx.error;

  const body = await request.json() as { content?: RecipeContent; revision?: number };
  if (!body.content || !Number.isInteger(body.revision)) {
    return Response.json({ error: "저장할 초안이나 revision이 없습니다." }, { status: 400 });
  }
  try {
    const result = await saveDraft(ctx.db, ctx.actor, body.content, Number(body.revision));
    if (!result) return Response.json({ error: "다른 화면에서 먼저 수정했습니다. 최신 초안을 다시 불러와 주세요." }, { status: 409 });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "저장하지 못했습니다." }, { status: 503 });
  }
}
