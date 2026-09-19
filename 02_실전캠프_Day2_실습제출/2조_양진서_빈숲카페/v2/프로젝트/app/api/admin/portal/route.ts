import { requireOwnerApi } from "../../../auth";
import { lockableSections, readLockedSections, setSectionLock } from "../../../../db/portal-store";

export const dynamic = "force-dynamic";

// 사장이 영역을 잠그거나 연다
export async function POST(request: Request) {
  const ctx = await requireOwnerApi();
  if ("error" in ctx) return ctx.error;
  const body = await request.json() as { sectionId?: string; locked?: boolean };
  if (!body.sectionId || !(lockableSections as readonly string[]).includes(body.sectionId) || typeof body.locked !== "boolean") {
    return Response.json({ error: "잠글 수 있는 영역이 아닙니다." }, { status: 400 });
  }
  try {
    await setSectionLock(ctx.db, ctx.actor.email, body.sectionId, body.locked);
    return Response.json({ locked: [...(await readLockedSections(ctx.db))] });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "저장하지 못했습니다." }, { status: 503 });
  }
}
