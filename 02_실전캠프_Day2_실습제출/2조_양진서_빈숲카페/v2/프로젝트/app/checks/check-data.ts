import type { ManualDoc } from "../manual/manual-data";

// 오늘 체크: 매뉴얼 문서 중 "매일 체크하는 문서"의 순서 각 줄을 그날 누가 언제 했는지 남긴다.
// 도구는 기록만 한다 — "다 했다"는 판단과 확인은 사람이(사장의 "확인함") 한다.
// 서버(데이터 창고)와 미리보기(브라우저)가 같은 규칙을 쓰도록 계산은 여기 순수 함수에 둔다.

// 항목의 열쇠: 줄 위치가 아니라 글에서 만든다 — 순서를 바꿔도 오늘 한 체크가 다른 항목으로 옮겨 붙지 않게.
// (글을 고치면 새 항목으로 친다. 예전 글로 한 체크는 기록에 글과 함께 남아 있다)
export function checkItemKey(text: string): string {
  let hash = 5381;
  for (const ch of text.trim()) hash = ((hash * 33) ^ ch.codePointAt(0)!) >>> 0;
  return hash.toString(36);
}

// 사장이 그날 그 문서를 "확인함" 한 기록을 같은 표에 적을 때 쓰는 열쇠
export const signoffItemKey = "__signoff__";

// 매장 날짜. 서버가 어느 나라에 있든 한국 날짜로 끊는다
export function todayInSeoul(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
}

export function isCheckDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)));
}

export type DailyRow = { doc_id: string; item_key: string; item_text: string; checked_by: string; checked_by_name: string; checked_at: string };

export type CheckItem = { key: string; text: string; checkedByName: string | null; checkedAt: string | null; mine: boolean };

export type CheckDoc = {
  docId: string;
  title: string;
  sectionId: string;
  items: CheckItem[];
  done: number;
  total: number;
  // 사장의 확인함
  signoff: { name: string; at: string } | null;
  // 그날 체크했지만 지금 문서에는 없는 항목 (문서를 고친 경우) — 기록은 버리지 않고 따로 보여 준다
  earlier: { text: string; checkedByName: string; checkedAt: string }[];
};

export function buildCheckDocs(docs: ManualDoc[], rows: DailyRow[], meId: string): CheckDoc[] {
  return docs
    .filter((doc) => doc.dailyCheck && doc.kind !== "response")
    .map((doc) => {
      const mine = rows.filter((row) => row.doc_id === doc.id);
      const byKey = new Map(mine.map((row) => [row.item_key, row]));
      const items = doc.steps.map((text) => text.trim()).filter(Boolean).map((text) => {
        const key = checkItemKey(text);
        const row = byKey.get(key);
        return { key, text, checkedByName: row?.checked_by_name ?? null, checkedAt: row?.checked_at ?? null, mine: row?.checked_by === meId };
      });
      const known = new Set(items.map((item) => item.key));
      const sign = byKey.get(signoffItemKey);
      return {
        docId: doc.id,
        title: doc.title,
        sectionId: doc.sectionId,
        items,
        done: items.filter((item) => item.checkedAt).length,
        total: items.length,
        signoff: sign ? { name: sign.checked_by_name, at: sign.checked_at } : null,
        earlier: mine.filter((row) => row.item_key !== signoffItemKey && !known.has(row.item_key)).map((row) => ({ text: row.item_text, checkedByName: row.checked_by_name, checkedAt: row.checked_at })),
      };
    });
}

// 사장용 지난 기록 요약: 날짜마다 문서별로 몇 개 했고 확인했는지
export type DaySummary = { date: string; docs: { docId: string; title: string; done: number; total: number; signedOff: boolean }[] };

export function buildDaySummaries(docs: ManualDoc[], rows: (DailyRow & { check_date: string })[], dates: string[]): DaySummary[] {
  return dates.map((date) => ({
    date,
    docs: buildCheckDocs(docs, rows.filter((row) => row.check_date === date), "").map((doc) => ({ docId: doc.docId, title: doc.title, done: doc.done, total: doc.total, signedOff: Boolean(doc.signoff) })),
  }));
}

export function lastDates(today: string, count: number): string[] {
  const base = new Date(`${today}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => new Date(base.getTime() - index * 86_400_000).toISOString().slice(0, 10));
}
