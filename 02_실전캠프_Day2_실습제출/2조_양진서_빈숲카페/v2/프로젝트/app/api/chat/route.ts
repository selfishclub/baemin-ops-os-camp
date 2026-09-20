import { getViewerSession } from "../../auth";
import { readPublishedContent } from "../../../db/recipe-store";
import { answerFromRecipes, mentionsRecipe, type ChatAnswer } from "../../recipes/chat-engine";
import { allowedSections, lockedResponse } from "../../../db/portal-store";
import { answerFromManuals } from "../../manual/manual-chat";
import { manualLabels, manualSectionIds, readableManuals } from "../../manual/manual-data";
import { portalSections } from "../../portal-sections";
import { polishWithAi } from "./ai-answer";

export const dynamic = "force-dynamic";

// 빈숲 OS 챗봇. "규칙 답변기"가 레시피북과 운영 매뉴얼에서 해당 한 건을 찾아 답한다. AI 는 그 한 건을 풀어 말해 줄 뿐이다.
// 잠긴 영역의 내용은 답하지 않는다 — 그 사람이 들어갈 수 있는 영역의 데이터만 답변기에 넘긴다.
//
// [AI 연결 — ai-answer.ts]
//   1) 규칙 답변기가 먼저 관련 레시피·문서를 찾는다 (found=false 면 AI를 부르지 않고 "없는 내용"으로 끝낸다)
//   2) 찾은 그 한 건의 글만 AI에 넘겨 질문에 맞게 풀어 말하게 한다
//   3) 열쇠는 서버 환경변수 ANTHROPIC_API_KEY 에만 둔다. 없으면 규칙 답변기가 그대로 답한다
//   4) 로그인이 꺼진 둘러보기 모드에서는 AI를 부르지 않는다 (아무나 눌러서 비용이 나가지 않게)
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
    // AI 로 풀어 말하기: 로그인한 직원에게만, 찾은 한 건의 전체 글을 근거로
    const ruleAnswer: ChatAnswer = answer;
    if (session.mode === "auth" && ruleAnswer.found) {
      const material: string[] = [];
      const recipe = ruleAnswer.recipeId ? content.recipes.find((item) => item.id === ruleAnswer.recipeId) : null;
      const variant = recipe && ruleAnswer.mode ? recipe.variants[ruleAnswer.mode] : null;
      const doc = ruleAnswer.manualId ? docs.find((item) => item.id === ruleAnswer.manualId) : null;
      if (recipe && variant) {
        material.push(`메뉴: ${recipe.name} (${ruleAnswer.mode})`, "정량:", ...variant.quick.map((item) => `- ${item.label} ${item.value}`), "제조 순서:", ...variant.steps.map((step, index) => `${index + 1}. ${step}`));
        if (variant.cautions?.length) material.push("주의사항:", ...variant.cautions.map((item) => `- ${item}`));
        if (recipe.commonMistakes?.length) material.push("자주 틀리는 포인트:", ...recipe.commonMistakes.map((item) => `- ${item}`));
        material.push(`최종 수정일: ${recipe.updatedAt}`);
      } else if (doc) {
        const labels = manualLabels(doc.kind);
        const part = (title: string, items: string[]) => (items.length ? [`${title}:`, ...items.map((item) => `- ${item}`)] : []);
        material.push(`문서: ${doc.title}`, `${labels.purpose}: ${doc.purpose}`, ...part(labels.materials || "준비물", doc.materials), `${labels.steps}:`, ...doc.steps.map((step, index) => `${index + 1}. ${step}`), ...part(labels.doneCriteria, doc.doneCriteria), ...part(labels.donts, doc.donts), ...part(labels.reportWhen, doc.reportWhen), `최종 수정일: ${doc.updatedAt}`);
      }
      answer = await polishWithAi(question, ruleAnswer, material);
    }
    return Response.json({ answer });
  } catch {
    return Response.json({ error: "내용을 읽지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503 });
  }
}
