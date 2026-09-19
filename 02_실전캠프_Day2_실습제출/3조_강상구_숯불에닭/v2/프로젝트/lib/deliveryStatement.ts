import { parseAmount, parseDate } from "./bank/parse";
import type { ChannelId } from "./categories";

// 배달앱 정산명세서 → 매출일별 주문금액(수수료 빼기 전). 오늘 탭의 배달앱 칸을 한 번에 채우는 데 쓴다.
// 지금은 배달의민족 "정산명세서.xlsx"(사장님 사이트 → 정산 → 정산명세서, 열기 암호는 풀어서)만 읽는다.
//  - "상세" 시트: 한 줄 = 입금일 × 정산대상기간(매출일) × 주문유형
//  - 주문금액 = 바로결제주문금액 + 바로결제배달팁 (앱에서 결제된 돈. 만나서결제는 가게에서 카드·현금으로 받아 포스에 찍히므로 뺀다)
//  - 입금금액 = (H) 입금금액 (수수료·배달비·부가세 다 뺀 실제 입금. 같은 날 여러 줄이면 합)

export class DeliveryStatementError extends Error {}

type Cell = string | number | Date | null | undefined;
const norm = (c: Cell) => String(c ?? "").replace(/\s/g, "");

export interface DeliveryStatementDay {
  date: string; // 매출일
  orders: number; // 앱 결제 주문금액 (배달팁 포함)
  deposit: number; // 그 매출분 실제 입금액 (여러 줄 합)
  depositDate: string | null; // 입금일 (여러 날이면 마지막)
  meetPay: number; // 만나서결제 주문금액 (참고용, 매출에 안 넣음)
}

export interface ParsedDeliveryStatement {
  channel: ChannelId;
  channelName: string;
  from: string;
  to: string;
  days: DeliveryStatementDay[];
  orders: number;
  deposit: number;
  meetPay: number;
  feeRate: number | null; // (주문 − 입금) ÷ 주문, 입금 완료된 날만
  leadDays: number[]; // 매출일 → 입금일 영업일 수 (규칙 확인용, 관측값)
}

function businessDaysBetween(a: string, b: string): number {
  let d = new Date(a + "T00:00:00Z");
  const end = new Date(b + "T00:00:00Z");
  let n = 0;
  while (d < end) {
    d = new Date(d.getTime() + 86400000);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}

export function parseBaeminStatement(sheets: Record<string, Cell[][]>): ParsedDeliveryStatement {
  const grid = sheets["상세"] ?? Object.values(sheets).find((g) => g.slice(0, 10).some((r) => r.some((c) => norm(c) === "정산대상기간")));
  if (!grid) throw new DeliveryStatementError("배민 정산명세서가 아닌 것 같아요. ‘상세’ 시트의 ‘정산대상기간’ 칸을 못 찾았어요. (암호가 걸린 파일이면 먼저 ‘엑셀 암호 풀기’로 푸세요)");
  // 머리줄이 3줄(대분류/중분류/세부) — 세부 줄에서 열을 찾는다
  const top = grid.slice(0, 12);
  const hi = top.findIndex((r) => r.some((c) => norm(c) === "바로결제주문금액"));
  if (hi < 0) throw new DeliveryStatementError("배민 정산명세서 형식이 달라요. ‘바로결제주문금액’ 칸을 못 찾았어요.");
  const h = grid[hi];
  const col = (name: string) => h.findIndex((c) => norm(c) === name);
  const cDeposit = col("입금일");
  const cSaleDate = col("정산대상기간");
  const cOrders = col("바로결제주문금액");
  const cMeet = col("만나서결제주문금액");
  const cTip = col("바로결제배달팁");
  const cIn = h.length - 1 - [...h].reverse().findIndex((c) => norm(c).includes("입금금액")); // 마지막 "(H) 입금금액"
  if (cSaleDate < 0 || cOrders < 0 || cIn < 0) throw new DeliveryStatementError("배민 정산명세서 형식이 달라요. 날짜·주문금액·입금금액 칸을 못 찾았어요.");

  const byDate = new Map<string, DeliveryStatementDay>();
  for (const r of grid.slice(hi + 1)) {
    const date = parseDate(r?.[cSaleDate]);
    if (!date) continue;
    const orders = parseAmount(r[cOrders]) + (cTip >= 0 ? parseAmount(r[cTip]) : 0);
    const meet = cMeet >= 0 ? parseAmount(r[cMeet]) : 0;
    const dep = parseAmount(r[cIn]);
    const depDate = cDeposit >= 0 ? parseDate(r[cDeposit]) : null;
    const d = byDate.get(date) ?? { date, orders: 0, deposit: 0, depositDate: null, meetPay: 0 };
    d.orders += orders;
    d.deposit += dep;
    d.meetPay += meet;
    if (depDate && (!d.depositDate || depDate > d.depositDate)) d.depositDate = depDate;
    byDate.set(date, d);
  }
  if (byDate.size === 0) throw new DeliveryStatementError("정산 줄이 하나도 없어요. 상세 시트에 내역이 있는 파일인지 확인해 주세요.");
  const days = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  const orders = days.reduce((a, d) => a + d.orders, 0);
  const deposit = days.reduce((a, d) => a + d.deposit, 0);
  const meetPay = days.reduce((a, d) => a + d.meetPay, 0);
  const settled = days.filter((d) => d.deposit !== 0 && d.orders > 0);
  const sOrders = settled.reduce((a, d) => a + d.orders, 0);
  const sDeposit = settled.reduce((a, d) => a + d.deposit, 0);
  const feeRate = sOrders > 0 ? Math.round(((sOrders - sDeposit) / sOrders) * 1000) / 10 : null;
  const leadDays = settled.filter((d) => d.depositDate).map((d) => businessDaysBetween(d.date, d.depositDate as string));
  return { channel: "baemin", channelName: "배달의민족", from: days[0].date, to: days[days.length - 1].date, days, orders, deposit, meetPay, feeRate, leadDays };
}
