import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { hasSupabaseEnv, supabaseAnonKey, supabaseUrl } from "./env";

// 서버(페이지·API)에서 쓰는 Supabase 클라이언트. 로그인 쿠키를 같이 넘겨서 RLS가 "지금 로그인한 사람" 기준으로 동작한다.
export async function createSupabaseServerClient() {
  if (!hasSupabaseEnv()) return null;
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // 서버 컴포넌트에서는 쿠키를 못 쓴다. proxy.ts 가 세션을 갱신하므로 무시해도 된다.
        }
      },
    },
  });
}
