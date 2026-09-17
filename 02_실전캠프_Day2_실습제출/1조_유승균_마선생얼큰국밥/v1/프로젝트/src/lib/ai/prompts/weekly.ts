import { PLATFORM_LABEL, type Review, type Settings } from "../../types";
import { maskName, storeContext } from "./content";

export const WEEKLY_SYSTEM = `당신은 음식점 사장님의 주간 리뷰 회의를 돕는 분석가입니다.
지난 한 주의 손님 리뷰 목록을 읽고, (1) 한 줄 요약 (2) 칭찬 포인트 (3) 개선 신호 (4) 홍보 콘텐츠로 쓰기 좋은 "베스트 리뷰 Top 5"를 고릅니다.

[베스트 리뷰 선정 기준]
- 구체적인 명사(메뉴·상황·이유)가 있는 문장 > 감탄만 있는 문장
- 사진이 있는 리뷰 우선
- 손님의 진짜 언어가 살아 있는 리뷰 (광고 문구처럼 매끈한 것보다 생생한 것)
- 긍정 리뷰 위주. 단, 개선 약속을 콘텐츠로 만들 수 있는 솔직한 혼합 리뷰 1개까지는 허용
- 같은 내용이 반복되면 하나만
- 리뷰가 5개 미만이면 있는 만큼만 고릅니다

[출력 규칙]
- review_id는 반드시 목록에 있는 id만 사용
- reason은 사장님이 바로 이해할 수 있는 한 줄 (왜 이게 콘텐츠 소재로 좋은지)
- suggested_format: 사진·비주얼이 강하면 carousel, 스토리·과정이 있으면 reels, 짧은 감사·공지형이면 news
- praise_points / concern_points는 각각 최대 5개, 리뷰 근거가 있는 것만. 사장님이 읽는 문장이므로 id 번호는 적지 않고 자연스러운 한국어로만 씁니다
- 모두 한국어`;

export function weeklyUserPrompt(reviews: Review[], settings: Settings, weekStart: string, weekEnd: string): string {
  const list = reviews
    .map((r) => {
      const parts = [
        `[id=${r.id}] ${PLATFORM_LABEL[r.platform]} · ${r.review_date} · ${maskName(r.customer_name)}`,
        r.rating !== null ? `별점 ${r.rating}` : "",
        r.order_menu ? `메뉴: ${r.order_menu}` : "",
        r.has_photo ? "사진 있음" : "",
        `분류: ${r.categories.join(", ") || "-"}`,
      ].filter(Boolean);
      return `${parts.join(" | ")}\n"${(r.review_text || "(내용 없음)").slice(0, 400)}"`;
    })
    .join("\n\n");

  return `[가게 정보]
${storeContext(settings)}

[기간] ${weekStart} ~ ${weekEnd} (리뷰 ${reviews.length}개)

[리뷰 목록]
${list}

이번 주 요약과 베스트 리뷰 Top 5를 골라주세요.`;
}
