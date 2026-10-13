import { requireOwnerApi } from "../../../auth";
import { readViewLogs } from "../../../../db/view-store";
import { blockOutsideStaff, idleMinutes, requestOrigin, shopIps } from "../../../../lib/request-origin";

export const dynamic = "force-dynamic";

// 사장용: 열람 기록 (최근 N일, 한 사람만 볼 수도 있음) + 지금 설정 상태
export async function GET(request: Request) {
  const ctx = await requireOwnerApi();
  if ("error" in ctx) return ctx.error;
  const url = new URL(request.url);
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") ?? 14) || 14));
  const rawUser = url.searchParams.get("user") ?? "";
  const userId = /^[0-9a-f-]{36}$/i.test(rawUser) ? rawUser : "";
  const [{ data: staff, error: staffError }, rows, origin] = await Promise.all([
    ctx.db.from("profiles").select("id, login_id, display_name, role, active").order("created_at", { ascending: true }),
    readViewLogs(ctx.db, { days, userId: userId || undefined }).catch((error: Error) => error),
    requestOrigin(),
  ]);
  if (staffError) return Response.json({ error: `직원 목록을 읽지 못했습니다: ${staffError.message}` }, { status: 503 });
  if (rows instanceof Error) return Response.json({ error: rows.message }, { status: 503 });
  return Response.json({
    rows,
    staff: staff ?? [],
    days,
    settings: {
      shopIps: shopIps(),
      blockOutsideStaff: blockOutsideStaff(),
      idleMinutes: idleMinutes(),
      myIp: origin.ip,
      myDevice: origin.device,
      myOutside: origin.outside,
    },
  });
}
