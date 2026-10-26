import { describe, expect, it } from "vitest";
import { gasBizDays, gasRows, parseGasSms, upsertGasBills, yearAgo, type DayBiz } from "./gasBills";

// 평화가스 요금안내 문자 모양 (2026-10 실제 문자와 같은 줄 모양, 고객 정보는 뺌)
const sms = (o: { ym: string; from: string; to: string; now: number; prev: number; m3: number; fee: string; amount?: string; note?: string }) => `[Web발신]
평화가스
${o.ym.slice(0, 4)}년 ${o.ym.slice(5)}월  요금안내

■ 청구내역 요약
 ▷당월 청구금액 : ${o.amount ?? o.fee}원
 ▷납부마감일 : 2026.11.10 까지

■ 요금상세 내역
 ▷사용기간 : ${o.from} ~ ${o.to}
 ▷당월지침 : ${o.now}㎥
 ▷전월지침 : ${o.prev}㎥
 ▷사 용 량 : ${o.m3}㎥
 ▷사용요금 : ${o.fee}원
 ▷청구금액 : ${o.amount ?? o.fee}원

※ 추가안내사항
안녕하세요.
${Number(o.ym.slice(5))}월 단가 ${o.note ?? "동결"} 입니다.
항상 평화에너지를 이용해 주셔서 감사드립니다.~^^
`;

const oct = sms({ ym: "2026-10", from: "2026.09.22", to: "2026.10.26", now: 4416, prev: 4370, m3: 46, fee: "294,170", note: "Kg당 80원 인상" });
const sep = sms({ ym: "2026-09", from: "2026.08.26", to: "2026.09.21", now: 4370, prev: 4334, m3: 36, fee: "223,020" });

describe("가스 요금안내 문자 읽기", () => {
  it("기간·지침·사용량·요금·단가 안내를 읽는다", () => {
    const { bills, errors } = parseGasSms(oct);
    expect(errors).toEqual([]);
    expect(bills).toEqual([
      { month: "2026-10", from: "2026-09-22", to: "2026-10-26", meterPrev: 4370, meterNow: 4416, m3: 46, fee: 294170, amount: 294170, priceNote: "Kg당 80원 인상", due: "2026-11-10" },
    ]);
  });
  it("문자 여러 개를 한꺼번에 붙여도 나눠 읽는다", () => {
    expect(parseGasSms(sep + "\n" + oct).bills.map((b) => b.month)).toEqual(["2026-09", "2026-10"]);
  });
  it("사용요금과 청구금액이 다르면(10원 단위 끊기) 따로 둔다", () => {
    const b = parseGasSms(sms({ ym: "2026-07", from: "2026.06.25", to: "2026.07.23", now: 4300, prev: 4267, m3: 33, fee: "204,435", amount: "204,440" })).bills[0];
    expect([b.fee, b.amount]).toEqual([204435, 204440]);
  });
  it("지침 차이와 사용량이 다르면 알려 준다, 가스 문자가 아니면 거른다", () => {
    expect(parseGasSms(oct.replace("46㎥", "40㎥")).errors[0]).toMatch(/지침 차이/);
    expect(parseGasSms("안녕하세요").errors[0]).toMatch(/요금안내/);
  });
  it("같은 청구월은 바꾼다", () => {
    const a = parseGasSms(oct).bills;
    const r = upsertGasBills(upsertGasBills([], a).list, [...parseGasSms(sep).bills, ...a]);
    expect([r.list.map((b) => b.month), r.added, r.replaced]).toEqual([["2026-09", "2026-10"], 1, 1]);
  });
});

describe("가스 사용량을 매출로 나눠 보기", () => {
  it("장부가 15일 넘게 든 달은 장부, 아닌 달은 지난 매출 — 영수 건수는 지난 매출에서", () => {
    const sales = [
      ...Array.from({ length: 15 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, amount: 100, hall: true })),
      { date: "2026-10-01", amount: 50, hall: false },
      { date: "2026-09-30", amount: 999, hall: true }, // 9월은 하루뿐 → 지난 매출
    ];
    const hist = [
      { date: "2026-09-30", hall: 300, receipts: 3, customers: null, baemin: 20 },
      { date: "2026-10-01", hall: 77, receipts: 9, customers: null },
    ];
    const m = gasBizDays(sales, hist);
    expect(m.get("2026-09-30")).toEqual({ hall: 300, all: 320, receipts: 3 });
    expect(m.get("2026-10-01")).toEqual({ hall: 100, all: 150, receipts: 9 });
    expect(m.get("2026-10-02")).toEqual({ hall: 100, all: 100, receipts: null });
  });
  it("하루 사용량·㎥당 단가·홀 100만당·100팀당·매출 대비, 지침이 끊기면 표시", () => {
    const bills = [...parseGasSms(sep).bills, ...parseGasSms(oct.replace("전월지침 : 4370", "전월지침 : 4371").replace("46㎥", "45㎥")).bills];
    const biz = new Map<string, DayBiz>();
    for (let d = 22; d <= 30; d++) biz.set(`2026-09-${d}`, { hall: 1_000_000, all: 1_200_000, receipts: 10 });
    const [, r] = gasRows(bills, biz);
    expect(r).toMatchObject({ days: 35, unitPrice: 6537, perDay: 1.29, hallSales: 9_000_000, missingDays: 26, perHall: 5, per100Teams: 50, costPct: 2.72, meterGap: true });
  });
  it("영수 건수가 빠진 날이 있으면 100팀당은 비운다, 작년 같은 달과 견준다", () => {
    const a = { ...parseGasSms(oct).bills[0], month: "2025-10", fee: 100_000, m3: 50 };
    const b = { ...parseGasSms(oct).bills[0], fee: 120_000, m3: 50 };
    const biz = new Map<string, DayBiz>([["2026-09-22", { hall: 1, all: 1, receipts: null }]]);
    const rows = gasRows([a, b], biz);
    expect(rows[1].per100Teams).toBeNull();
    expect(yearAgo(rows, "2026-10", (r) => r.unitPrice)).toBe(20);
    expect(yearAgo(rows, "2025-10", (r) => r.unitPrice)).toBeNull();
  });
});
