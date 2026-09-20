import Anthropic from "@anthropic-ai/sdk";
import type { ChatAnswer } from "../../recipes/chat-engine";

// 챗봇의 마지막 단계 — AI 연결.
//
// 원칙 (PRD 0번·8번):
//  1) 먼저 규칙 답변기가 레시피북·매뉴얼에서 해당 한 건을 찾는다. 못 찾으면(found=false) AI를 부르지 않는다 — 지어내지 않게.
//  2) AI에는 "질문 + 규칙 답변기가 찾은 그 한 건의 글"만 넘긴다. 레시피 전체·다른 문서·직원 정보는 넘기지 않는다.
//  3) AI는 그 글을 질문에 맞게 말로 풀어 줄 뿐이다. 글에 없는 내용은 "적혀 있지 않다"고 답하게 한다.
//  4) 열쇠(ANTHROPIC_API_KEY)는 서버 환경변수에만 둔다. 없으면 이 파일은 아무 일도 하지 않고 규칙 답변이 그대로 나간다.
//  5) AI 쪽에 문제가 생기면(오류·거절·시간 초과) 조용히 규칙 답변으로 돌아간다 — 챗봇이 멈추지 않게.

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

// 기본은 claude-opus-5. 서버 환경변수 AI_MODEL 로 바꿀 수 있다 (예: 비용을 줄이려면 claude-haiku-4-5)
const model = process.env.AI_MODEL || "claude-opus-5";

const system = [
  "당신은 카페 ‘빈숲’의 직원용 매뉴얼 도우미입니다. 바쁜 매장에서 직원이 폰이나 포스기로 짧게 물어봅니다.",
  "아래 <자료>는 매장의 공식 레시피북·매뉴얼에서 이 질문에 해당하는 한 건을 그대로 가져온 것입니다.",
  "반드시 <자료>에 적힌 내용만으로 답하세요. 정량·순서·기준을 바꾸거나 보태지 마세요. 숫자와 단위는 자료에 적힌 그대로 씁니다.",
  "자료에 없는 것을 물으면 추측하지 말고 “그 내용은 매뉴얼에 적혀 있지 않아요. 책임자에게 확인해 주세요.”라고 답하세요.",
  "답은 한국어 존댓말로, 질문에 필요한 부분만 짧게. 순서는 번호를 붙이고, 꾸밈말·인사·머리말 없이 바로 답합니다. 마크다운 기호(#, **, 표)는 쓰지 않습니다.",
].join("\n");

let client: Anthropic | null = null;

// material = 규칙 답변기가 찾은 그 한 건(메뉴의 한 구분, 또는 문서 한 장)의 전체 글
export async function polishWithAi(question: string, found: ChatAnswer, material: string[]): Promise<ChatAnswer> {
  if (!aiEnabled() || !found.found || !material.length) return found;
  try {
    client ??= new Anthropic({ timeout: 20_000, maxRetries: 1 });
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      // 짧게 풀어 말하는 일이라 깊게 생각할 필요가 없다
      output_config: { effort: "low" },
      // 모델이 답을 거절하면 Anthropic 이 권하는 다른 모델로 같은 요청을 다시 돌린다
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: `<자료>\n${material.join("\n")}\n</자료>\n\n<질문>\n${question}\n</질문>` }],
    });
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return found;
    const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n").trim();
    if (!text) return found;
    // 첫 줄(어느 메뉴·문서인지)은 규칙 답변기의 것을 그대로 둔다 — 출처가 항상 보이게
    return { ...found, source: "ai", text: [found.text[0], ...text.split("\n").map((line) => line.trim()).filter(Boolean)] };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) console.error("[chat] AI 열쇠가 올바르지 않습니다. 규칙 답변으로 대신합니다.");
    else if (error instanceof Anthropic.RateLimitError) console.error("[chat] AI 사용량 한도에 걸렸습니다. 규칙 답변으로 대신합니다.");
    else if (error instanceof Anthropic.APIError) console.error(`[chat] AI 응답 오류 ${error.status}. 규칙 답변으로 대신합니다.`);
    else console.error("[chat] AI 연결 실패. 규칙 답변으로 대신합니다.");
    return found;
  }
}
