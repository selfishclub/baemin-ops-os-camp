import { createClient } from "@supabase/supabase-js";
import { requireOwnerApi } from "../../../auth";
import { loginIdToEmail, supabaseAnonKey, supabaseUrl } from "../../../../lib/supabase/env";
import { logStaffCreated } from "../../../../db/recipe-store";

export const dynamic = "force-dynamic";

// 직원 계정 관리 (사장만). 재직/퇴사와 역할을 바꾸고, 새 계정도 여기서 만든다.
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

// 새 직원 계정 만들기. 관리자 열쇠(service_role) 없이, 공개 열쇠로 "가입"을 대신 해 준다.
//  - 사장 자신의 로그인은 그대로 둔다 (쿠키를 쓰지 않는 별도 클라이언트로 가입)
//  - 새 계정은 창고 규칙(handle_new_user)상 '중지' 상태로 생기므로, 여기서 바로 재직으로 켜고 이름을 적는다
//  - 그래서 누가 몰래 가입해도 사장이 켜 주기 전엔 아무것도 못 본다
export async function POST(request: Request) {
  const ctx = await requireOwnerApi();
  if ("error" in ctx) return ctx.error;
  const body = await request.json().catch(() => ({})) as { loginId?: string; displayName?: string; password?: string };
  const loginId = String(body.loginId ?? "").trim().toLowerCase();
  const displayName = String(body.displayName ?? "").trim().slice(0, 40);
  const password = String(body.password ?? "");
  if (!/^[a-z0-9][a-z0-9._-]{1,29}$/.test(loginId)) return Response.json({ error: "아이디는 영문 소문자·숫자·점·밑줄·하이픈으로 2~30자 (예: alba-a)" }, { status: 400 });
  if (loginId.includes("@")) return Response.json({ error: "아이디에는 @ 를 넣지 않아요." }, { status: 400 });
  if (password.length < 8 || password.length > 72) return Response.json({ error: "임시 비밀번호는 8자 이상이어야 해요." }, { status: 400 });
  if (!displayName) return Response.json({ error: "화면에 보일 이름을 적어 주세요." }, { status: 400 });

  const { data: existing } = await ctx.db.from("profiles").select("id").eq("login_id", loginId).maybeSingle();
  if (existing) return Response.json({ error: "이미 있는 아이디예요." }, { status: 409 });

  // 쿠키·세션을 저장하지 않는 일회용 클라이언트 — 사장 로그인에 영향을 주지 않는다
  const plain = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await plain.auth.signUp({ email: loginIdToEmail(loginId), password, options: { data: { display_name: displayName } } });
  if (error) {
    const text = /signup.*disabled|not allowed/i.test(error.message)
      ? "데이터 창고에서 새 가입이 꺼져 있어요. Supabase → Authentication → Sign In / Providers 에서 'Allow new users to sign up'을 켜야 여기서 만들 수 있어요."
      : `계정을 만들지 못했어요: ${error.message}`;
    return Response.json({ error: text }, { status: 503 });
  }
  const user = data.user;
  if (!user || (Array.isArray(user.identities) && user.identities.length === 0)) return Response.json({ error: "이미 있는 아이디예요." }, { status: 409 });

  // 방금 만들어진 프로필을 재직으로 켜고 이름을 적는다 (사장 권한으로)
  let profile = null as null | { id: string; login_id: string; display_name: string; role: string; active: boolean; created_at: string };
  for (let attempt = 0; attempt < 5 && !profile; attempt += 1) {
    const { data: row } = await ctx.db
      .from("profiles")
      .update({ active: true, display_name: displayName, role: "staff" })
      .eq("id", user.id)
      .select("id, login_id, display_name, role, active, created_at")
      .maybeSingle();
    profile = row ?? null;
    if (!profile) await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!profile) return Response.json({ error: "계정은 만들어졌지만 아직 목록에 보이지 않아요. 잠시 뒤 새로고침한 다음 '중지됨'이면 켜 주세요." }, { status: 202 });
  await logStaffCreated(ctx.db, ctx.actor, { id: profile.id, loginId });
  const needsConfirm = !user.email_confirmed_at && !user.confirmed_at;
  return Response.json({
    staff: profile,
    warning: needsConfirm ? "데이터 창고가 '이메일 확인'을 요구하는 상태예요. 직원이 로그인하려면 Supabase → Authentication → Sign In / Providers → Email 에서 'Confirm email'을 꺼야 해요." : "",
  }, { status: 201 });
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
