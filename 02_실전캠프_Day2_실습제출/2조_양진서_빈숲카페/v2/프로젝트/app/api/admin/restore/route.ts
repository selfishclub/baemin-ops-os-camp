import { requireOwnerApi } from "../../../auth";
import { restoreVersionToDraft } from "../../../../db/recipe-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ctx = await requireOwnerApi();
  if ("error" in ctx) return ctx.error;
  const body = await request.json() as { version?: number; revision?: number };
  if (!Number.isInteger(body.version) || !Number.isInteger(body.revision)) {
    return Response.json({ error: "복구할 버전 정보가 없습니다." }, { status: 400 });
  }
  try {
    const result = await restoreVersionToDraft(ctx.db, ctx.actor, Number(body.version), Number(body.revision));
    if ("missing" in result) return Response.json({ error: "해당 버전을 찾을 수 없습니다." }, { status: 404 });
    if ("conflict" in result) return Response.json({ error: "다른 화면에서 먼저 수정했습니다. 최신 초안을 다시 불러와 주세요." }, { status: 409 });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "복구하지 못했습니다." }, { status: 503 });
  }
}
