import { describe, expect, it } from "vitest";
import { issuerToChannel, parseCardApproval } from "./cardApproval";

const H1 = ["No.", "영업일자", "포스\n번호", "영수증\n번호", "승인", "승인", "매입사", "카드번호", "승인요청금액", "승인요청금액", "승인요청금액", "할부", "할부", "유효기간", "승인일자", "승인시각", "승인번호", "승인금액"];
const H2 = ["No.", "영업일자", "포스\n번호", "영수증\n번호", "구분", "처리", "매입사", "카드번호", "요청금액", "봉사료", "부가세", "구분", "개월수", "유효기간", "승인일자", "승인시각", "승인번호", "승인금액"];
const row = (no: number, date: number, kind: string, issuer: string, amount: number, approvedDate = date) => [no, date, "01", String(no).padStart(4, "0"), kind, "포스승인", issuer, "****", amount, 0, 0, "일시불", "0", "****", approvedDate, "20:00:00", "1", amount];

// 2026-09-01 = 엑셀 일련번호 46266
const grid = [
  ["승인현황 (카드승인현황)"],
  [],
  ["조회일자 : 2026-09-01 ~ 2026-09-02"],
  [],
  H1,
  H2,
  row(1, 46266, "승인", "신한카드", 88000),
  row(2, 46266, "승인", "하나카드", 64000),
  row(3, 46266, "승인", "하나(구외환)", 10000),
  row(4, 46266, "승인", "국민카드", 50000, 46267), // 자정 넘어 승인 → 영업일자(9/1)에 붙는다
  row(5, 46267, "승인", "신한카드", 30000),
  row(6, 46267, "취소", "신한카드", 30000),
  row(7, 46267, "승인", "이상한카드", 5000),
  ["합계", null, "", "", null, null, "", "", 247000, 0, 0, null, "", "", null, null, "", 247000],
];

describe("issuerToChannel", () => {
  it("포스 매입사 이름을 카드사 채널로 바꾼다", () => {
    expect(issuerToChannel("신한카드")).toBe("card_shinhan");
    expect(issuerToChannel("하나카드")).toBe("card_hana");
    expect(issuerToChannel("하나(구외환)")).toBe("card_hana");
    expect(issuerToChannel("NH카드")).toBe("card_nh");
    expect(issuerToChannel("BC카드")).toBe("card_bc");
    expect(issuerToChannel("모르는카드")).toBeNull();
  });
});

describe("parseCardApproval", () => {
  const p = parseCardApproval(grid as never[][]);
  it("영업일자 기준으로 날짜별·카드사별 합계를 낸다", () => {
    expect(p.from).toBe("2026-09-01");
    expect(p.to).toBe("2026-09-02");
    expect(p.days[0].byCard).toEqual({ card_shinhan: 88000, card_hana: 74000, card_kb: 50000 });
    expect(p.days[0].count).toBe(4);
  });
  it("취소는 뺀다, 모르는 카드사는 기타 카드로", () => {
    expect(p.days[1].byCard).toEqual({ card_shinhan: 0, hall_card: 5000 });
    expect(p.unknownIssuers).toEqual(["이상한카드"]);
  });
  it("전체 합계와 파일의 합계 줄", () => {
    expect(p.total).toBe(217000);
    expect(p.sheetTotal).toBe(247000); // 파일 합계는 취소를 안 뺀 값일 수 있어 검산용으로만 둔다
    expect(p.byCard.card_hana).toBe(74000);
  });
  it("엉뚱한 파일이면 안내", () => {
    expect(() => parseCardApproval([["날짜", "내용", "입금"], ["2026-09-01", "a", 1]] as never[][])).toThrow(/승인현황/);
  });
});
