import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseEnv, supabaseAnonKey, supabaseUrl } from "./lib/supabase/env";

// 모든 요청에서 로그인 세션 쿠키를 갱신하고, 로그인 안 한 사람은 /login 으로 보낸다.
// 열쇠가 없으면(시연 모드) 아무것도 막지 않는다.
export default async function proxy(request: NextRequest) {
  if (!hasSupabaseEnv()) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;
  const isPublic = pathname === "/login" || pathname.startsWith("/api/auth/") || pathname === "/api/badge" || pathname === "/badge.js";

  if (!user && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  // 로그인은 됐는데 프로필이 없거나 중지된 경우(reason=...)는 로그인 화면에 머물게 둔다 (무한 반복 방지)
  if (user && pathname === "/login" && !request.nextUrl.searchParams.get("reason")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.svg|og.png|og-recipe.png|.*\\.svg$).*)"],
};
