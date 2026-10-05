import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { blockOutsideStaff, requestOrigin } from "../lib/request-origin";
import { recordView } from "../db/view-store";

export const outsideMessage = "매장 밖에서는 열 수 없어요. 매장 인터넷(와이파이)으로 다시 열어 주세요.";

export function outsideResponse() {
  return Response.json({ error: outsideMessage, reason: "outside" }, { status: 403 });
}

export type ViewerRole = "owner" | "staff";

export type Viewer = {
  id: string;
  loginId: string;
  displayName: string;
  role: ViewerRole;
  active: boolean;
};

export type ViewerSession =
  | { mode: "demo"; viewer: null; db: null }
  // blocked: 재직 직원이지만 매장 밖에서 접속해 막힌 경우 (BLOCK_OUTSIDE_STAFF=1). viewer 는 비워서 아무 데이터도 나가지 않게 한다
  | { mode: "auth"; viewer: Viewer | null; db: SupabaseClient; blocked?: boolean };

// 지금 요청한 사람이 누구인지. 열쇠가 없으면 시연 모드.
export async function getViewerSession(): Promise<ViewerSession> {
  const db = await createSupabaseServerClient();
  if (!db) return { mode: "demo", viewer: null, db: null };

  const { data: { user } } = await db.auth.getUser();
  if (!user) return { mode: "auth", viewer: null, db };

  const { data: profile, error } = await db
    .from("profiles")
    .select("id, login_id, display_name, role, active")
    .eq("id", user.id)
    .maybeSingle();
  if (error) console.error("[auth] 프로필을 읽지 못했습니다:", error.message);
  if (!profile) return { mode: "auth", viewer: null, db };

  const viewer: Viewer = {
    id: profile.id,
    loginId: profile.login_id,
    displayName: profile.display_name || profile.login_id,
    role: profile.role === "owner" ? "owner" : "staff",
    active: Boolean(profile.active),
  };

  // 매장 밖 차단: 직원이 매장 인터넷이 아닌 곳에서 열면 아무것도 주지 않는다 (사장은 어디서나). 기록에는 남긴다
  if (viewer.role === "staff" && viewer.active && blockOutsideStaff()) {
    const origin = await requestOrigin();
    if (origin.outside) {
      await recordView(db, viewer, { kind: "blocked" }, origin);
      return { mode: "auth", viewer: null, db, blocked: true };
    }
  }

  return { mode: "auth", db, viewer };
}

// 페이지용: 로그인·재직 확인. 아니면 로그인 화면으로 보낸다.
export async function requireActiveViewer(returnTo: string): Promise<ViewerSession> {
  const session = await getViewerSession();
  if (session.mode === "demo") return session;
  if (session.blocked) redirect("/login?reason=outside");
  if (!session.viewer) {
    const { data: { user } } = await session.db.auth.getUser();
    // 로그인은 됐는데 프로필을 못 읽는 경우 → 로그인 화면에 이유를 보여 주고 멈춘다 (되돌리기 반복 방지)
    redirect(user ? "/login?reason=noprofile" : `/login?next=${encodeURIComponent(returnTo)}`);
  }
  if (!session.viewer.active) redirect("/login?reason=inactive");
  return session;
}

export type AdminActor = { id: string; email: string; role: string };

export type OwnerContext = { db: SupabaseClient; actor: AdminActor };

// API용: 사장(owner)만 통과. 아니면 바로 돌려줄 Response 를 준다.
export async function requireOwnerApi(): Promise<OwnerContext | { error: Response }> {
  const session = await getViewerSession();
  if (session.mode === "demo") {
    return { error: Response.json({ error: "데이터 창고(Supabase)가 연결되지 않아 편집할 수 없습니다. .env.local 열쇠를 확인해 주세요." }, { status: 503 }) };
  }
  if (session.blocked) return { error: outsideResponse() };
  if (!session.viewer) return { error: Response.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  if (!session.viewer.active) return { error: Response.json({ error: "사용이 중지된 계정입니다." }, { status: 403 }) };
  if (session.viewer.role !== "owner") return { error: Response.json({ error: "사장님 계정만 편집할 수 있습니다." }, { status: 403 }) };
  return {
    db: session.db,
    actor: { id: session.viewer.id, email: session.viewer.loginId, role: session.viewer.role },
  };
}

// API용: 로그인한 재직 직원(사장 포함)만 통과
export async function requireViewerApi(): Promise<{ db: SupabaseClient; viewer: Viewer } | { error: Response }> {
  const session = await getViewerSession();
  if (session.mode === "demo") return { error: Response.json({ error: "데이터 창고가 연결되지 않았습니다." }, { status: 503 }) };
  if (session.blocked) return { error: outsideResponse() };
  if (!session.viewer) return { error: Response.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  if (!session.viewer.active) return { error: Response.json({ error: "사용이 중지된 계정입니다." }, { status: 403 }) };
  return { db: session.db, viewer: session.viewer };
}
