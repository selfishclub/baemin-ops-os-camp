import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../lib/supabase/server";

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
  | { mode: "auth"; viewer: Viewer | null; db: SupabaseClient };

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

  return {
    mode: "auth",
    db,
    viewer: {
      id: profile.id,
      loginId: profile.login_id,
      displayName: profile.display_name || profile.login_id,
      role: profile.role === "owner" ? "owner" : "staff",
      active: Boolean(profile.active),
    },
  };
}

// 페이지용: 로그인·재직 확인. 아니면 로그인 화면으로 보낸다.
export async function requireActiveViewer(returnTo: string): Promise<ViewerSession> {
  const session = await getViewerSession();
  if (session.mode === "demo") return session;
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
  if (!session.viewer) return { error: Response.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  if (!session.viewer.active) return { error: Response.json({ error: "사용이 중지된 계정입니다." }, { status: 403 }) };
  return { db: session.db, viewer: session.viewer };
}
