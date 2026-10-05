import { requireViewerApi } from "../../../auth";
import { recordView } from "../../../../db/view-store";
import { requestOrigin } from "../../../../lib/request-origin";

export const dynamic = "force-dynamic";

// 내 비밀번호 바꾸기 (로그인한 본인만). 다른 사람 비밀번호는 여기서 못 바꾼다 — 잊었으면 사장이 계정을 중지하고 새로 만들어 준다.
export async function POST(request: Request) {
  const ctx = await requireViewerApi();
  if ("error" in ctx) return ctx.error;
  const body = await request.json().catch(() => ({})) as { password?: string };
  const password = String(body.password ?? "");
  if (password.length < 8 || password.length > 72) return Response.json({ error: "비밀번호는 8자 이상이어야 해요." }, { status: 400 });
  const { error } = await ctx.db.auth.updateUser({ password });
  if (error) return Response.json({ error: `비밀번호를 바꾸지 못했어요: ${error.message}` }, { status: 503 });
  await recordView(ctx.db, ctx.viewer, { kind: "login", targetName: "비밀번호 바꿈" }, await requestOrigin());
  return Response.json({ ok: true });
}
