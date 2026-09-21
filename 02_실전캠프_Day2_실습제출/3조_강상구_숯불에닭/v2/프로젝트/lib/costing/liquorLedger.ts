import type { Item } from "./types";
import type { Purchase, PurchaseLine } from "./purchases";
import { matchItem, parseDate } from "./receiptText";

// 주류 도매상 "매출원장" 엑셀 읽기 — 도매상 쪽 판매 기록이라 가게 쪽에선 매입 기록이다.
//  - 머리줄 두 줄(일자·품목·규격·매출유형·수량·금액·보증금… / 코드·품목명·BOX·EA·공급가·부가세·소계·용기·공병)을 찾아 열 위치를 정한다
//  - 입고일마다 매입 영수증 한 건으로 만든다. 술값 = 소계(공급가 + 부가세)
//  - 보증금(용기·공병)은 빈병을 돌려주면 돌아오는 돈이라 원가가 아니다. 메모로만 남긴다
//  - "< 일 계 >" 줄로 검산한다
export class LiquorParseError extends Error {}

// 한 박스에 몇 병 (사장님 확인 2026-09-21: 맥주 500ml 20병, 소주 360ml 30병)
export const BOTTLES_PER_BOX: Record<number, number> = { 360: 30, 500: 20 };
export function bottlesPerBox(specMl: number | null): number | null {
  return specMl !== null && BOTTLES_PER_BOX[specMl] ? BOTTLES_PER_BOX[specMl] : null;
}

type Cell = string | number | Date | null | undefined;
const text = (v: Cell) => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());
const key = (v: Cell) => text(v).replace(/\s+/g, "");
const num = (v: Cell) => {
  if (typeof v === "number") return v;
  const n = Number(text(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function cellDate(v: Cell): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 30000 && v < 80000) {
    // 엑셀 날짜 일련번호
    return new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  }
  const s = text(v);
  if (!/\d/.test(s)) return "";
  return parseDate(s);
}

/** "신_후레쉬(유)" → "후레쉬", "신_카스맥주(유)500" → "카스맥주", "처음처럼리뉴얼(유)" → "처음처럼" */
export function cleanLiquorName(name: string): string {
  return name
    .replace(/^신_/, "")
    .replace(/\((유|무|페트|캔|병)\)/g, "")
    .replace(/리뉴얼/g, "")
    .replace(/(\d{3,4})(ml)?$/i, "")
    .replace(/_/g, " ")
    .trim();
}

export interface LiquorLine {
  code: string;
  name: string; // 원장에 적힌 그대로
  displayName: string; // 품목 연결·표시용
  specMl: number | null;
  box: number;
  ea: number; // 낱병
  subtotal: number; // 공급가 + 부가세 (= 술값)
  crateDeposit: number; // 용기(상자) 보증금
  bottleDeposit: number; // 공병 보증금
  bottles: number | null; // 병 수 (박스당 병 수를 알 때)
  perBottle: number | null; // 병당 술값 (부가세 포함)
}

export interface LiquorDay {
  date: string;
  lines: LiquorLine[];
  subtotal: number;
  deposit: number; // 이날 낸 보증금 (용기 + 공병)
  returned: number; // 이날 돌려받은 보증금 (빈병 반납)
  paid: number; // 이날 낸 돈 (현금·주류카드·기타입금)
  checked: boolean; // 일계 줄과 맞춰 봤는지
  mismatch: string | null;
}

export interface LiquorLedger {
  days: LiquorDay[];
  balance: number | null; // 파일 마지막 채권잔액 (= 아직 안 낸 외상)
  totals: { box: number; subtotal: number; deposit: number; returned: number };
  notes: string[];
}

export function parseLiquorLedgerGrid(grid: Cell[][]): LiquorLedger {
  const hi = grid.findIndex((r) => (r ?? []).some((c) => key(c) === "일자") && (r ?? []).some((c) => key(c).includes("보증금")));
  if (hi < 0 || !grid[hi + 1]) throw new LiquorParseError("주류 매출원장 모양이 아니에요. ‘일자’와 ‘보증금’이 있는 머리줄을 찾지 못했어요.");
  const top = grid[hi].map(key);
  const sub = grid[hi + 1].map(key);
  const width = Math.max(top.length, sub.length);
  const findTop = (k: string) => top.findIndex((c) => c === k);
  const findSub = (k: string) => {
    for (let i = 0; i < width; i++) if (sub[i] === k) return i;
    return -1;
  };
  const col = {
    date: findTop("일자"),
    spec: findTop("규격"),
    type: findTop("매출유형"),
    code: findSub("코드"),
    name: findSub("품목명"),
    box: findSub("BOX"),
    ea: findSub("EA"),
    subtotal: findSub("소계"),
    crate: findSub("용기"),
    bottle: findSub("공병"),
    depositIn: findTop("보증금입금"),
    cash: findTop("현금"),
    card: findTop("주류카드"),
    etcIn: findTop("기타입금"),
    balance: findTop("채권잔액"),
  };
  const missing = (["date", "name", "box", "subtotal"] as const).filter((k) => col[k] < 0);
  if (missing.length) throw new LiquorParseError(`주류 매출원장에서 필요한 칸을 못 찾았어요: ${missing.join(", ")}`);
  const at = (r: Cell[], i: number) => (i >= 0 ? r[i] : null);

  const days: LiquorDay[] = [];
  const notes: string[] = [];
  let day: LiquorDay | null = null;
  let balance: number | null = null;

  for (let i = hi + 2; i < grid.length; i++) {
    const r = grid[i] ?? [];
    if (!r.some((c) => text(c) !== "")) continue;
    const first = key(at(r, col.date));
    if (col.balance >= 0 && text(at(r, col.balance)) !== "") balance = num(at(r, col.balance));

    // 일계 줄 — 검산
    if (first.startsWith("<") && first.includes("일계")) {
      if (day) {
        const wantSub = num(at(r, col.subtotal));
        const wantDep = num(at(r, col.crate)) + num(at(r, col.bottle));
        day.checked = true;
        const parts: string[] = [];
        if (Math.round(day.subtotal) !== Math.round(wantSub)) parts.push(`술값 ${day.subtotal.toLocaleString()} ≠ 일계 ${wantSub.toLocaleString()}`);
        if (Math.round(day.deposit) !== Math.round(wantDep)) parts.push(`보증금 ${day.deposit.toLocaleString()} ≠ 일계 ${wantDep.toLocaleString()}`);
        day.mismatch = parts.length ? parts.join(", ") : null;
      }
      continue;
    }
    if (first.startsWith("<") || first === "합계") continue; // 월계·합계

    const date = cellDate(at(r, col.date));
    if (date) {
      day = days.find((d) => d.date === date) ?? null;
      if (!day) {
        day = { date, lines: [], subtotal: 0, deposit: 0, returned: 0, paid: 0, checked: false, mismatch: null };
        days.push(day);
      }
    }
    if (!day) continue;

    const type = key(at(r, col.type));
    const name = text(at(r, col.name));
    if (type === "입금" || (!name && num(at(r, col.depositIn)) > 0)) {
      day.returned += num(at(r, col.depositIn));
      day.paid += num(at(r, col.cash)) + num(at(r, col.card)) + num(at(r, col.etcIn));
      continue;
    }
    if (!name) continue;

    const specMl = num(at(r, col.spec)) || null;
    const box = num(at(r, col.box));
    const ea = num(at(r, col.ea));
    const subtotal = num(at(r, col.subtotal));
    const crateDeposit = num(at(r, col.crate));
    const bottleDeposit = num(at(r, col.bottle));
    const perBox = bottlesPerBox(specMl);
    const bottles = perBox !== null ? box * perBox + ea : box === 0 && ea > 0 ? ea : null;
    day.lines.push({
      code: text(at(r, col.code)),
      name,
      displayName: cleanLiquorName(name),
      specMl,
      box,
      ea,
      subtotal,
      crateDeposit,
      bottleDeposit,
      bottles,
      perBottle: bottles ? Math.round((subtotal / bottles) * 10) / 10 : null,
    });
    day.subtotal += subtotal;
    day.deposit += crateDeposit + bottleDeposit;
  }

  const withLines = days.filter((d) => d.lines.length > 0 || d.returned > 0);
  if (withLines.every((d) => d.lines.length === 0)) throw new LiquorParseError("입고된 술 줄을 하나도 못 읽었어요.");
  for (const d of withLines) {
    if (d.mismatch) notes.push(`${d.date} 검산이 안 맞아요: ${d.mismatch}`);
    else if (!d.checked && d.lines.length) notes.push(`${d.date}는 일계 줄이 없어 검산을 못 했어요.`);
  }
  const unknown = [...new Set(withLines.flatMap((d) => d.lines).filter((l) => l.bottles === null).map((l) => `${l.displayName}(${l.specMl ?? "?"}ml)`))];
  if (unknown.length) notes.push(`박스당 병 수를 몰라 병당 원가를 못 낸 술: ${unknown.join(", ")}`);

  return {
    days: withLines.sort((a, b) => (a.date < b.date ? -1 : 1)),
    balance,
    totals: {
      box: withLines.reduce((a, d) => a + d.lines.reduce((b, l) => b + l.box, 0), 0),
      subtotal: withLines.reduce((a, d) => a + d.subtotal, 0),
      deposit: withLines.reduce((a, d) => a + d.deposit, 0),
      returned: withLines.reduce((a, d) => a + d.returned, 0),
    },
    notes,
  };
}

/** 같은 술을 한데 모아 보기 (미리보기용) */
export function liquorBrands(ledger: LiquorLedger) {
  const m = new Map<string, { displayName: string; specMl: number | null; box: number; bottles: number | null; subtotal: number; perBottle: number | null }>();
  for (const d of ledger.days)
    for (const l of d.lines) {
      const k = `${l.displayName}|${l.specMl}`;
      const e = m.get(k) ?? { displayName: l.displayName, specMl: l.specMl, box: 0, bottles: 0 as number | null, subtotal: 0, perBottle: null };
      e.box += l.box;
      e.bottles = e.bottles === null || l.bottles === null ? null : e.bottles + l.bottles;
      e.subtotal += l.subtotal;
      e.perBottle = l.perBottle; // 가장 최근 단가
      m.set(k, e);
    }
  return [...m.values()].sort((a, b) => b.subtotal - a.subtotal);
}

/** 입고일 하나 → 매입 영수증. id를 날짜로 고정해 같은 파일을 다시 올려도 겹치지 않고 바뀐다 */
export function liquorDayToPurchase(day: LiquorDay, vendor: string, items: Item[]): Purchase {
  const lines: PurchaseLine[] = [];
  let discount = 0;
  for (const l of day.lines) {
    if (l.subtotal < 0) {
      discount += -l.subtotal; // 반품
      continue;
    }
    // 박스로만 들어왔으면 박스 단위, 낱병이 섞이면 병 단위로 적는다 (금액은 원장 그대로)
    const byBox = l.box > 0 && l.ea === 0;
    const qty = byBox ? l.box : l.bottles ?? 1;
    const it = matchItem(l.displayName, items);
    lines.push({
      name: `${l.displayName}${l.specMl ? ` ${l.specMl}ml` : ""}${byBox ? " 박스" : l.bottles ? " 병" : ""}`,
      unitPrice: Math.round(l.subtotal / (qty || 1)),
      qty,
      amount: l.subtotal,
      category: "원재료비",
      itemId: it && l.bottles ? it.id : null,
      itemQty: it && l.bottles ? l.bottles : 0,
    });
  }
  const memo = [
    day.deposit ? `보증금 ${day.deposit.toLocaleString()}원` : "",
    day.returned ? `빈병 반납 ${day.returned.toLocaleString()}원` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    id: `pu_liq_${day.date.replace(/-/g, "")}`,
    date: day.date,
    vendor,
    lines,
    discount,
    memo: `주류 원장에서 읽음${memo ? ` · ${memo} (보증금은 원가에서 뺌)` : ""}`,
  };
}

/** 원가율 품목에 없는 술을 병 단위 품목으로 만든다 (이미 있으면 건너뜀) */
export function newLiquorItems(ledger: LiquorLedger, items: Item[]): Item[] {
  const out: Item[] = [];
  for (const b of liquorBrands(ledger)) {
    if (b.bottles === null || b.perBottle === null) continue;
    if (matchItem(b.displayName, [...items, ...out])) continue;
    out.push({
      id: `it_liq_${b.displayName.replace(/\s+/g, "")}_${b.specMl ?? ""}`,
      name: b.displayName,
      baseUnit: "ea",
      standardCost: b.perBottle,
      category: "drink",
      active: true,
    });
  }
  return out;
}
