import { LiquorParseError, bottlesPerBox, cleanLiquorName, type LiquorDay, type LiquorLine } from "./liquorLedger";
import { parseDate, toNumber } from "./receiptText";

// 주류 판매계산서(영수증)를 글자로 받아 읽는다.
//  - 도매상 엑셀(매출원장)을 받아 오기 번거로워서, 사장님이 영수증 사진을 폰 AI로 표로 바꿔 붙여넣는 길을 둔다.
//  - 영수증에 찍힌 숫자를 그대로 옮기게 한다: 술값(공급가+부가세) · 보증금 · 빈병회수 · 채권잔액.
//  - 보증금은 빈 병을 돌려주면 돌아오는 돈이라 원가가 아니다. 술값만 매입으로 넣고 보증금은 메모로 남긴다.
export const LIQUOR_PROMPT = `주류 판매계산서(영수증) 사진을 읽어 아래 형식의 텍스트만 출력해. 설명 없이.
거래처: (공급자 상호)
날짜: YYYY-MM-DD
품목 | 용량 | 박스 | 낱병 | 술값 | 보증금
(판매내역의 품목마다 한 줄. 술값 = 공급가 + 부가세, 보증금은 그 품목의 보증금 칸)
술값소계: (매출소계)
보증금소계: (보증금소계)
빈병회수: (용공회수액, 없으면 0)
채권잔액: (채권잔액)`;

export interface ParsedLiquorReceipt {
  vendor: string;
  day: LiquorDay;
  balance: number | null; // 채권잔액 = 아직 안 낸 외상
  notes: string[]; // 사장님에게 보여 줄 알림
}

const COLS = {
  name: ["품목", "품목명", "상품명", "품명", "제품명"],
  date: ["날짜", "일자", "매출일자", "구매일시", "거래일"],
  vendor: ["거래처", "공급자", "상호", "판매처"],
  ml: ["용량", "규격"],
  box: ["박스", "box", "상자", "수량"],
  ea: ["낱병", "ea", "개", "병"],
  liquor: ["술값", "매출소계", "소계", "공급대가"],
  deposit: ["보증금", "용기보증금", "공병보증금"],
  amount: ["금액", "합계", "총계"],
  price: ["단가"],
  memo: ["비고", "메모"],
};
const KEYS = {
  vendor: ["거래처", "공급자", "상호", "판매처", "도매상"],
  date: ["날짜", "매출일자", "일자", "거래일"],
  liquorSum: ["술값소계", "매출소계", "공급대가소계"],
  depositSum: ["보증금소계", "보증금합계", "보증금"],
  returned: ["빈병회수", "용공회수액", "회수액", "회수합계", "회수"],
  balance: ["채권잔액", "잔액", "외상잔액"],
  total: ["매출총계", "총계", "합계"],
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const cells = (line: string) =>
  line
    .split(/\s*[|\t]\s*|\s{2,}/)
    .map(clean)
    .filter((c) => c !== "");

/** "거래처: 청주주류" 같은 줄에서 값 꺼내기 */
function keyValue(line: string, keys: string[]): string | null {
  const m = line.match(/^([^:：]+)[:：](.*)$/);
  if (!m) return null;
  const k = clean(m[1]).replace(/\s/g, "");
  return keys.some((x) => k === x || k.startsWith(x)) ? clean(m[2]) : null;
}

/** 머리줄이 있으면 칸 위치를 정한다 ("품목 | 용량 | 박스 | 낱병 | 술값 | 보증금") */
function headerMap(c: string[]): Record<string, number> | null {
  const idx: Record<string, number> = {};
  c.forEach((raw, i) => {
    const k = raw.toLowerCase().replace(/\s/g, "");
    for (const [field, names] of Object.entries(COLS)) {
      if (idx[field] === undefined && names.some((n) => k === n.toLowerCase())) idx[field] = i;
    }
  });
  return idx.name !== undefined && Object.keys(idx).length >= 3 ? idx : null;
}

/** "용기보증금 5,500원 포함" → 5500 */
function depositFromMemo(text: string): number | null {
  return /보증금/.test(text) ? toNumber(text.replace(/[^0-9,]/g, " ")) : null;
}

/** "진로이즈백 360ml" → 360 */
function mlFromName(name: string): number | null {
  const m = name.match(/(\d{3,4})\s*(ml)?\s*$/i);
  return m ? Number(m[1]) : null;
}

export function parseLiquorText(text: string, monthHint?: string): ParsedLiquorReceipt {
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!rows.length) throw new LiquorParseError("붙여넣은 글이 비어 있어요.");

  let vendor = "";
  let date = "";
  const sums: { liquorSum: number | null; depositSum: number | null; returned: number; balance: number | null; total: number | null } = { liquorSum: null, depositSum: null, returned: 0, balance: null, total: null };
  let map: Record<string, number> | null = null;
  const lines: LiquorLine[] = [];
  const notes: string[] = [];

  for (const row of rows) {
    // 1) "이름: 값" 줄
    const v = keyValue(row, KEYS.vendor);
    if (v !== null) {
      vendor = v;
      continue;
    }
    const d = keyValue(row, KEYS.date);
    if (d !== null) {
      date = parseDate(d, monthHint);
      continue;
    }
    const pairs: [string[], keyof typeof sums][] = [
      [KEYS.liquorSum, "liquorSum"],
      [KEYS.depositSum, "depositSum"],
      [KEYS.returned, "returned"],
      [KEYS.balance, "balance"],
      [KEYS.total, "total"],
    ];
    let matched = false;
    for (const [keys, field] of pairs) {
      const raw = keyValue(row, keys);
      if (raw !== null) {
        const n = toNumber(raw);
        if (n !== null) sums[field] = n as never;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // 2) 표 줄
    const c = cells(row);
    if (c.length < 2) continue;
    if (!map) {
      const h = headerMap(c);
      if (h) {
        map = h;
        continue;
      }
    }
    const nums = c.filter((x) => toNumber(x) !== null).length;
    if (nums < 2) continue; // 머리줄·설명 줄

    const at = (field: keyof typeof COLS): string | null => {
      if (map && map[field] !== undefined) return c[map[field]] ?? null;
      return null;
    };
    // 사장님이 쓰던 표처럼 날짜·거래처가 칸으로 들어 있으면 거기서 꺼낸다
    if (!date) {
      const raw = at("date");
      if (raw) date = parseDate(raw, monthHint);
    }
    if (!vendor) vendor = at("vendor") ?? "";
    const name = clean(at("name") ?? c[0]).replace(/^\[\d+\]/, "");
    const rest = map ? null : c.slice(1).map(toNumber);
    const pick = (field: keyof typeof COLS, fallback: number | null): number | null => {
      const raw = at(field);
      if (raw !== null) return toNumber(raw);
      return fallback;
    };
    // 머리줄이 없으면 "품목 | 용량 | 박스 | 낱병 | 술값 | 보증금" 차례로 본다
    const ml = pick("ml", rest && rest.length >= 5 ? rest[0] : null) ?? mlFromName(name);
    const box = pick("box", rest ? (rest.length >= 5 ? rest[1] : rest[0]) : null) ?? 0;
    const ea = pick("ea", rest && rest.length >= 5 ? rest[2] : null) ?? 0;
    const memoCell = c.find((x) => /보증금/.test(x)) ?? "";
    const deposit = pick("deposit", rest && rest.length >= 5 ? rest[4] : null) ?? depositFromMemo(memoCell) ?? 0;
    const amount = pick("amount", rest && rest.length === 4 ? rest[2] : null);
    const price = pick("price", rest && rest.length === 4 ? rest[1] : null);
    let liquor = pick("liquor", rest && rest.length >= 5 ? rest[3] : null);
    if (liquor === null) {
      const gross = amount !== null ? amount : price !== null && box ? price * box : null;
      if (gross === null) continue;
      liquor = gross - deposit; // 금액에 보증금이 들어 있는 형식
    }
    const displayName = cleanLiquorName(name);
    const perBox = bottlesPerBox(ml);
    const bottles = perBox !== null ? perBox * box + ea : ea || null;
    lines.push({
      code: "",
      name,
      displayName,
      specMl: ml,
      box,
      ea,
      subtotal: liquor,
      crateDeposit: deposit,
      bottleDeposit: 0,
      bottles,
      perBottle: bottles ? Math.round(liquor / bottles) : null,
    });
    if (perBox === null && ml !== null) notes.push(`${displayName} ${ml}ml는 한 박스에 몇 병인지 몰라 병당 원가를 못 냈어요.`);
    if (ml === null) notes.push(`${displayName}는 용량을 못 읽어 병당 원가를 못 냈어요.`);
  }

  if (!lines.length) throw new LiquorParseError("주류 영수증으로 읽지 못했어요. 품목 줄이 보이지 않아요. 지시문을 그대로 쓰셨는지 확인해 주세요.");
  if (!date) notes.push("날짜를 못 읽었어요. 직접 골라 주세요.");

  const subtotal = lines.reduce((a, l) => a + l.subtotal, 0);
  const deposit = sums.depositSum ?? lines.reduce((a, l) => a + l.crateDeposit, 0);
  if (sums.liquorSum !== null && sums.liquorSum !== subtotal) notes.push(`술값 검산이 안 맞아요. 줄 합계 ${subtotal.toLocaleString()}원, 적힌 소계 ${sums.liquorSum.toLocaleString()}원.`);
  if (sums.total !== null && sums.total !== subtotal + deposit) notes.push(`매출총계 검산이 안 맞아요. 술값+보증금 ${(subtotal + deposit).toLocaleString()}원, 적힌 총계 ${sums.total.toLocaleString()}원.`);

  return {
    vendor,
    balance: sums.balance,
    notes,
    day: { date, lines, subtotal, deposit, returned: sums.returned, paid: 0, checked: sums.liquorSum !== null, mismatch: null },
  };
}
