import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseEnv, supabaseAnonKey, supabaseUrl } from "./lib/supabase/env";
import { isIdleExpired, parseIdleMinutes } from "./app/manage/views/view-data";

// 모든 요청에서 로그인 세션 쿠키를 갱신하고, 로그인 안 한 사람은 /login 으로 보낸다.
// 열쇠가 없으면(시연 모드) 아무것도 막지 않는다.
//
// [자동 로그아웃] 환경변수 AUTO_LOGOUT_MINUTES(기본 30분, 0 = 끄기). 마지막으로 무언가를 연 시각을 쿠키(bs_last_seen)에 적어 두고,
// 그보다 오래 지나서 온 요청은 서버에서 로그아웃시킨다 — 화면의 타이머(idle-logout.tsx)가 꺼져 있어도(폰 잠금 등) 서버가 막는다.
const lastSeenCookie = "bs_last_seen";

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

  // 자동 로그아웃 (로그인된 사람만, 배지·로그아웃 요청은 제외)
  const idleMinutes = parseIdleMinutes(process.env.AUTO_LOGOUT_MINUTES);
  const countsAsActivity = user && idleMinutes > 0 && pathname !== "/api/badge" && pathname !== "/badge.js" && !pathname.startsWith("/api/auth/");
  if (countsAsActivity) {
    const lastSeen = Number(request.cookies.get(lastSeenCookie)?.value ?? "");
    if (isIdleExpired(lastSeen, Date.now(), idleMinutes)) {
      await supabase.auth.signOut();
      if (pathname.startsWith("/api/")) {
        const json = NextResponse.json({ error: "한동안 쓰지 않아 자동으로 로그아웃됐어요. 다시 로그인해 주세요.", reason: "idle" }, { status: 401 });
        for (const cookie of response.cookies.getAll()) json.cookies.set(cookie);
        json.cookies.set(lastSeenCookie, "", { path: "/", maxAge: 0 });
        return json;
      }
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "?reason=idle";
      const redirect = NextResponse.redirect(url);
      for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
      redirect.cookies.set(lastSeenCookie, "", { path: "/", maxAge: 0 });
      return redirect;
    }
    // 미리 불러오기(prefetch)는 사람이 한 일이 아니므로 시각을 갱신하지 않는다
    const prefetch = request.headers.get("next-router-prefetch") === "1" || request.headers.get("purpose") === "prefetch";
    if (!prefetch) {
      response.cookies.set(lastSeenCookie, String(Date.now()), {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        maxAge: idleMinutes * 60 + 86_400,
      });
    }
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
