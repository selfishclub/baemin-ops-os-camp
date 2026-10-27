import { EXCLUDED_MAJOR, EXPENSE_MAJORS, OWNER_DRAW, channelKind, isHall, type Major } from "./categories";
import { feeOf, round1 } from "./channels";
import type { ChannelSale, Transaction } from "./types";
import type { LaborEstimate } from "./labor";
import { totalFixedGap, type FixedCostGap } from "./fixedCosts";
import { expandSplits } from "./txSplit";
import { CARD_CREDIT_RATE, CARD_CREDIT_YEAR_CAP, VAT_RATE, cardCreditEligible, hasInputVat, isVatPayment, type VatBasis } from "./vatBasis";

export interface PnlLine {
  label: string;
  amount: number;
  pct: number | null; // 매출 대비 %
  kind: "revenue" | "cost" | "subtotal" | "result";
  minors?: { label: string; amount: number }[];
}

export interface PnlEstimate {
  kind: "labor" | "material" | "fixed";
  major: Major; // 손익표 어느 줄에 들어갔나
  what: string; // "아직 안 나간 인건비", "아직 안 낸 재료비 (외상)", 고정비 이름
  minor?: string; // 고정비의 소분류 (복식장부 계정)
  amount: number;
}

export interface Pnl {
  revenue: number;
  revenueBasis: "실매출" | "입금액"; // 채널 입력이 없으면 통장 입금액 기준
  hallRevenue: number;
  deliveryRevenue: number;
  otherIncome: number;
  lines: PnlLine[];
  operatingProfit: number;
  operatingMargin: number | null;
  ownerDraw: number; // 내가 가져간 돈(생활비) — 가게 비용 아님
  excluded: { in: number; out: number }; // "제외"로 분류한 돈(내 계좌 이체 등) — 손익에 안 넣음
  deliveryFee: number; // 배달앱 수수료 = 주문금액 − 입금액
  laborEstimated: boolean; // 노무관리비를 어림값(오늘 탭 근무 + 월 고정 인건비)으로 채웠나 — 급여가 통장에서 나가면 false
  materialUnpaid: number; // 매입 영수증에는 있는데 아직 통장에서 안 나간 재료비 (주류 월말 결제, 거래처 외상 등)
  fixedUnpaid: number; // 청구서는 왔는데 아직 통장에서 안 나간 고정비 (석쇠 대여비, 가스요금 등)
  laborUnpaid: number; // 아직 안 나간 인건비 어림 금액
  // 통장에 아직 없어서 어림·청구서 금액으로 채운 몫 (확정 아님). 영업이익에 이만큼 "어림"이 섞여 있다
  estimates: PnlEstimate[];
  unclassified: number; // 아직 분류 안 된 줄 수
  needsReview: number; // 확인 필요 표시가 남은 줄 수
  // 부가세 — vat를 넘기면 매출·비용을 공급가로 보고, 이 달 부가세(맡아 둔 돈)를 따로 센다
  vatBasis: "공급가" | "부가세 포함";
  vat: {
    output: number; // 매출에 들어 있던 부가세 (손님에게 받아 둔 돈)
    input: number; // 비용에 들어 있던 부가세 (돌려받는 돈)
    inputSource: "홈택스" | "어림"; // 홈택스 세금계산서 세액이면 실제, 아니면 비용 ÷1.1 어림
    inputCard: number | null; // 그중 카드로 산 것의 부가세 (홈택스 자료가 있을 때)
    invoiceSupply: number | null; // 홈택스 세금계산서 공급가 (홈택스 자료가 있을 때)
    salesGross: number; // 부가세 포함 매출 (신고서 매출 칸)
    cardBase: number; // 그중 카드·현금영수증·배달앱 결제 (부가세 포함, 카드 매출 세액공제 바탕)
    taxFreeMaterial: number; // 의제매입 바탕이 된 면세 재료 금액
    deemed: number; // 의제매입세액공제 (면세 재료)
    cardCredit: number; // 신용카드 매출 세액공제 (카드·현금영수증·배달앱 매출 × 1.3%, 한 달 몫은 1년 한도 ÷ 12까지)
    due: number; // 이 달 몫 부가세 어림 = output − input − deemed − cardCredit (나중에 예정고지·확정신고로 낸다)
    paid: number; // 이 달 통장에서 낸 부가세 (손익에서 뺌)
  } | null;
}

/** 장부를 그 달 중간에 시작해 일별 매출이 며칠치만 있는 달인가 (2026-08: 8/27부터).
 *  이런 달은 매출을 통장 입금액으로 본다 — 며칠치 매출에서 한 달 비용을 빼면 큰 적자로 찍힌다 (10/27 사장님 "8월 적자 맞아?") */
export function salesStartLate(month: string, daily: { date: string }[]): boolean {
  const first = daily.filter((d) => d.date.startsWith(month)).map((d) => d.date).sort()[0];
  return !!first && first > `${month}-03`;
}

const pct = (amount: number, revenue: number) => (revenue > 0 ? round1((amount / revenue) * 100) : null);

// 손익 순서는 사장님 엑셀의 손익계산서 그대로, 단 임대료를 빠뜨리지 않는다.
// 매출액 → 매출원가 → 매출총이익 → 가맹수수료 → 경영주수입 → 영업비·임대료·세금과공과·노무관리비·기타 → 영업이익
//  materialPurchases: 그 달 매입 영수증의 재료비 합계(원재료비 + 기타재료비).
//    통장에서 나간 재료비보다 많으면 그 차이를 "아직 안 낸 재료비"로 매출원가에 더한다.
//    9월에 받은 재료값을 10월에 내더라도 그 재료비는 9월 원가여서 그렇다 (인건비를 어림으로 채우는 것과 같은 이치).
//  fixedGaps: 매달 나가는 고정비 중 아직 통장에서 안 나간 몫 (lib/fixedCosts.ts)
//  vat: 넘기면 공급가 손익 (lib/vatBasis.ts). 안 넘기면 예전처럼 전부 부가세 포함, 낸 부가세는 세금과공과
export function computePnl(all: Transaction[], sales: ChannelSale[], estimate?: LaborEstimate, materialPurchases = 0, fixedGaps: FixedCostGap[] = [], vat?: VatBasis): Pnl {
  const supplyOf = (n: number) => n / (1 + VAT_RATE);
  let inputVat = 0;
  let vatPaid = 0;
  // 비용 한 줄을 손익에 넣을 금액 (공급가 손익이면 공제받는 부가세를 뺀다)
  const costAmount = (major: string, minor: string, amount: number) => {
    if (!vat || !hasInputVat(major, minor)) return amount;
    inputVat += amount - supplyOf(amount);
    return supplyOf(amount);
  };
  // 나눠 분류한 줄은 몫마다 한 줄로 펴서 센다
  const txs = expandSplits(all);
  const hasSales = sales.some((s) => s.orders > 0);

  // 통장 입금: 채널이 붙은 줄은 대조용. 채널 입력이 있으면 매출로 다시 더하지 않는다(중복 방지).
  let bankChannelIn = 0;
  let otherIncome = 0;
  const excluded = { in: 0, out: 0 };
  for (const t of txs) {
    if (t.major === EXCLUDED_MAJOR) {
      excluded.in += t.in;
      excluded.out += t.out;
    }
  }
  for (const t of txs) {
    if (t.in <= 0 || t.major !== "수입") continue;
    if (t.channel) bankChannelIn += t.in;
    else otherIncome += t.in;
  }

  const hallGross = sales.filter((s) => isHall(s.channel)).reduce((a, s) => a + s.orders, 0);
  const deliveryGross = sales.filter((s) => !isHall(s.channel)).reduce((a, s) => a + s.orders, 0);
  const salesGross = hasSales ? hallGross + deliveryGross : bankChannelIn;
  // 공급가 손익: 음식 매출은 모두 과세라 ÷1.1 (기타 수입은 그대로)
  const hallRevenue = vat ? Math.round(supplyOf(hallGross)) : hallGross;
  const deliveryRevenue = vat ? Math.round(supplyOf(deliveryGross)) : deliveryGross;
  const salesNet = vat ? (hasSales ? hallRevenue + deliveryRevenue : Math.round(supplyOf(bankChannelIn))) : salesGross;
  const revenue = salesNet + otherIncome;
  const deliveryFeeGross = hasSales ? sales.reduce((a, s) => a + feeOf(s), 0) : 0;
  const deliveryFee = Math.round(costAmount("영업비", "배달앱 수수료", deliveryFeeGross));

  // 대분류·소분류별 비용 = 출금 − 같은 항목으로 분류한 입금(환급·결제 취소). 환급은 매출이 아니라 원래 비용에서 빠진다.
  const byMajor = new Map<Major, Map<string, number>>();
  let ownerDraw = 0;
  for (const t of txs) {
    if (!t.major || t.major === "수입" || t.major === EXCLUDED_MAJOR) continue;
    const amount = t.out - t.in;
    if (amount === 0) continue;
    const minor = t.minor ?? "기타";
    if (t.major === OWNER_DRAW.major && minor === OWNER_DRAW.minor) {
      ownerDraw += amount;
      continue;
    }
    // 공급가 손익에서 낸 부가세는 비용이 아니다 (맡아 둔 돈을 낸 것)
    if (vat && isVatPayment(t.major, minor)) {
      vatPaid += amount;
      continue;
    }
    const m = byMajor.get(t.major) ?? new Map<string, number>();
    m.set(minor, (m.get(minor) ?? 0) + costAmount(t.major, minor, amount));
    byMajor.set(t.major, m);
  }
  // 급여가 아직 통장에서 안 나갔으면(다음 달 10일 지급) 어림 인건비로 임시 채운다.
  //  - 어림 = (알바 근무×시급 + 월급 + 4대보험) − 이 달 귀속으로 이미 나간 급여. 모자란 만큼만 "아직 안 나간 인건비"로 더한다.
  //  - 다음 달 날짜로 나간 급여가 이 달 귀속으로 들어오면(지급일 규칙) 급여가 다 나온 것이니 어림값은 빠진다.
  const wageLines = txs.filter((t) => t.major === "노무관리비" && t.minor === "노무관리비급여");
  const paidWages = wageLines.reduce((a, t) => a + t.out - t.in, 0);
  const payrollDone = wageLines.some((t) => t.date.slice(0, 7) > t.month);
  const estTotal = estimate ? estimate.hourly + estimate.salary + estimate.insurance : 0;
  const laborGap = !payrollDone ? Math.max(0, estTotal - paidWages) : 0;
  const laborEstimated = laborGap > 0;
  if (laborEstimated) {
    const m = byMajor.get("노무관리비") ?? new Map<string, number>();
    m.set("아직 안 나간 인건비 (어림)", (m.get("아직 안 나간 인건비 (어림)") ?? 0) + laborGap);
    byMajor.set("노무관리비", m);
  }
  // 아직 안 낸 재료비 (주류 월말 결제, 거래처 외상, 다음 달 10일에 내는 대금).
  // 매입 영수증에는 있는데 통장에서 아직 안 나간 몫을 그 달 원가로 더한다.
  const paidMaterial = [...(byMajor.get("매출원가")?.values() ?? [])].reduce((a, b) => a + b, 0);
  const materialUnpaid = Math.max(0, Math.round(materialPurchases - paidMaterial));
  if (materialUnpaid > 0) {
    const m = byMajor.get("매출원가") ?? new Map<string, number>();
    m.set("아직 안 낸 재료비 (외상)", (m.get("아직 안 낸 재료비 (외상)") ?? 0) + materialUnpaid);
    byMajor.set("매출원가", m);
  }
  // 공급가 손익: 재료비는 영수증의 공급가 비율로, 면세 재료는 의제매입세액공제만큼 덜 든 것으로
  const ratio = vat?.materialSupplyRatio ?? 1;
  if (vat) {
    const m = byMajor.get("매출원가") ?? new Map<string, number>();
    for (const [k, v] of m) {
      inputVat += v * (1 - ratio);
      m.set(k, v * ratio);
    }
    if (vat.deemedInput > 0) m.set("의제매입세액공제 (면세 재료)", -vat.deemedInput);
    byMajor.set("매출원가", m);
  }

  // 청구서는 왔는데 아직 안 낸 고정비 (다음 달 초에 나가는 석쇠 대여비·가스요금 등)
  for (const g of fixedGaps) {
    if (g.gap <= 0) continue;
    const m = byMajor.get(g.cost.major) ?? new Map<string, number>();
    m.set(g.cost.minor, (m.get(g.cost.minor) ?? 0) + costAmount(g.cost.major, g.cost.minor, g.gap));
    byMajor.set(g.cost.major, m);
  }

  if (deliveryFee !== 0) {
    const m = byMajor.get("영업비") ?? new Map<string, number>();
    m.set("배달앱 수수료", (m.get("배달앱 수수료") ?? 0) + deliveryFee);
    byMajor.set("영업비", m);
  }

  // 공급가로 나눈 몫은 소수가 생기니 줄마다 원 단위로 맞춘다
  for (const m of byMajor.values()) for (const [k, v] of m) m.set(k, Math.round(v));
  const total = (major: Major) => [...(byMajor.get(major)?.values() ?? [])].reduce((a, b) => a + b, 0);
  const costLine = (major: Major): PnlLine => ({
    label: major,
    amount: total(major),
    pct: pct(total(major), revenue),
    kind: "cost",
    minors: [...(byMajor.get(major)?.entries() ?? [])]
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount),
  });

  const grossProfit = revenue - total("매출원가");
  const ownerIncome = grossProfit - total("가맹수수료");
  const rest = EXPENSE_MAJORS.filter((m) => m !== "매출원가" && m !== "가맹수수료");
  const operatingProfit = ownerIncome - rest.reduce((a, m) => a + total(m), 0);

  const lines: PnlLine[] = [
    { label: "매출액", amount: revenue, pct: revenue > 0 ? 100 : null, kind: "revenue" },
    costLine("매출원가"),
    { label: "매출총이익", amount: grossProfit, pct: pct(grossProfit, revenue), kind: "subtotal" },
    costLine("가맹수수료"),
    { label: "경영주수입", amount: ownerIncome, pct: pct(ownerIncome, revenue), kind: "subtotal" },
    ...rest.map(costLine),
    { label: "영업이익", amount: operatingProfit, pct: pct(operatingProfit, revenue), kind: "result" },
  ];

  return {
    revenue,
    revenueBasis: hasSales ? "실매출" : "입금액",
    hallRevenue,
    deliveryRevenue,
    otherIncome,
    lines,
    operatingProfit,
    operatingMargin: pct(operatingProfit, revenue),
    ownerDraw,
    excluded,
    laborEstimated,
    materialUnpaid,
    fixedUnpaid: totalFixedGap(fixedGaps),
    laborUnpaid: laborGap,
    estimates: [
      ...(laborGap > 0 ? [{ kind: "labor" as const, major: "노무관리비" as Major, what: "아직 안 나간 인건비", amount: laborGap }] : []),
      ...(materialUnpaid > 0 ? [{ kind: "material" as const, major: "매출원가" as Major, what: "아직 안 낸 재료비 (외상)", amount: Math.round(materialUnpaid * ratio) }] : []),
      ...fixedGaps.filter((g) => g.gap > 0).map((g) => ({ kind: "fixed" as const, major: g.cost.major, what: g.cost.name || g.cost.minor, minor: g.cost.minor, amount: vat && hasInputVat(g.cost.major, g.cost.minor) ? Math.round(supplyOf(g.gap)) : g.gap })),
    ],
    deliveryFee,
    unclassified: all.filter((t) => !t.major).length,
    needsReview: all.filter((t) => t.review).length,
    vatBasis: vat ? "공급가" : "부가세 포함",
    vat: vat
      ? (() => {
          const output = salesGross - salesNet;
          const cardBase = sales.filter((x) => cardCreditEligible(x.channel, channelKind(x.channel))).reduce((a, x) => a + x.orders, 0);
          const cardCredit = Math.min(Math.round(cardBase * CARD_CREDIT_RATE), Math.round(CARD_CREDIT_YEAR_CAP / 12));
          const input = vat.inputActual ?? Math.round(inputVat);
          return { output, input, inputSource: vat.inputActual !== undefined ? ("홈택스" as const) : ("어림" as const), inputCard: vat.inputCard ?? null, invoiceSupply: vat.invoiceSupply ?? null, salesGross, cardBase, taxFreeMaterial: vat.taxFreeMaterial, deemed: vat.deemedInput, cardCredit, due: output - input - vat.deemedInput - cardCredit, paid: vatPaid };
        })()
      : null,
  };
}

// 지난달 대비 증감 (같은 label끼리)
export function compareLines(now: Pnl, prev: Pnl | null): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const line of now.lines) {
    const p = prev?.lines.find((l) => l.label === line.label);
    out[line.label] = p ? line.amount - p.amount : null;
  }
  return out;
}
