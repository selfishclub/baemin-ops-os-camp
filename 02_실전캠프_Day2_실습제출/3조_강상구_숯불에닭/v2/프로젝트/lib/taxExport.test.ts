import { describe, expect, it } from "vitest";
import { buildTaxSheets, channelName } from "./taxExport";
import type { Purchase } from "./costing/purchases";
import type { DailySale, Transaction } from "./types";

let n = 0;
const tx = (date: string, payee: string, out: number, inn: number, major: string | null, minor: string | null, extra: Partial<Transaction> = {}): Transaction =>
  ({ id: `t${++n}`, month: date.slice(0, 7), date, payee, out, in: inn, source: "bank", major, minor, channel: null, review: null, ...extra }) as Transaction;

const txs = [
  tx("2026-08-01", "가짜임대인", 2000000, 0, "임대료", "임대료"),
  tx("2026-08-02", "BC카드매출", 0, 610000, "수입", "매출액"),
  tx("2026-08-03", "NH체크 가짜마트", 50000, 0, "매출원가", "원재료비"),
  tx("2026-08-04", "NH체크 가짜편의점", 9600, 0, "제외", "손익에 안 넣음"),
  tx("2026-08-05", "가짜미분류", 1000, 0, null, null),
  tx("2026-08-06", "시장 채소", 30000, 0, "매출원가", "원재료비", { source: "manual", payMethod: "현금" }),
  tx("2026-09-10", "급여(주방)", 2800000, 0, "노무관리비", "노무관리비급여", { month: "2026-08" }), // 다음 달 10일에 나간 8월 급여
  tx("2026-09-03", "9월 거래", 1, 0, "영업비", "잡비"),
];
const sales: DailySale[] = [
  { date: "2026-08-02", channel: "card_kb", amount: 300000 },
  { date: "2026-08-02", channel: "hall_cash", amount: 50000 },
  { date: "2026-08-02", channel: "baemin", amount: 200000 },
  { date: "2026-08-03", channel: "card_kb", amount: 100000 },
];
const purchases: Purchase[] = [{ id: "p1", date: "2026-08-03", vendor: "가짜마트", discount: 2000, memo: "메모", lines: [{ name: "양파", unitPrice: 26000, qty: 2, amount: 52000, category: "원재료비", itemId: null, itemQty: 0 }] }];

describe("세무사용 엑셀", () => {
  const sheets = buildTaxSheets("2026-08", txs, sales, purchases);
  const sheet = (name: string) => sheets.find((s) => s.name === name)!.rows;

  it("시트 4개", () => {
    expect(sheets.map((s) => s.name)).toEqual(["거래내역", "분류별 합계", "매출(일별)", "매입 영수증"]);
  });

  it("거래내역: 그 달 손익에 들어가는 줄만, 다음 달 통장에서 나간 지난달 비용도 표시", () => {
    const rows = sheet("거래내역");
    expect(rows).toHaveLength(1 + 7);
    const salary = rows.find((r) => r[2] === "급여(주방)")!;
    expect(salary[9]).toBe("2026-09 통장 → 2026-08 손익");
    expect(rows.find((r) => r[2] === "NH체크 가짜편의점")![8]).toBe("아니오");
    expect(rows.find((r) => r[2] === "시장 채소")![7]).toBe("직접 입력(현금)");
  });

  it("분류별 합계: 손익에 넣은 것만 묶고, 제외·미분류는 따로", () => {
    const rows = sheet("분류별 합계");
    expect(rows.find((r) => r[0] === "매출원가" && r[1] === "원재료비")![3]).toBe(80000);
    expect(rows.find((r) => String(r[0]).startsWith("손익에 안 넣은 돈"))![3]).toBe(9600);
    expect(rows.find((r) => String(r[0]).startsWith("미분류"))![3]).toBe(1000);
  });

  it("매출(일별): 카드사 → 현금 → 배달앱 순서, 합계 줄", () => {
    const rows = sheet("매출(일별)");
    expect(rows[0]).toEqual(["날짜", channelName("card_kb"), "홀 현금", "배달의민족", "합계"]);
    expect(rows[1]).toEqual(["2026-08-02", 300000, 50000, 200000, 550000]);
    expect(rows[rows.length - 1]).toEqual(["합계", 400000, 50000, 200000, 650000]);
  });

  it("매입 영수증: 영수증 줄 그대로, 첫 줄에 할인·합계", () => {
    expect(sheet("매입 영수증")[1]).toEqual(["2026-08-03", "가짜마트", "양파", 2, 26000, 52000, "원재료비", 2000, 50000, "메모"]);
  });
});
