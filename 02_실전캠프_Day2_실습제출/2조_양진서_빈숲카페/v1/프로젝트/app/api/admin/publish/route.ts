import {
  getRecipeDb,
  publishDraft,
  requireRecipeAdmin,
} from "../../../../db/recipe-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const db = getRecipeDb();
  if (!db) return Response.json({ error: "관리 데이터베이스가 연결되지 않았습니다." }, { status: 503 });
  const actor = await requireRecipeAdmin(request, db);
  if (!actor) return Response.json({ error: "관리자 권한이 없습니다." }, { status: 403 });
  const body = await request.json() as { revision?: number; changeReason?: string; effectiveAt?: string };
  if (!Number.isInteger(body.revision)) return Response.json({ error: "revision이 없습니다." }, { status: 400 });
  const result = await publishDraft(
    db,
    actor,
    Number(body.revision),
    body.changeReason ?? "",
    body.effectiveAt ?? "",
  );
  if ("conflict" in result) return Response.json({ error: "다른 화면에서 먼저 수정했습니다. 최신 초안을 다시 불러와 주세요." }, { status: 409 });
  if ("errors" in result) return Response.json({ error: "게시 전 확인이 필요합니다.", errors: result.errors }, { status: 422 });
  return Response.json(result);
}
