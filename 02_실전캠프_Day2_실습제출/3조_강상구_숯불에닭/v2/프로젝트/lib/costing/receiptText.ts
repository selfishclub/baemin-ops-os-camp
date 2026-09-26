import type { Item } from "./types";
import type { PurchaseLine } from "./purchases";

// 영수증 텍스트 읽기 — 클로드·챗GPT 앱에 영수증 사진을 올려 받은 텍스트를 매입 영수증 줄로 바꾼다.
//  - 사진을 이 앱(또는 코딩 창)이 직접 읽으면 비용이 크다. 사진은 사장님 구독으로 읽고, 앱은 글자만 받는다.
//  - 형식이 조금 틀어져도(탭·쉼표·여러 칸 띄우기, 줄 순서 뒤바뀜) 읽히게 한다. 읽은 결과는 화면에서 보고 고칠 수 있다.
export const RECEIPT_PROMPT = `영수증 사진을 읽어 아래 형식의 텍스트만 출력해. 설명 없이.
거래처: (상호)
날짜: YYYY-MM-DD
상품명 | 단가 | 수량 | 금액   (한 줄에 하나)
할인: (총 할인액, 없으면 0)
합계: (영수증 합계)`;

export interface ParsedReceiptLine {
  name: string;
  unitPrice: number;
  qty: number;
  amount: number;
  /** 숫자를 어떻게 읽었는지 (화면에 보여 주고 사장님이 확인) */
  read: string;
}

export interface ParsedReceipt {
  vendor: string;
  date: string; // 못 읽으면 ""
  discount: number;
  total: number | null; // 영수증에 적힌 합계 (대조용)
  lines: ParsedReceiptLine[];
  notes: string[]; // 사장님에게 보여 줄 알림
}

const KEYS = {
  vendor: ["거래처", "상호", "매장", "가게", "판매처", "공급자", "점포"],
  date: ["날짜", "일자", "거래일", "거래일자", "구매일", "결제일"],
  discount: ["할인", "할인액", "할인금액", "에누리"],
  total: ["합계", "총액", "총합계", "결제금액", "총결제금액", "판매합계", "받을금액"],
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** "1,200원" → 1200, "2.5kg" → 2.5. 숫자가 없으면 null */
export function toNumber(raw: string): number | null {
  const s = raw.replace(/[,\s]/g, "");
  const m = s.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** 숫자만으로 된 칸인지 (1,200 · 2 · 3.5 · 4,000원) */
function isNumericCell(s: string): boolean {
  return /^-?[\d,]+(?:\.\d+)?\s*(원|개|EA|ea)?$/.test(s.trim());
}

/** 2026-09-20 · 2026.9.20 · 26/09/20 · 9월 20일 → "2026-09-20" */
export function parseDate(raw: string, monthHint?: string): string {
  const s = raw.replace(/\s/g, "");
  const pad = (n: number) => String(n).padStart(2, "0");
  const full = s.match(/(\d{4})[.\-/년](\d{1,2})[.\-/월](\d{1,2})/);
  if (full) return `${full[1]}-${pad(Number(full[2]))}-${pad(Number(full[3]))}`;
  const short = s.match(/(\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (short) return `20${short[1]}-${pad(Number(short[2]))}-${pad(Number(short[3]))}`;
  const md = s.match(/(\d{1,2})[.\-/월](\d{1,2})일?/);
  if (md) {
    const year = (monthHint ?? "").slice(0, 4) || String(new Date().getFullYear());
    return `${year}-${pad(Number(md[1]))}-${pad(Number(md[2]))}`;
  }
  return "";
}

/** 한 줄을 칸으로 쪼갠다: | 우선, 없으면 탭 · 두 칸 이상 띄우기 · 쉼표 */
function splitCells(line: string): string[] {
  const by = (sep: RegExp) => line.split(sep).map((c) => clean(c)).filter((c) => c !== "");
  if (line.includes("|")) return by(/\|/);
  if (line.includes("\t")) return by(/\t/);
  if (/\s{2,}/.test(line)) return by(/\s{2,}/);
  if (line.includes(",") && !/\d,\d{3}/.test(line)) return by(/,/);
  // 한 칸 띄우기만 있는 줄: 뒤에서부터 숫자 칸을 떼어 낸다 ("특란 30구 5800 2 11600")
  const parts = line.trim().split(/\s+/);
  const nums: string[] = [];
  while (parts.length > 1 && isNumericCell(parts[parts.length - 1])) nums.unshift(parts.pop() as string);
  // 맨 앞 줄 번호는 따로 떼어 둔다 ("1 닭갈비 원육 …")
  const head: string[] = [];
  if (parts.length > 1 && isNumericCell(parts[0]) && !isNumericCell(parts[1])) head.push(parts.shift() as string);
  return [...head, parts.join(" "), ...nums];
}

function matchKey(line: string, keys: string[]): string | null {
  const s = line.trim();
  for (const k of keys) {
    if (!s.startsWith(k)) continue;
    let rest = s.slice(k.length).trimStart();
    if (rest.startsWith(":") || rest.startsWith("：")) rest = rest.slice(1);
    return rest.trim();
  }
  return null;
}

export function parseReceiptText(text: string, monthHint?: string): ParsedReceipt {
  const out: ParsedReceipt = { vendor: "", date: "", discount: 0, total: null, lines: [], notes: [] };
  const rows = text.split(/\r?\n/);

  for (const row of rows) {
    const line = row.trim();
    if (!line) continue;
    if (/^[-=·*_]{3,}$/.test(line)) continue; // 구분선
    // 표 머리글 (상품명 단가 수량 금액)
    if (/상품명|품명|품목명/.test(line) && /금액|합계/.test(line) && !/\d/.test(line)) continue;

    const vendor = matchKey(line, KEYS.vendor);
    if (vendor !== null) {
      if (vendor) out.vendor = vendor;
      continue;
    }
    const date = matchKey(line, KEYS.date);
    if (date !== null) {
      out.date = parseDate(date, monthHint);
      if (!out.date) out.notes.push(`날짜를 못 읽었어요: "${date}"`);
      continue;
    }
    const discount = matchKey(line, KEYS.discount);
    if (discount !== null) {
      out.discount += Math.abs(toNumber(discount) ?? 0);
      continue;
    }
    const total = matchKey(line, KEYS.total);
    if (total !== null) {
      out.total = toNumber(total);
      continue;
    }

    const cells = splitCells(line);
    if (cells.length === 0) continue;
    // 맨 앞이 번호면 뗀다 ("1 특란 30구 5800 2 11600")
    if (cells.length > 2 && isNumericCell(cells[0]) && !isNumericCell(cells[1])) cells.shift();
    const name = cells[0];
    if (!name || isNumericCell(name)) continue; // 이름 없는 줄(합계만 있는 줄 등)은 건너뜀
    let nums = cells.slice(1).map((c) => toNumber(c)).filter((n): n is number => n !== null);
    if (nums.length === 0) continue; // 숫자가 없으면 줄이 아니다

    // 할인이 상품 줄처럼 적힌 경우
    if (/할인|에누리|D\/C/i.test(name)) {
      out.discount += Math.abs(nums[nums.length - 1]);
      continue;
    }

    if (nums.length > 3) nums = nums.slice(-3); // 앞에 붙은 여분 숫자는 버린다
    let unitPrice = 0;
    let qty = 1;
    let amount = 0;
    let read = "";
    if (nums.length === 3) {
      [unitPrice, qty, amount] = nums;
      read = "단가·수량·금액";
    } else if (nums.length === 2) {
      [qty, amount] = nums;
      unitPrice = qty > 0 ? Math.round(amount / qty) : amount;
      read = "수량·금액";
    } else {
      amount = nums[0];
      unitPrice = amount;
      read = "금액";
    }
    if (qty <= 0) qty = 1;
    if (amount <= 0) amount = Math.round(unitPrice * qty);
    if (unitPrice > 0 && Math.abs(unitPrice * qty - amount) > Math.max(10, amount * 0.02)) {
      out.notes.push(`"${name}" 단가×수량과 금액이 달라요 (${unitPrice}×${qty} ≠ ${amount}). 금액을 그대로 썼어요.`);
    }
    out.lines.push({ name, unitPrice, qty, amount, read });
  }

  if (out.lines.length === 0) out.notes.push("상품 줄을 하나도 못 읽었어요. 한 줄에 하나씩, 상품명 | 단가 | 수량 | 금액 형태로 붙여 주세요.");
  if (!out.date) out.date = "";
  const sum = out.lines.reduce((a, l) => a + l.amount, 0) - out.discount;
  if (out.total !== null && out.lines.length > 0 && Math.abs(sum - out.total) > Math.max(10, out.total * 0.01)) {
    out.notes.push(`읽은 합계(${sum.toLocaleString()}원)가 영수증 합계(${out.total.toLocaleString()}원)와 달라요. 빠진 줄이 없는지 봐 주세요.`);
  }
  return out;
}

const norm = (s: string) => s.replace(/[\s()［］\[\]]/g, "").toLowerCase();

// "제로"는 뒤에 붙이면 다른 술·음료가 된다(카스 ↔ 카스제로). 일부러 뺐다.
const DRINK_TAIL = /^(맥주|소주|라이트|생|병|캔|페트|pet|box|박스|오리지널|\d.*|ml.*)?$/i;
function drinkNameMatches(name: string, itemNorm: string): boolean {
  const tokens = name.toLowerCase().split(/[\s()［］\[\]_/,·]+/).filter(Boolean);
  if (tokens.some((tk) => tk.startsWith(itemNorm) && DRINK_TAIL.test(tk.slice(itemNorm.length)))) return true;
  // 여러 낱말로 된 술 이름 (참이슬 후레쉬)
  const joined = tokens.join("");
  return joined === itemNorm || (joined.startsWith(itemNorm) && DRINK_TAIL.test(joined.slice(itemNorm.length)));
}

/** 상품명으로 원가율 품목을 찾아 자동 연결 (가장 길게 겹치는 품목) */
export function matchItem(name: string, items: Item[]): Item | null {
  const n = norm(name);
  if (!n) return null;
  let best: Item | null = null;
  for (const it of items) {
    if (!it.active) continue;
    const t = norm(it.name);
    if (!t) continue;
    // 술·음료 이름은 짧아서(카스·테라) 다른 말 속에 잘 섞인다(카스타드·스테라스). 낱말 맨 앞에서 시작하고 뒤가 술 말일 때만 연결
    if (it.category === "drink" && !drinkNameMatches(name, t)) continue;
    if (n.includes(t) || t.includes(n)) {
      if (!best || t.length > norm(best.name).length) best = it;
    }
  }
  return best;
}

/** 읽은 줄을 매입 영수증 줄로 (품목 연결·품목 수량은 화면에서 채운다) */
export function toPurchaseLine(l: ParsedReceiptLine): PurchaseLine {
  return { name: l.name, unitPrice: l.unitPrice, qty: l.qty, amount: l.amount, category: "원재료비", itemId: null, itemQty: 0 };
}
