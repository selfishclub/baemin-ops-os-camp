import { describe, expect, it } from "vitest";
import { PosDailyError, isPayCardColumn, parsePosDaily, payMethodToChannel, posCardGaps } from "./posDaily";

// 2026-11-18 실제 파일 모양 (칸 이름·차례 그대로, 쓰지 않는 칸은 줄였다)
const HEADER_GROUP = ["일자", "요일", "매출현황", "매출현황", "매출현황", "매출현황", "결제수단", "결제수단", "결제수단", "결제수단", "결제수단"];
const HEADER = ["일자", "요일", "총매출", "총할인", "실매출", "영수건수", "결제합계", "단순현금", "현금영수", "신용카드", "토스페이카드", "토스페이계좌"];
// 46344 = 2026-11-18 (엑셀 날짜 일련번호)
const ROW_1118 = [46344, "수", 764_000, 60_000, 704_000, 10, 704_000, 0, 0, 571_000, 0, 133_000];
const ROW_1117 = [46343, "화", 889_000, 0, 889_000, 12, 889_000, 0, 0, 889_000, 0, 0];
// 2026-11-16 실제 줄 — 토스페이카드 70,000 과 토스페이계좌 40,000 이 섞여 있다
const ROW_1116 = [46342, "월", 1_186_000, 43_000, 1_143_000, 14, 1_143_000, 0, 0, 1_033_000, 70_000, 40_000];
const SUM = ["합계", "", 1_653_000, 60_000, 1_593_000, 22, 1_593_000, 0, 0, 1_460_000, 0, 133_000];

const grid = (...rows: unknown[][]) => [["당일매출종합현황 (일별종합)"], [], ["조회일자 : 2026-11-17 ~ 2026-11-18"], [], [], HEADER_GROUP, HEADER, ...rows] as never[][];

describe("포스 일별종합 읽기", () => {
  it("실매출과 결제수단을 날짜별로 읽는다 — 간편결제는 카드승인현황에 없다", () => {
    const p = parsePosDaily(grid(ROW_1117, ROW_1118, SUM));
    expect(p.from).toBe("2026-11-17");
    expect(p.to).toBe("2026-11-18");
    expect(p.days).toHaveLength(2); // 맨 아래 "합계" 줄은 날짜가 아니라 빠진다
    const d = p.days[1];
    expect(d.date).toBe("2026-11-18");
    expect(d.grossSales).toBe(764_000);
    expect(d.discount).toBe(60_000);
    expect(d.netSales).toBe(704_000);
    expect(d.card).toBe(571_000);
    expect(d.receipts).toBe(10);
    expect(d.byChannel).toEqual({ card_easy: 133_000 }); // 토스페이계좌
    expect(d.payCard).toBe(0);
    // 실매출 = 신용카드 + 간편결제 (2026-11-18 실측)
    expect(d.card + d.byChannel.card_easy).toBe(d.netSales);
    expect(p.byChannel).toEqual({ card_easy: 133_000 });
    expect(p.netSales).toBe(1_593_000);
  });

  it("토스페이카드는 간편결제가 아니다 — 돈이 카드사에서 들어와 「신용카드」에 이미 들어 있다", () => {
    expect(payMethodToChannel("토스페이계좌")).toBe("card_easy");
    expect(payMethodToChannel("토스페이머니")).toBe("card_easy");
    expect(payMethodToChannel("카카오페이")).toBe("card_easy");
    expect(payMethodToChannel("제로페이")).toBe("card_zeropay");
    expect(payMethodToChannel("토스페이카드")).toBeNull();
    expect(payMethodToChannel("신용카드")).toBeNull();
    expect(payMethodToChannel("제휴카드")).toBeNull();
    expect(payMethodToChannel("단순현금")).toBeNull();
  });

  it("토스페이카드는 간편결제에 안 넣고 따로 센다 — 어느 카드사인지 이 파일엔 없다", () => {
    const p = parsePosDaily(grid(ROW_1116, ROW_1117, ROW_1118));
    const d = p.days[0];
    expect(d.date).toBe("2026-11-16");
    expect(d.byChannel).toEqual({ card_easy: 40_000 }); // 토스페이계좌만
    expect(d.payCard).toBe(70_000); // 토스페이카드는 따로
    // 실매출 = 신용카드 + 토스페이카드 + 토스페이계좌 (2026-11-16 실측)
    expect(d.card + d.payCard + d.byChannel.card_easy).toBe(d.netSales);
    expect(p.payCard).toBe(70_000);
    expect(p.payCardDays).toEqual(["2026-11-16"]);
    expect(isPayCardColumn("토스페이카드")).toBe(true);
    expect(isPayCardColumn("토스페이계좌")).toBe(false);
    expect(isPayCardColumn("제휴카드")).toBe(false); // "페이"가 없다
    expect(isPayCardColumn("신용카드")).toBe(false);
  });

  it("일별종합 파일이 아니면 알려 준다", () => {
    expect(() => parsePosDaily([["영업일자", "매입사", "승인금액"]] as never[][])).toThrow(PosDailyError);
  });
});

describe("카드 합계를 포스 신용카드와 대조", () => {
  const p = parsePosDaily(grid(ROW_1117, ROW_1118, SUM));

  it("같으면 알릴 게 없다", () => {
    expect(posCardGaps(p, new Map([["2026-11-17", 889_000], ["2026-11-18", 571_000]]))).toEqual([]);
  });

  it("카드 파일이 덜 왔으면 그 날을 집어낸다", () => {
    expect(posCardGaps(p, new Map([["2026-11-17", 889_000], ["2026-11-18", 400_000]]))).toEqual([
      { date: "2026-11-18", pos: 571_000, file: 400_000, gap: 171_000 },
    ]);
  });

  it("카드 파일에 없는 날은 비교하지 않는다 (받아 온 기간이 다를 수 있다)", () => {
    expect(posCardGaps(p, new Map([["2026-11-18", 571_000]]))).toEqual([]);
  });
});
