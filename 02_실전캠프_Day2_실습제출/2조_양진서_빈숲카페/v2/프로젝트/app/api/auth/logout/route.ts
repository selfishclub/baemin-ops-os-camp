import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getViewerSession } from "../../../auth";
import { recordView } from "../../../../db/view-store";
import { requestOrigin } from "../../../../lib/request-origin";

export const dynamic = "force-dynamic";

// 로그아웃. 열람 기록에 "로그아웃"을 남긴다 (자동 로그아웃이면 그렇게 표시). reason=idle 은 화면의 타이머가 보낸 것.
export async function POST(request: Request) {
  const reason = new URL(request.url).searchParams.get("reason") ?? "";
  const session = await getViewerSession();
  if (session.mode === "auth" && session.viewer?.active) {
    await recordView(session.db, session.viewer, { kind: "logout", targetName: reason === "idle" ? "한동안 쓰지 않아 자동" : "" }, await requestOrigin());
  }
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  const target = new URL(reason === "idle" ? "/login?reason=idle" : "/login", request.url);
  return NextResponse.redirect(target, { status: 303 });
}
