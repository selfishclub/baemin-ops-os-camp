import { getViewerSession } from "../../auth";
import { readPublishedContent } from "../../../db/recipe-store";
import { answerFromRecipes } from "../../recipes/chat-engine";
import { checkSectionAccess, lockedResponse } from "../../../db/portal-store";

export const dynamic = "force-dynamic";

// 레시피 챗봇. 지금은 외부 AI 없이 "규칙 답변기"가 레시피북 데이터만으로 답한다.
//
// [마지막 단계 — AI 연결 자리]
//   1) 규칙 답변기가 먼저 관련 레시피를 찾는다 (found=false 면 AI를 부르지 않고 "없는 메뉴"로 끝낸다)
//   2) 찾은 레시피 한 건만 근거로 AI 응답 API에 넘겨 문장을 다듬는다
//   3) 열쇠는 서버 환경변수(AI_API_KEY 등)에만 둔다. 없으면 지금처럼 규칙 답변기가 답한다
//   → 이 파일의 answer 를 만드는 한 줄만 바꾸면 된다.
export async function POST(request: Request) {
  const session = await getViewerSession();
  if (session.mode === "auth") {
    if (!session.viewer) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
    if (!session.viewer.active) return Response.json({ error: "사용이 중지된 계정입니다." }, { status: 403 });
  }
  if (!(await checkSectionAccess(session, "recipes")).allowed) return lockedResponse();
  const body = await request.json().catch(() => ({})) as { question?: string };
  const question = String(body.question ?? "").slice(0, 300);
  if (!question.trim()) return Response.json({ error: "질문을 입력해 주세요." }, { status: 400 });
  try {
    const content = await readPublishedContent(session.mode === "auth" ? session.db : null);
    const answer = answerFromRecipes(content, question);
    return Response.json({ answer });
  } catch {
    return Response.json({ error: "레시피를 읽지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503 });
  }
}
