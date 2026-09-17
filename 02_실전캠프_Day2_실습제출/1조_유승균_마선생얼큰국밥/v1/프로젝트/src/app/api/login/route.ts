import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAME = "studio_auth";

async function expectedToken(password: string): Promise<string> {
  const data = new TextEncoder().encode("review-content-studio::" + password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(req: NextRequest) {
  const password = process.env.APP_PASSWORD?.trim();
  if (!password) return NextResponse.json({ ok: true, message: "비밀번호가 설정되어 있지 않아 로그인 없이 사용합니다." });
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  if ((body.password || "").trim() !== password) {
    await new Promise((r) => setTimeout(r, 800)); // 무차별 대입 완화
    return NextResponse.json({ ok: false, message: "비밀번호가 맞지 않습니다." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, await expectedToken(password), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}
