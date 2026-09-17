import { requireOwnerApi } from "../../../auth";
import { readChangeStatus } from "../../../../db/recipe-store";

export const dynamic = "force-dynamic";

// 사장용: 알림마다 확인한 사람 / 안 본 사람
export async function GET() {
  const ctx = await requireOwnerApi();
  if ("error" in ctx) return ctx.error;
  try {
    return Response.json(await readChangeStatus(ctx.db));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "확인 현황을 읽지 못했습니다." }, { status: 503 });
  }
}
