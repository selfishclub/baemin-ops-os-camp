import { RecipeContent } from "../../../recipes/recipe-data";
import {
  getRecipeDb,
  readAdminWorkspace,
  requireRecipeAdmin,
  saveDraft,
} from "../../../../db/recipe-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = getRecipeDb();
  if (!db) return Response.json({ error: "관리 데이터베이스가 연결되지 않았습니다." }, { status: 503 });
  const actor = await requireRecipeAdmin(request, db);
  if (!actor) return Response.json({ error: "관리자 권한이 없습니다." }, { status: 403 });
  return Response.json({ ...(await readAdminWorkspace(db)), actor });
}

export async function PUT(request: Request) {
  const db = getRecipeDb();
  if (!db) return Response.json({ error: "관리 데이터베이스가 연결되지 않았습니다." }, { status: 503 });
  const actor = await requireRecipeAdmin(request, db);
  if (!actor) return Response.json({ error: "관리자 권한이 없습니다." }, { status: 403 });

  const body = await request.json() as { content?: RecipeContent; revision?: number };
  if (!body.content || !Number.isInteger(body.revision)) {
    return Response.json({ error: "저장할 초안이나 revision이 없습니다." }, { status: 400 });
  }
  const result = await saveDraft(db, actor, body.content, Number(body.revision));
  if (!result) return Response.json({ error: "다른 화면에서 먼저 수정했습니다. 최신 초안을 다시 불러와 주세요." }, { status: 409 });
  return Response.json(result);
}
