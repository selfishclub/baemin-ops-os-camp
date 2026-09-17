// 데이터 창고(Supabase) 열쇠. .env.local 에만 적고 코드·채팅에는 적지 않는다.
// 열쇠가 없으면 앱은 "시연 모드"(로그인 없음, 가짜 레시피, 편집 불가)로 돈다.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function hasSupabaseEnv() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

// 직원 "아이디"를 Supabase가 요구하는 이메일 형식으로 바꿀 때 붙이는 꼬리
export const loginEmailDomain = "beansoop.local";

export function loginIdToEmail(loginId: string) {
  const trimmed = loginId.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : `${trimmed}@${loginEmailDomain}`;
}

export const mediaBucket = "recipe-media";
