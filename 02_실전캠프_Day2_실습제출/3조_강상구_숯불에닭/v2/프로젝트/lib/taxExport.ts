import { CARD_PRESETS, DEFAULT_CHANNELS } from "./categories";
import { purchaseTotal, type Purchase } from "./costing/purchases";
import type { DailySale, Transaction } from "./types";

// 세무사용 엑셀 — 한 달치를 시트 4개로. 보내는 건 사장님이 직접 한다(자동 전송 없음).
//  1) 거래내역: 통장 + 직접 넣은 지출, 분류와 "손익 반영 여부"
//  2) 분류별 합계: 손익에 넣은 것만 대분류·소분류별 (제외한 돈은 따로 합계)
//  3) 매출(일별): 채널(카드사·현금·배달앱)별 일 매출 — 부가세 신고 때 카드·현금·배달 나눠 보기
//  4) 매입 영수증: 영수증 줄 그대로
// 세무사님이 원하는 모양이 오면 여기만 고친다.
export type Cell = string | number;
export interface TaxSheet {
  name: string;
  rows: Cell[][];
}

export function channelName(id: string): string {
  return DEFAULT_CHANNELS.find((c) => c.id === id)?.name ?? CARD_PRESETS.find((c) => c.id === id)?.name ?? id;
}

export function buildTaxSheets(month: string, txs: Transaction[], sales: DailySale[], purchases: Purchase[]): TaxSheet[] {
  const inMonth = txs.filter((t) => t.month === month).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const counted = (t: Transaction) => !!t.major && t.major !== "제외";

  // 1) 거래내역
  const txRows: Cell[][] = [["날짜", "구분", "거래처(통장 표시)", "입금", "출금", "대분류", "소분류", "출처", "손익 반영", "비고"]];
  for (const t of inMonth) {
    txRows.push([
      t.date,
      t.in > 0 ? "입금" : t.out < 0 ? "출금 취소" : "출금",
      t.payee,
      t.in || "",
      t.out || "",
      t.major ?? "미분류",
      t.minor ?? "",
      t.source === "manual" ? `직접 입력${t.payMethod ? `(${t.payMethod})` : ""}` : "통장",
      counted(t) ? "예" : "아니오",
      t.date.slice(0, 7) !== month ? `${t.date.slice(0, 7)} 통장 → ${month} 손익` : "",
    ]);
  }

  // 2) 분류별 합계 (입금은 +, 출금은 −로 보지 않고 각각 칸을 나눈다)
  const sums = new Map<string, { major: string; minor: string; in: number; out: number; n: number }>();
  let exIn = 0;
  let exOut = 0;
  let unIn = 0;
  let unOut = 0;
  for (const t of inMonth) {
    if (!t.major) {
      unIn += t.in;
      unOut += t.out;
      continue;
    }
    if (t.major === "제외") {
      exIn += t.in;
      exOut += t.out;
      continue;
    }
    const k = `${t.major}|${t.minor ?? ""}`;
    const e = sums.get(k) ?? { major: t.major, minor: t.minor ?? "", in: 0, out: 0, n: 0 };
    e.in += t.in;
    e.out += t.out;
    e.n += 1;
    sums.set(k, e);
  }
  const sumRows: Cell[][] = [["대분류", "소분류", "입금 합계", "출금 합계", "건수"]];
  for (const e of [...sums.values()].sort((a, b) => a.major.localeCompare(b.major) || a.minor.localeCompare(b.minor))) sumRows.push([e.major, e.minor, e.in || "", e.out || "", e.n]);
  sumRows.push([]);
  sumRows.push(["손익에 안 넣은 돈 (내 계좌 이체·개인 결제 등)", "", exIn || "", exOut || "", ""]);
  if (unIn || unOut) sumRows.push(["미분류 (확인 필요)", "", unIn || "", unOut || "", ""]);

  // 3) 매출(일별) — 채널이 열
  const monthSales = sales.filter((s) => s.date.startsWith(month));
  const channels = [...new Set(monthSales.map((s) => s.channel))].sort((a, b) => channelOrder(a) - channelOrder(b) || a.localeCompare(b));
  const dates = [...new Set(monthSales.map((s) => s.date))].sort();
  const saleRows: Cell[][] = [["날짜", ...channels.map(channelName), "합계"]];
  const colSum = channels.map(() => 0);
  for (const d of dates) {
    const vals = channels.map((c) => monthSales.filter((s) => s.date === d && s.channel === c).reduce((a, s) => a + s.amount, 0));
    vals.forEach((v, i) => (colSum[i] += v));
    saleRows.push([d, ...vals.map((v) => v || ""), vals.reduce((a, v) => a + v, 0)]);
  }
  if (dates.length) saleRows.push(["합계", ...colSum, colSum.reduce((a, v) => a + v, 0)]);

  // 4) 매입 영수증
  const purRows: Cell[][] = [["날짜", "거래처", "품목", "수량", "단가", "금액", "분류", "영수증 할인", "영수증 합계", "메모"]];
  for (const p of [...purchases].sort((a, b) => (a.date < b.date ? -1 : 1)))
    p.lines.forEach((l, i) => purRows.push([p.date, p.vendor, l.name, l.qty, l.unitPrice, l.amount, l.category, i === 0 && p.discount ? p.discount : "", i === 0 ? purchaseTotal(p) : "", i === 0 ? p.memo ?? "" : ""]));

  return [
    { name: "거래내역", rows: txRows },
    { name: "분류별 합계", rows: sumRows },
    { name: "매출(일별)", rows: saleRows },
    { name: "매입 영수증", rows: purRows },
  ];
}

// 매출 열 순서: 카드사 → 간편결제 → 현금 → 배달앱 → 기타
function channelOrder(id: string): number {
  if (id.startsWith("card_") && id !== "card_easy" && id !== "card_zeropay") return 0;
  if (id === "card_easy" || id === "card_zeropay" || id === "hall_card") return 1;
  if (id === "hall_cash") return 2;
  if (["baemin", "coupang", "yogiyo", "etc"].includes(id)) return 3;
  return 4;
}

export const taxFileName = (month: string) => `숯불에닭_세무사용_${month}.xlsx`;
