import { NextResponse, type NextRequest } from "next/server";

/** APP_PASSWORD 가 설정돼 있으면 로그인 쿠키가 없는 요청을 /login 으로 보냅니다.
 *  확장·크롤러가 쓰는 수집 API(/api/reviews/ingest)는 INGEST_TOKEN 으로 따로 보호되므로 제외합니다. */

const COOKIE_NAME = "studio_auth";

async function expectedToken(password: string): Promise<string> {
  const data = new TextEncoder().encode("review-content-studio::" + password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const PUBLIC_PATHS = ["/login", "/api/login", "/api/reviews/ingest", "/api/reviews/known", "/api/crawl/pending", "/api/crawl/report"];

export async function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD?.trim();
  if (!password) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (cookie && cookie === (await expectedToken(password))) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
