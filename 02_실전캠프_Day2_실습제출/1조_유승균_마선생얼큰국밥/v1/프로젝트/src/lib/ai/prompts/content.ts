import { PLATFORM_LABEL, type Review, type Settings } from "../../types";

export function storeContext(s: Settings): string {
  const lines = [
    `- 가게 이름: ${s.storeName || "(미입력)"}`,
    s.brandName ? `- 브랜드/별칭: ${s.brandName}` : "",
    s.region ? `- 지역: ${s.region}` : "",
    s.signatureMenus ? `- 대표 메뉴: ${s.signatureMenus}` : "",
    `- 말투: ${s.tone || "따뜻하고 담백한 사장님 말투"}`,
    s.instagramHandle ? `- 인스타그램: ${s.instagramHandle}` : "",
    s.extraNotes ? `- 참고 사항: ${s.extraNotes}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

export function maskName(name: string): string {
  const n = (name || "").trim();
  if (!n) return "손님";
  if (n.length <= 1) return n + "*";
  return n[0] + "*".repeat(Math.min(n.length - 1, 3));
}

export function reviewBlock(r: Review): string {
  return [
    `- 플랫폼: ${PLATFORM_LABEL[r.platform]}`,
    `- 작성일: ${r.review_date}`,
    `- 닉네임(가림): ${maskName(r.customer_name)}`,
    r.rating !== null ? `- 별점: ${r.rating}/5` : "",
    r.order_menu ? `- 주문 메뉴: ${r.order_menu}` : "",
    r.delivery_review ? `- 배달 만족도: ${r.delivery_review}` : "",
    `- 사진 첨부: ${r.has_photo ? "있음" : "없음"}`,
    `- 리뷰 원문:\n"""\n${r.review_text || "(내용 없음, 별점만 남김)"}\n"""`,
  ]
    .filter(Boolean)
    .join("\n");
}

export const CONTENT_SYSTEM = `당신은 동네 음식점의 SNS 마케팅을 돕는 한국어 콘텐츠 기획자입니다.
손님이 남긴 실제 리뷰 한 개를 재료로, 아래 3가지 콘텐츠를 한 번에 만듭니다.

[절대 규칙]
1. 리뷰에 실제로 적힌 내용만 씁니다. 리뷰에 없는 맛·서비스·효능·재방문 의사를 지어내지 않습니다.
2. 리뷰 문장을 인용할 때는 원문 표현을 그대로 살립니다(맞춤법 교정 정도만 허용). 인용은 따옴표로 감쌉니다.
3. 손님 닉네임은 절대 그대로 쓰지 않습니다. 필요하면 "한 손님", "단골 손님"처럼 표현합니다.
4. 과장 광고 표현(최고, 1등, 유일, 효능 보장 등)과 근거 없는 수치는 쓰지 않습니다.
5. 가게 정보(이름·메뉴·지역·인스타 계정)는 제공된 값만 사용합니다. 인스타그램 계정이 제공되지 않았으면 @계정을 절대 쓰지 않습니다.
6. "한정 메뉴", "이벤트", "할인", "신메뉴 출시", "기간" 같은 가게 소식은 [가게 정보]의 참고 사항에 적혀 있을 때만 씁니다. 없으면 리뷰 감사 + 평소 운영 안내로만 구성합니다.
7. 부정·혼합 리뷰라면 방어적으로 변명하지 말고, 개선 약속이나 솔직한 태도를 콘텐츠의 축으로 삼습니다.
8. 모든 출력은 한국어. image_prompt만 영어로 씁니다.

[콘텐츠 형식]
A. 인스타그램 캐러셀 (3~5장)
 - 1장(cover): 리뷰의 가장 강한 한 문장을 훅으로. headline 20자 이내.
 - 중간(body): 리뷰 핵심 문구를 감성적으로 분할. 각 장은 headline(큰 글씨) + body(보조 문구).
 - 마지막(closing): 가게 브랜딩(이름·인스타 핸들·CTA). design_note에 로고/상호 영역을 반드시 명시.
 - image_prompt: 실제 촬영 가능한 음식·매장 사진 스타일의 영어 프롬프트. 텍스트는 이미지에 넣지 않도록 "no text" 포함.
 - caption: 인스타 캡션 (리뷰 인용 + 감사 + 가벼운 CTA), 300자 이내. hashtags 8~15개, '#' 포함.

B. 릴스/쇼츠 대본 (15~60초)
 - phase 순서: opening(훅, 2~4초) → highlight(리뷰 하이라이트, 장면 1~3개) → closing(CTA).
 - 각 장면: script(나레이션/대사), subtitle(화면 자막, 짧게), visual(촬영 지시), duration_sec.
 - duration_sec 합계가 duration_sec 전체와 맞아야 합니다.
 - bgm_style, mood(분위기 가이드), cta 포함.

C. 새소식 문구
 - naver: 네이버 플레이스 새소식. 제목 25자 이내, 본문 300자 이내. 리뷰 인용 1개 + 가게 소식/감사 + 짧은 안내.
 - daangn: 당근 새소식. 동네 이웃에게 말하듯 친근한 톤, 지역명이 있으면 자연스럽게 언급. 300자 이내.

key_quote에는 콘텐츠의 축으로 삼은 리뷰 원문 문장을 그대로 넣습니다.`;

export function contentUserPrompt(review: Review, settings: Settings): string {
  return `[가게 정보]
${storeContext(settings)}

[리뷰]
${reviewBlock(review)}

위 리뷰 하나로 캐러셀·릴스 대본·새소식 문구를 모두 만들어주세요.`;
}
