import {
  getRecipeDb,
  requireRecipeAdmin,
  restoreVersionToDraft,
} from "../../../../db/recipe-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const db = getRecipeDb();
  if (!db) return Response.json({ error: "관리 데이터베이스가 연결되지 않았습니다." }, { status: 503 });
  const actor = await requireRecipeAdmin(request, db);
  if (!actor) return Response.json({ error: "관리자 권한이 없습니다." }, { status: 403 });
  const body = await request.json() as { version?: number; revision?: number };
  if (!Number.isInteger(body.version) || !Number.isInteger(body.revision)) {
    return Response.json({ error: "복구할 버전 정보가 없습니다." }, { status: 400 });
  }
  const result = await restoreVersionToDraft(db, actor, Number(body.version), Number(body.revision));
  if ("missing" in result) return Response.json({ error: "해당 버전을 찾을 수 없습니다." }, { status: 404 });
  if ("conflict" in result) return Response.json({ error: "다른 화면에서 먼저 수정했습니다. 최신 초안을 다시 불러와 주세요." }, { status: 409 });
  return Response.json(result);
}
