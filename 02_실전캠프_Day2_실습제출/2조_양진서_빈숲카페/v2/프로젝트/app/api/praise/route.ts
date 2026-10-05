import { requireViewerApi } from "../../auth";
import { deletePraise, readPraises, sendPraise } from "../../../db/praise-store";
import { todayInSeoul } from "../../checks/check-data";
import { periodStart } from "../../score/score-data";
import { sentToday, shouldRelay, summarizePraise, validatePraise } from "../../praise/praise-data";

export const dynamic = "force-dynamic";

// 칭찬 릴레이: 칭찬 벽(최근 60장) + 이달 사람별 받은·보낸 수 + 내가 오늘 보냈는지
export async function GET() {
  const ctx = await requireViewerApi();
  if ("error" in ctx) return ctx.error;
  try {
    const [rows, { data: staff, error }] = await Promise.all([
      readPraises(ctx.db, periodStart("month")),
      ctx.db.from("profiles").select("id, display_name, login_id, role, active").eq("active", true).order("created_at", { ascending: true }),
    ]);
    if (error) throw new Error(error.message);
    const today = todayInSeoul();
    const people = (staff ?? []).filter((person) => person.id !== ctx.viewer.id);
    return Response.json({
      wall: rows.slice(0, 60),
      summary: summarizePraise(rows, staff ?? []),
      people: people.map((person) => ({ id: person.id, name: person.display_name || person.login_id, role: person.role })),
      me: { id: ctx.viewer.id, sentToday: sentToday(rows, ctx.viewer.id, today), relay: shouldRelay(rows, ctx.viewer.id, today), role: ctx.viewer.role },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "칭찬을 읽지 못했습니다." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const ctx = await requireViewerApi();
  if ("error" in ctx) return ctx.error;
  const body = await request.json().catch(() => ({})) as { toUserId?: string; text?: string };
  const toUserId = String(body.toUserId ?? "");
  const text = String(body.text ?? "").trim();
  const problem = validatePraise({ fromUser: ctx.viewer.id, toUser: toUserId, text });
  if (problem) return Response.json({ error: problem }, { status: 400 });
  try {
    const { data: target } = await ctx.db.from("profiles").select("id, display_name, login_id, active").eq("id", toUserId).maybeSingle();
    if (!target || !target.active) return Response.json({ error: "그 사람을 찾을 수 없어요." }, { status: 404 });
    const todayRows = await readPraises(ctx.db, new Date(Date.now() - 2 * 86_400_000).toISOString());
    if (sentToday(todayRows, ctx.viewer.id, todayInSeoul())) return Response.json({ error: "오늘 칭찬은 이미 보냈어요. 내일 또 이어가요!" }, { status: 429 });
    const row = await sendPraise(ctx.db, { id: ctx.viewer.id, displayName: ctx.viewer.displayName }, { id: target.id, name: target.display_name || target.login_id }, text);
    return Response.json({ praise: row }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "칭찬을 보내지 못했습니다." }, { status: 503 });
  }
}

// 사장만: 부적절한 칭찬 지우기
export async function DELETE(request: Request) {
  const ctx = await requireViewerApi();
  if ("error" in ctx) return ctx.error;
  if (ctx.viewer.role !== "owner") return Response.json({ error: "사장님만 지울 수 있어요." }, { status: 403 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return Response.json({ error: "지울 칭찬이 없어요." }, { status: 400 });
  try {
    await deletePraise(ctx.db, id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "지우지 못했습니다." }, { status: 503 });
  }
}
