import type { DailySale } from "./dailySales";
import type { MenuTotal } from "./menu";
import { asText, unzip } from "./unzip";

/**
 * 페이히어 '결제 내역 조회(상세)' xlsx.
 *
 * 주문 채널만 보면 배달이 한 덩어리로 보이지만, 오른쪽에 '배달앱' 열이 따로 있어
 * 배민과 쿠팡이츠가 이미 갈려 있다. 그걸 읽어 채널로 쓴다.
 *
 * 환불은 금액이 이미 음수로 들어온다. 또 빼면 두 번 빼는 셈이 된다.
 */

/** 페이히어 표기 → 우리 채널 */
const CHANNEL: Record<string, string> = {
  "배민1": "배달의민족",
  "배달의민족": "배달의민족",
  "배민": "배달의민족",
  "쿠팡이츠": "쿠팡이츠",
  "요기요": "요기요",
  "테이블오더": "홀",
  "포스": "홀",
  "키오스크": "홀",
};

/** 한 달·한 메뉴의 집계. 상품명은 페이히어가 보낸 원문 그대로다 */
export interface MenuRow extends MenuTotal {
  month: string;
}

export interface PayhereResult {
  sales: DailySale[];
  /** 메뉴별 판매 — 달마다 따로 */
  menu: MenuRow[];
  /** 영업일 기준 몇 일치인가 */
  days: number;
  rows: number;
  /** 우리가 집계한 합계 */
  sum: number;
  /** 파일이 적어둔 합계 */
  stated: number | null;
  /** 채널별 합계 — 눈으로 맞춰 보라고 돌려준다 */
  byChannel: { channel: string; count: number; amount: number }[];
  warnings: string[];
}

type Row = Record<string, string>;

/** 시트 XML 을 줄 단위로 푼다. 페이히어는 문자열을 셀 안에 직접 넣는다(inlineStr) */
function readSheet(xml: string, shared: string[]): Row[] {
  const rows: Row[] = [];
  for (const m of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: Row = {};
    for (const c of m[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const col = c[1];
      const attrs = c[2];
      const body = c[3];
      let val = "";
      if (/t="inlineStr"/.test(attrs)) {
        val = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("");
      } else if (/t="s"/.test(attrs)) {
        const i = Number(body.match(/<v>(\d+)<\/v>/)?.[1] ?? -1);
        val = shared[i] ?? "";
      } else {
        val = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
      }
      row[col] = val
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"');
    }
    rows.push(row);
  }
  return rows;
}

const num = (s: string | undefined) => {
  const n = Number(String(s ?? "").replace(/[^\d.eE+-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export async function parsePayhereXlsx(buf: ArrayBuffer): Promise<PayhereResult> {
  const files = await unzip(buf);
  // 페이히어는 여러 달을 받으면 **달마다 시트를 따로** 만든다.
  // 첫 시트만 읽으면 7~9월 파일에서 7월만 들어오고 나머지는 소리 없이 사라진다.
  const sheetNames = [...files.keys()]
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  if (!sheetNames.length) throw new Error("엑셀 안에서 시트를 찾지 못했습니다.");

  const sharedXml = files.get("xl/sharedStrings.xml");
  const shared = sharedXml
    ? [...asText(sharedXml).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
        [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("")
      )
    : [];

  // 시트마다 머리글이 다시 나오지만, 그 줄은 '구분'이 결제·환불·합계가 아니라 그냥 걸러진다.
  const rows = sheetNames.flatMap((n) => readSheet(asText(files.get(n)!), shared));

  // 머리글 — 열 위치를 고정하지 않고 이름으로 찾는다
  let head: Row | null = null;
  for (const r of rows.slice(0, 20)) {
    if (Object.values(r).some((v) => v.trim() === "영업일")) {
      head = r;
      break;
    }
  }
  if (!head) {
    throw new Error("'영업일' 열을 찾지 못했습니다. 페이히어 '결제 내역 조회(상세)' 파일이 맞는지 확인해 주세요.");
  }
  const colOf = (label: string) =>
    Object.entries(head!).find(([, v]) => v.trim() === label)?.[0];

  const cKind = colOf("구분");
  const cDate = colOf("영업일");
  const cChannel = colOf("주문 채널");
  const cApp = colOf("배달앱");
  const cAmount = colOf("결제 금액");
  // 메뉴 줄 — 결제 한 건 아래에 상품이 줄줄이 딸려 온다
  const cCat = colOf("카테고리");
  const cItem = colOf("상품");
  const cQty = colOf("수량");
  const cItemAmt = colOf("상품 주문 금액");
  const warnings: string[] = [];
  if (!cDate || !cAmount) throw new Error("영업일 또는 결제 금액 열을 찾지 못했습니다.");
  if (!cApp) warnings.push("'배달앱' 열이 없어 배달이 한 덩어리로 잡힙니다.");

  // 합계 행 — 파일이 스스로 적어둔 값. 우리 집계와 맞춰 본다
  // 시트마다 합계 행이 하나씩 있다. 페이히어는 거기에 **그 시트가 아니라 파일 전체 합계**를
  // 똑같이 적어 둔다 — 그래서 더하면 달 수만큼 부풀고, 하나만 쓰면 맞는다.
  // 다만 카드사마다 다를 수 있으니 값이 서로 다르면 그때는 더한다.
  const statedRows: number[] = [];
  const by = new Map<string, { count: number; amount: number }>();
  const daily = new Map<string, number>();
  const menu = new Map<string, MenuRow>();
  let used = 0;

  // 상품 줄은 구분·영업일이 비어 있다 — 바로 위 결제 줄의 것을 끌고 내려온다.
  let lastKind = "";
  let lastMonth = "";

  for (const r of rows) {
    const kind = cKind ? (r[cKind] ?? "").trim() : "";
    if (kind === "합계") {
      statedRows.push(num(r[cAmount]));
      lastKind = "";
      continue;
    }

    // 결제·환불 줄이면 기준을 새로 잡고, 빈 줄이면 앞의 것을 그대로 쓴다
    const rowDate = (r[cDate] ?? "").trim().slice(0, 10);
    if (kind === "결제" || kind === "환불") {
      lastKind = kind;
      lastMonth = /^\d{4}-\d{2}-\d{2}$/.test(rowDate) ? rowDate : "";
    } else if (kind) {
      // 시트가 바뀌며 머리글이 다시 나온 줄 등 — 기준을 끊는다
      lastKind = "";
      lastMonth = "";
    }

    // 상품 줄 집계 — 결제 줄 자신에도 첫 상품이 실려 있다
    if (cItem && cItemAmt && lastKind && lastMonth) {
      const item = (r[cItem] ?? "").trim();
      if (item) {
        const sign = lastKind === "환불" ? -1 : 1;
        const month = lastMonth.slice(0, 7);
        const key = `${month}\u0000${item}`;
        const cur =
          menu.get(key) ?? { month, item, category: cCat ? (r[cCat] ?? "").trim() : "", qty: 0, amount: 0 };
        cur.qty += (cQty ? num(r[cQty]) : 0) * sign;
        cur.amount += num(r[cItemAmt]) * sign;
        if (!cur.category && cCat) cur.category = (r[cCat] ?? "").trim();
        menu.set(key, cur);
      }
    }

    if (kind !== "결제" && kind !== "환불") continue;

    const date = rowDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    const raw = (cApp ? (r[cApp] ?? "").trim() : "") || (cChannel ? (r[cChannel] ?? "").trim() : "");
    const channel = CHANNEL[raw] ?? raw ?? "기타";
    // 환불은 이미 음수다. 부호를 또 뒤집지 않는다.
    const amount = num(r[cAmount]);

    used++;
    const cur = by.get(channel) ?? { count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += amount;
    by.set(channel, cur);
    daily.set(`${date}\u0000${channel}`, (daily.get(`${date}\u0000${channel}`) ?? 0) + amount);
  }

  const sales: DailySale[] = [...daily.entries()]
    .map(([k, amount]) => {
      const [date, channel] = k.split("\u0000");
      return { date, channel, amount };
    })
    .filter((s) => s.amount !== 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.channel.localeCompare(b.channel));

  const sum = sales.reduce((a, b) => a + b.amount, 0);
  const stated =
    statedRows.length === 0
      ? null
      : statedRows.every((v) => v === statedRows[0])
        ? statedRows[0]
        : statedRows.reduce((a, b) => a + b, 0);
  if (stated !== null && Math.abs(stated - sum) > 1) {
    warnings.push(
      `합계가 파일에 적힌 값과 ${Math.abs(stated - sum).toLocaleString("ko-KR")}원 다릅니다. 거래가 빠졌을 수 있습니다.`
    );
  }

  return {
    sales,
    menu: [...menu.values()].filter((m) => m.qty !== 0 || m.amount !== 0),
    days: new Set(sales.map((s) => s.date)).size,
    rows: used,
    sum,
    stated,
    byChannel: [...by.entries()]
      .map(([channel, v]) => ({ channel, ...v }))
      .sort((a, b) => b.amount - a.amount),
    warnings,
  };
}

/** 페이히어 매출표인지 가린다 */
export const looksLikePayhere = (name: string) => /\.xlsx$/i.test(name);
