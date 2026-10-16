import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

// 인터넷 모드(폰·공유용)의 Supabase 연결 하나. 저장소(SupabaseStore)와 로그인이 같이 쓴다.
//  - anon 공개 열쇠만 쓴다 (service_role 금지). 자료는 표의 잠금(RLS)이 "로그인한 사람 것"만 보이게 막는다 — supabase/schema_v2.sql
//  - 로그인은 이메일 링크(매직링크). 비밀번호가 없다. 메일의 링크를 누르면 주소 뒤에 토큰이 붙어 돌아오고, 그걸 읽어 로그인 상태가 된다.
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" },
    });
  }
  return client;
}

export type { Session };

// Supabase 가 영어로 주는 오류를 사장님 말로
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("rate limit") || m.includes("only request this after")) return "메일을 너무 자주 보냈어요. 1분쯤 뒤에 다시 눌러 주세요. (먼저 온 메일이 있으면 그걸 쓰면 돼요)";
  if (m.includes("invalid") && m.includes("email")) return "이메일 주소 모양이 아니에요. 다시 확인해 주세요.";
  if (m.includes("token has expired") || m.includes("otp_expired") || m.includes("expired")) return "로그인 링크(숫자)가 만료됐어요. 메일을 다시 보내 주세요.";
  if (m.includes("token") || m.includes("otp")) return "숫자가 맞지 않아요. 메일에 적힌 6자리를 다시 확인해 주세요.";
  if (m.includes("signups not allowed")) return "이 저장소는 새 가입을 막아 뒀어요. 관리자(장부 만든 사람)에게 이메일을 알려 주세요.";
  if (m.includes("fetch") || m.includes("network")) return "인터넷 연결이 안 돼요. 와이파이·데이터를 확인해 주세요.";
  return `로그인에 실패했어요 (${message})`;
}

/** 로그인 메일 보내기. 처음 보는 이메일이면 계정도 같이 만든다 (가게마다 따로 쓰기로 했으니 이메일 = 가게) */
export async function sendLoginEmail(email: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin + "/" : undefined },
  });
  if (error) throw new Error(friendlyAuthError(error.message));
}

/** 메일에 적힌 6자리 숫자로 로그인 — 아이폰 홈 화면 앱처럼 링크가 다른 브라우저에서 열리는 경우용 */
export async function verifyLoginCode(email: string, code: string): Promise<void> {
  const { error } = await getSupabase().auth.verifyOtp({ email: email.trim(), token: code.replace(/\D/g, ""), type: "email" });
  if (error) throw new Error(friendlyAuthError(error.message));
}

export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut();
}
