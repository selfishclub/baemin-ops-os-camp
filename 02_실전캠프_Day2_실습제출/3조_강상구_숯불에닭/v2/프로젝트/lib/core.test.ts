import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";
import { BankParseError, parseAmount, parseBankSheet, parseDate } from "./bank/parse";
import { classifyRows, findRule, ruleFromChoice, LARGE_AMOUNT } from "./classify";
import { channelFees } from "./channels";
import { computePnl } from "./pnl";
import { checkChannelSale, checkExpense } from "./validate";
import { closeMonth, findOverlap, logEdit, prevMonth } from "./month";
import { sampleChannelSales, seedRules } from "./seed";
import { isValidCategory } from "./categories";
import type { Transaction } from "./types";

const tx = (p: Partial<Transaction>): Transaction => ({
  id: "t", date: "2026-08-01", month: "2026-08", payee: "x", out: 0, in: 0,
  source: "bank", major: null, minor: null, channel: null, review: null, ...p,
});

describe("은행 엑셀 읽기", () => {
  it("머리줄이 몇 줄 아래에 있어도 찾는다", () => {
    const r = parseBankSheet([
      ["거래내역조회"], [],
      ["거래일시", "적요", "기재내용", "출금액", "입금액", "잔액"],
      ["2026.08.03 10:11:12", "인터넷", "가나식품", "2,100,000", "", "1"],
      ["2026-08-01", "타행", "우아한형제들", "", 1900000, "2"],
      ["합계", "", "", "", "", ""],
    ]);
    expect(r.rows).toHaveLength(2);
    expect(r.from).toBe("2026-08-01");
    expect(r.rows[1]).toEqual({ date: "2026-08-03", payee: "가나식품", out: 2100000, in: 0 });
  });
  it("은행 파일이 아니면 안내한다", () => {
    expect(() => parseBankSheet([["메뉴", "가격"], ["닭", 1]])).toThrow(BankParseError);
  });
  it("날짜·금액 모양", () => {
    expect(parseDate("20260803")).toBe("2026-08-03");
    expect(parseDate(46237)).toBe("2026-08-03");
    expect(parseDate("합계")).toBeNull();
    expect(parseAmount("1,234원")).toBe(1234);
    expect(parseAmount("")).toBe(0);
  });
});

describe("자동 분류", () => {
  const rules = seedRules();
  it("긴 키워드가 이긴다, 방향이 맞아야 한다", () => {
    expect(findRule({ date: "", payee: "관리비(상가)", out: 1, in: 0 }, rules)?.major).toBe("임대료");
    expect(findRule({ date: "", payee: "우아한형제들", out: 1, in: 0 }, rules)).toBeNull();
  });
  it("처음 보는 거래처·애매한 곳·큰 금액은 확인 필요", () => {
    const [unknown, mart, big, ok] = classifyRows(
      [
        { date: "2026-08-01", payee: "동네철물점", out: 100, in: 0 },
        { date: "2026-08-01", payee: "우리동네마트", out: 100, in: 0 },
        { date: "2026-08-01", payee: "가나식품", out: LARGE_AMOUNT, in: 0 },
        { date: "2026-08-01", payee: "가나식품", out: 100, in: 0 },
      ],
      rules,
    );
    expect(unknown.major).toBeNull();
    expect(unknown.review).toBe("처음 보는 거래처");
    expect(mart.review).toBe("재료비/생활비 애매");
    expect(big.review).toBe("금액이 큼");
    expect(ok.review).toBeNull();
    expect(ok.minor).toBe("원재료비");
  });
  it("직접 고르면 규칙이 되고 다음부터 자동 분류", () => {
    const rule = ruleFromChoice({ payee: "동네철물점", in: 0, out: 1 }, "영업비", "소모품비");
    const [t] = classifyRows([{ date: "2026-09-01", payee: "동네철물점", out: 5000, in: 0 }], [...rules, rule]);
    expect(t.minor).toBe("소모품비");
    expect(t.review).toBeNull();
  });
  it("시드 규칙의 항목은 모두 항목 체계 안에 있다", () => {
    for (const r of rules) expect(isValidCategory(r.major, r.minor)).toBe(true);
  });
});

describe("손익", () => {
  const sales = sampleChannelSales("2026-08");
  const txs = [
    tx({ payee: "가나식품", out: 8_000_000, major: "매출원가", minor: "원재료비" }),
    tx({ payee: "본사", out: 1_000_000, major: "가맹수수료", minor: "가맹수수료" }),
    tx({ payee: "월세", out: 2_000_000, major: "임대료", minor: "임대료" }),
    tx({ payee: "생활비", out: 2_500_000, major: "기타", minor: "생활비" }),
    tx({ payee: "우아한형제들", in: 7_650_000, major: "수입", minor: "매출액", channel: "baemin" }),
  ];
  const pnl = computePnl(txs, sales);

  it("매출은 채널 주문금액 합계 — 통장 입금을 또 더하지 않는다", () => {
    expect(pnl.hallRevenue).toBe(14_000_000);
    expect(pnl.revenue).toBe(31_000_000);
    expect(pnl.revenueBasis).toBe("실매출");
  });
  it("임대료가 영업이익에 반영된다", () => {
    const rent = pnl.lines.find((l) => l.label === "임대료")!;
    expect(rent.amount).toBe(2_000_000);
    const fee = 1_350_000 + 900_000 + 280_000 + 70_000;
    expect(pnl.deliveryFee).toBe(fee);
    expect(pnl.operatingProfit).toBe(31_000_000 - 8_000_000 - 1_000_000 - 2_000_000 - fee);
  });
  it("생활비는 비용이 아니라 내가 가져간 돈", () => {
    expect(pnl.ownerDraw).toBe(2_500_000);
    expect(pnl.lines.find((l) => l.label === "기타")!.amount).toBe(0);
  });
  it("채널 입력이 없으면 입금액 기준", () => {
    const p = computePnl(txs, []);
    expect(p.revenueBasis).toBe("입금액");
    expect(p.revenue).toBe(7_650_000);
    expect(p.deliveryFee).toBe(0);
  });
});

describe("수수료율·입금 대조 (주문일 기준)", () => {
  const sale = (p: Partial<import("./types").ChannelSale>) => ({
    month: "2026-08", channel: "baemin" as const, name: "배민", orders: 9_000_000, deposit: 7_650_000, count: 300, ...p,
  });
  it("수수료율은 같은 주문분끼리: 9,000,000 → 7,650,000 이면 15.0%", () => {
    const [f] = channelFees([sale({})], []);
    expect(f.fee).toBe(1_350_000);
    expect(f.feeRate).toBe(15);
  });
  it("들어와야 할 돈 = 지난달 미입금 + 이 달 정산금액 − 이 달 말 미입금", () => {
    const bank = [tx({ in: 7_500_000, channel: "baemin", major: "수입" })];
    const prev = [sale({ month: "2026-07", unsettled: 300_000 })];
    const [f] = channelFees([sale({ unsettled: 450_000 })], bank, prev);
    expect(f.expectedBank).toBe(300_000 + 7_650_000 - 450_000);
    expect(f.gap).toBe(0);
    expect(f.gapKind).toBe("확정");
  });
  it("월말 미입금액을 안 넣으면 차이에 정산 시차가 섞여 있다고 알린다", () => {
    const [f] = channelFees([sale({ unsettled: null })], [tx({ in: 7_200_000, channel: "baemin", major: "수입" })]);
    expect(f.gap).toBe(450_000);
    expect(f.gapKind).toBe("시차 포함");
  });
  it("홀은 수수료율을 계산하지 않는다", () => {
    const [f] = channelFees([sale({ channel: "hall", name: "홀" })], []);
    expect(f.feeRate).toBeNull();
    expect(f.fee).toBe(0);
  });
});

describe("이상한 숫자", () => {
  it("입금 > 주문, 10배, 음수", () => {
    expect(checkChannelSale({ name: "배민", orders: 100, deposit: 200, count: 1 })[0].level).toBe("warn");
    expect(checkChannelSale({ name: "배민", orders: 1000, deposit: 900, count: 1 }, 100)[0].level).toBe("warn");
    expect(checkChannelSale({ name: "배민", orders: -1, deposit: 0, count: 0 })[0].level).toBe("error");
    expect(checkChannelSale({ name: "배민", orders: 1000, deposit: 900, count: 1, unsettled: 950 })[0].level).toBe("warn");
    expect(checkExpense(0, "2026-08-01")[0].level).toBe("error");
  });
});

describe("마감·중복", () => {
  it("기간이 겹치면 중복", () => {
    const ups = [{ id: "u", month: "2026-08", from: "2026-08-01", to: "2026-08-31", rowCount: 1, uploadedAt: "" }];
    expect(findOverlap(ups, "2026-08-15", "2026-09-10")).not.toBeNull();
    expect(findOverlap(ups, "2026-09-01", "2026-09-30")).toBeNull();
  });
  it("마감 뒤 수정만 기록된다", () => {
    expect(logEdit(null, "x")).toBeNull();
    const c = closeMonth("2026-08", null);
    expect(logEdit(c, "가나식품 분류 바꿈")!.edits).toHaveLength(1);
    expect(prevMonth("2026-01")).toBe("2025-12");
  });
});

describe("시연 파일 한 바퀴", () => {
  it("가짜 엑셀을 읽어 시드 규칙으로 대부분 자동 분류한다", () => {
    const file = path.join(__dirname, "..", "public", "sample", "가짜_거래내역_2026-08.xlsx");
    const wb = XLSX.read(fs.readFileSync(file), { type: "buffer" });
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true }) as never[][];
    const parsed = parseBankSheet(grid);
    const txs = classifyRows(parsed.rows, seedRules());
    const unknown = txs.filter((t) => !t.major);
    expect(txs.length).toBeGreaterThanOrEqual(60);
    expect(unknown).toHaveLength(7);
    const fees = channelFees(sampleChannelSales("2026-08"), txs);
    const of = (c: string) => fees.find((f) => f.channel === c)!;
    expect(of("baemin").gap).toBe(0); // 월말 미입금 45만 원을 빼면 통장과 일치
    expect(of("hall_card").gap).toBe(0);
    expect(of("coupang").gap).toBe(50_000); // 진짜 차이
    expect(of("coupang").gapKind).toBe("확정");
    expect(of("yogiyo").gapKind).toBe("시차 포함"); // 월말 미입금액을 안 넣음
    expect(of("yogiyo").gap).toBe(120_000);
    const pnl = computePnl(txs, sampleChannelSales("2026-08"));
    expect(pnl.lines.find((l) => l.label === "임대료")!.amount).toBe(2_230_000);
  });
});

describe("농협 형식 — 거래내용 + 거래기록사항", () => {
  it("두 칸을 붙여 거래처로 만든다 (같은 '거래내용'이라도 구분되게)", () => {
    const grid = [
      ["입출금거래내역"],
      ["(단위: 원)"],
      ["순번", "거래일시", "출금금액", "입금금액", "거래후잔액", "거래내용", "거래기록사항", "거래점", "거래메모"],
      ["1", "2026/09/18  10:00:00", null, 100000, 1, "PC우리은행", "현281264099", "농협"],
      ["2", "2026/09/18  10:01:00", null, 50000, 1, "PC우리은행", "우601945546", "농협"],
      ["3", "2026/09/18  10:02:00", null, 30000, 1, "PC신한은행", "쿠팡페이주식회", "농협"],
      ["4", "2026/09/18  10:03:00", 10600, null, 1, "NH체크", "가짜편의점", "농협"],
    ];
    const p = parseBankSheet(grid as never[][]);
    expect(p.rows.map((r) => r.payee)).toEqual(["PC우리은행 현281264099", "PC우리은행 우601945546", "PC신한은행 쿠팡페이주식회", "NH체크 가짜편의점"]);
    expect(p.rows[0].in).toBe(100000);
    expect(p.rows[3].out).toBe(10600);
  });
});

describe("환급·결제 취소 입금", () => {
  const tx = (o: Partial<Transaction>): Transaction => ({ id: "x", date: "2026-09-10", payee: "p", out: 0, in: 0, month: "2026-09", source: "bank", major: null, minor: null, channel: null, review: null, ...o });
  it("비용 항목으로 분류한 입금은 매출이 아니라 그 비용에서 뺀다", () => {
    const txs = [
      tx({ payee: "가짜마트", out: 300_000, major: "매출원가", minor: "원재료비" }),
      tx({ payee: "카드대금 매출취소", in: 100_000, major: "매출원가", minor: "원재료비" }),
      tx({ payee: "가짜 월세", out: 1_000_000, major: "임대료", minor: "임대료" }),
    ];
    const pnl = computePnl(txs, []);
    expect(pnl.revenue).toBe(0);
    expect(pnl.lines.find((l) => l.label === "매출원가")!.amount).toBe(200_000);
    expect(pnl.operatingProfit).toBe(-1_200_000);
  });
});
