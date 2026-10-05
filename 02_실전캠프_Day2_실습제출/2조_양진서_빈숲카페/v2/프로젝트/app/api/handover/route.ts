import { requireViewerApi } from "../../auth";
import { deleteHandover, markHandoverRead, readHandovers, writeHandover } from "../../../db/handover-store";
import { buildHandoverViews, handoverDays, unreadCount, validateHandover } from "../../handover/handover-data";

export const dynamic = "force-dynamic";

// 인수인계: 최근 7일 메모 + 누가 읽었는지 + 내가 안 읽은 수
export async function GET() {
  const ctx = await requireViewerApi();
  if ("error" in ctx) return ctx.error;
  try {
    const since = new Date(Date.now() - handoverDays * 86_400_000).toISOString();
    const [rows, { data: staff, error }] = await Promise.all([readHandovers(ctx.db, since), ctx.db.from("profiles").select("id, display_name, login_id, active, role")]);
    if (error) throw new Error(error.message);
    const views = buildHandoverViews(rows, ctx.viewer.id, staff ?? []);
    return Response.json({ notes: views, unread: unreadCount(views), me: { id: ctx.viewer.id, role: ctx.viewer.role } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "인수인계를 읽지 못했습니다." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const ctx = await requireViewerApi();
  if ("error" in ctx) return ctx.error;
  const body = await request.json().catch(() => ({})) as { shift?: unknown; text?: string };
  const text = String(body.text ?? "").trim();
  const problem = validateHandover({ shift: body.shift, text });
  if (problem) return Response.json({ error: problem }, { status: 400 });
  try {
    await writeHandover(ctx.db, { id: ctx.viewer.id, displayName: ctx.viewer.displayName }, body.shift as "open", text);
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "남기지 못했습니다." }, { status: 503 });
  }
}

// 읽었어요
export async function PATCH(request: Request) {
  const ctx = await requireViewerApi();
  if ("error" in ctx) return ctx.error;
  const body = await request.json().catch(() => ({})) as { id?: number };
  if (!Number.isInteger(body.id)) return Response.json({ error: "어느 인수인계인지 없어요." }, { status: 400 });
  try {
    await markHandoverRead(ctx.db, Number(body.id), { id: ctx.viewer.id, displayName: ctx.viewer.displayName });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "남기지 못했습니다." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const ctx = await requireViewerApi();
  if ("error" in ctx) return ctx.error;
  if (ctx.viewer.role !== "owner") return Response.json({ error: "사장님만 지울 수 있어요." }, { status: 403 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return Response.json({ error: "지울 인수인계가 없어요." }, { status: 400 });
  try {
    await deleteHandover(ctx.db, id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "지우지 못했습니다." }, { status: 503 });
  }
}
