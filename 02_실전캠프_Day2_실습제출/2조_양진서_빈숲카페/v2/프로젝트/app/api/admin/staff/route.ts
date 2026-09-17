import { requireOwnerApi } from "../../../auth";

export const dynamic = "force-dynamic";

// 직원 계정 관리 (사장만). 계정 만들기는 Supabase 대시보드에서, 여기서는 재직/퇴사와 역할만 바꾼다.
export async function GET() {
  const ctx = await requireOwnerApi();
  if ("error" in ctx) return ctx.error;
  const { data, error } = await ctx.db
    .from("profiles")
    .select("id, login_id, display_name, role, active, created_at")
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: `직원 목록을 읽지 못했습니다: ${error.message}` }, { status: 503 });
  return Response.json({ staff: data ?? [], me: ctx.actor.id });
}

export async function PATCH(request: Request) {
  const ctx = await requireOwnerApi();
  if ("error" in ctx) return ctx.error;
  const body = await request.json() as { id?: string; active?: boolean; role?: string; displayName?: string };
  if (!body.id) return Response.json({ error: "직원 ID가 없습니다." }, { status: 400 });
  if (body.id === ctx.actor.id && (body.active === false || (body.role && body.role !== "owner"))) {
    return Response.json({ error: "내 계정은 중지하거나 직원으로 바꿀 수 없습니다." }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  if (typeof body.active === "boolean") patch.active = body.active;
  if (body.role === "owner" || body.role === "staff") patch.role = body.role;
  if (typeof body.displayName === "string") patch.display_name = body.displayName.trim().slice(0, 40);
  if (!Object.keys(patch).length) return Response.json({ error: "바꿀 내용이 없습니다." }, { status: 400 });
  const { data, error } = await ctx.db.from("profiles").update(patch).eq("id", body.id).select("id, login_id, display_name, role, active").maybeSingle();
  if (error) return Response.json({ error: `저장하지 못했습니다: ${error.message}` }, { status: 503 });
  if (!data) return Response.json({ error: "직원을 찾을 수 없습니다." }, { status: 404 });
  return Response.json({ staff: data });
}
