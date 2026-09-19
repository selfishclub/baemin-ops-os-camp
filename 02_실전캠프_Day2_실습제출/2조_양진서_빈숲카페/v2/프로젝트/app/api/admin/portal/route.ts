import { requireOwnerApi } from "../../../auth";
import { lockableSections, readMenuLockTable, setSectionLock } from "../../../../db/portal-store";

export const dynamic = "force-dynamic";

// 관리자 화면 "메뉴 잠금 설정": 큰 메뉴마다 열림/잠김 (사장만)
export async function GET() {
  const ctx = await requireOwnerApi();
  if ("error" in ctx) return ctx.error;
  try {
    return Response.json({ menus: await readMenuLockTable(ctx.db) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "잠금 상태를 읽지 못했습니다." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const ctx = await requireOwnerApi();
  if ("error" in ctx) return ctx.error;
  const body = await request.json() as { sectionId?: string; locked?: boolean };
  if (!body.sectionId || !lockableSections.includes(body.sectionId) || typeof body.locked !== "boolean") {
    return Response.json({ error: "잠글 수 있는 메뉴가 아닙니다." }, { status: 400 });
  }
  try {
    await setSectionLock(ctx.db, ctx.actor.email, body.sectionId, body.locked);
    return Response.json({ menus: await readMenuLockTable(ctx.db) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "저장하지 못했습니다." }, { status: 503 });
  }
}
