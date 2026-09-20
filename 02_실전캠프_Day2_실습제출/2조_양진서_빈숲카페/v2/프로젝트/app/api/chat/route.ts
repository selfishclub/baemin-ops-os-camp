import { getViewerSession } from "../../auth";
import { readPublishedContent } from "../../../db/recipe-store";
import { answerFromRecipes, mentionsRecipe, type ChatAnswer } from "../../recipes/chat-engine";
import { allowedSections, lockedResponse } from "../../../db/portal-store";
import { answerFromManuals } from "../../manual/manual-chat";
import { manualSectionIds, readableManuals } from "../../manual/manual-data";
import { portalSections } from "../../portal-sections";

export const dynamic = "force-dynamic";

// 빈숲 OS 챗봇. 지금은 외부 AI 없이 "규칙 답변기"가 레시피북과 운영 매뉴얼에 적힌 내용만으로 답한다.
// 잠긴 영역의 내용은 답하지 않는다 — 그 사람이 들어갈 수 있는 영역의 데이터만 답변기에 넘긴다.
//
// [마지막 단계 — AI 연결 자리]
//   1) 규칙 답변기가 먼저 관련 레시피·문서를 찾는다 (found=false 면 AI를 부르지 않고 "없는 내용"으로 끝낸다)
//   2) 찾은 한 건만 근거로 AI 응답 API에 넘겨 문장을 다듬는다
//   3) 열쇠는 서버 환경변수(AI_API_KEY 등)에만 둔다. 없으면 지금처럼 규칙 답변기가 답한다
//   → 이 파일의 answer 를 만드는 부분만 바꾸면 된다.
export async function POST(request: Request) {
  const session = await getViewerSession();
  if (session.mode === "auth") {
    if (!session.viewer) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
    if (!session.viewer.active) return Response.json({ error: "사용이 중지된 계정입니다." }, { status: 403 });
  }
  const allowed = await allowedSections(session, ["recipes", ...manualSectionIds]);
  if (!allowed.size) return lockedResponse();
  const body = await request.json().catch(() => ({})) as { question?: string };
  const question = String(body.question ?? "").slice(0, 300);
  if (!question.trim()) return Response.json({ error: "질문을 입력해 주세요." }, { status: 400 });
  try {
    const content = await readPublishedContent(session.mode === "auth" ? session.db : null);
    const docs = readableManuals(content).filter((doc) => allowed.has(doc.sectionId));
    const sectionTitles = Object.fromEntries(portalSections.map((section) => [section.id, section.title]));
    const canRecipes = allowed.has("recipes");

    let answer: ChatAnswer | null = null;
    // 메뉴 이름이 들어 있으면 레시피, 아니면 매뉴얼 문서에서 먼저 찾는다
    if (canRecipes && mentionsRecipe(content, question)) answer = answerFromRecipes(content, question);
    answer ??= answerFromManuals(docs, sectionTitles, question);
    if (!answer && canRecipes) {
      // 메뉴도 문서도 못 찾았을 때: 비슷한 메뉴 제안은 살리고, 안내문만 레시피북·매뉴얼 둘 다로 바꾼다
      const fallback = answerFromRecipes(content, question);
      answer = fallback.found ? fallback : { ...fallback, text: ["레시피북·매뉴얼에 없는 내용입니다. 임의로 답하지 않아요.", fallback.suggestions?.length ? "혹시 이 메뉴인가요?" : "메뉴 이름이나 문서 제목의 낱말로 다시 물어봐 주세요."] };
    }
    answer ??= { found: false, source: "rule", text: ["매뉴얼에 없는 내용입니다. 임의로 답하지 않아요.", "문서 제목에 있는 낱말로 다시 물어봐 주세요."], suggestions: docs.slice(0, 3).map((doc) => doc.title) };
    return Response.json({ answer });
  } catch {
    return Response.json({ error: "내용을 읽지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503 });
  }
}
