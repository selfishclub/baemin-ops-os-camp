// 데이터 창고(Supabase) 열쇠. .env.local 에만 적고 코드·채팅에는 적지 않는다.
// 열쇠가 없으면 앱은 "시연 모드"(로그인 없음, 가짜 레시피, 편집 불가)로 돈다.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// [로그인 잠깐 끄기] 환경변수 NEXT_PUBLIC_LOGIN_OFF=1 이면 로그인 화면·권한 확인을 건너뛰고
// "둘러보기 모드"로 돈다. 이때는 데이터 창고를 아예 읽지 않고 코드에 든 가짜 레시피만 보여 준다
// (실제 레시피가 창고에 있어도 밖으로 나가지 않는다). 편집·읽음 확인·교육 기록은 꺼진다.
// 다시 켜려면 그 환경변수를 지우고 다시 배포하면 된다. 로그인 코드는 그대로 남아 있다.
export const loginOff = process.env.NEXT_PUBLIC_LOGIN_OFF === "1";

export function hasSupabaseEnv() {
  return !loginOff && Boolean(supabaseUrl && supabaseAnonKey);
}

// 직원 "아이디"를 Supabase가 요구하는 이메일 형식으로 바꿀 때 붙이는 꼬리
export const loginEmailDomain = "beansoop.local";

export function loginIdToEmail(loginId: string) {
  const trimmed = loginId.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : `${trimmed}@${loginEmailDomain}`;
}

export const mediaBucket = "recipe-media";
