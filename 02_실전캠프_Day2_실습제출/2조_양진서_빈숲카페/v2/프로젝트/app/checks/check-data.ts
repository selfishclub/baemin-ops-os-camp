import type { ManualDoc } from "../manual/manual-data";

// 오늘 체크: 매뉴얼 문서 중 "매일 체크하는 문서"의 순서 각 줄을 그날 누가 언제 했는지 남긴다.
// 도구는 기록만 한다 — "다 했다"는 판단과 확인은 사람이(사장의 "확인함") 한다.
// 서버(데이터 창고)와 미리보기(브라우저)가 같은 규칙을 쓰도록 계산은 여기 순수 함수에 둔다.
//
// 항목 글에 붙이는 표시 (관리자 편집 '매뉴얼' 탭의 순서 줄에 그대로 적는다):
//   [숫자: ℃]      숫자를 꼭 적어야 체크됨 (냉장고 온도, 폐기 수량 …). 단위는 자유
//   (매주 월·목)   그 요일에만 나타남. 다른 날은 "오늘은 아님"으로 빠짐
//   (매월 1일)     그 날짜에만 나타남 (여러 개는 1·15일)
//   (~09:30)       그 시각까지. 지나도 안 했으면 "지연" 표시 (15분 여유)

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

// 매장 시각 "HH:MM" (한국 시간)
export function clockInSeoul(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(now).replace(/^24/, "00");
}

export function isCheckDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)));
}

export type CheckSchedule = { kind: "weekly"; days: number[]; note: string } | { kind: "monthly"; dates: number[]; note: string };

export type ParsedStep = {
  label: string;           // 표시를 뺀 글
  unit: string | null;     // [숫자: 단위] 가 있으면 단위 (빈 문자열 가능)
  schedule: CheckSchedule | null;
  due: string | null;      // "09:30"
};

const weekdayNames = ["일", "월", "화", "수", "목", "금", "토"];
export const lateGraceMinutes = 15;

export function parseCheckStep(text: string): ParsedStep {
  let label = text.trim();
  let unit: string | null = null;
  let schedule: CheckSchedule | null = null;
  let due: string | null = null;

  const measure = /\[\s*숫자\s*:?\s*([^\]]*)\]/.exec(label);
  if (measure) {
    unit = measure[1].trim();
    label = label.replace(measure[0], "").trim();
  }
  const weekly = /\(\s*매주\s*([일월화수목금토][일월화수목금토·,\s/]*)\)/.exec(label);
  if (weekly) {
    const days = [...new Set(weekly[1].replace(/[^일월화수목금토]/g, "").split("").map((ch) => weekdayNames.indexOf(ch)).filter((day) => day >= 0))];
    if (days.length) schedule = { kind: "weekly", days, note: `매주 ${days.map((day) => weekdayNames[day]).join("·")}` };
    label = label.replace(weekly[0], "").trim();
  }
  const monthly = /\(\s*매월\s*([\d·,\s/일]+)\)/.exec(label);
  if (monthly) {
    const dates = [...new Set((monthly[1].match(/\d+/g) ?? []).map(Number).filter((date) => date >= 1 && date <= 31))];
    if (dates.length) schedule = { kind: "monthly", dates, note: `매월 ${dates.join("·")}일` };
    label = label.replace(monthly[0], "").trim();
  }
  const deadline = /\(\s*(?:~\s*)?(\d{1,2}):(\d{2})\s*(?:까지)?\s*\)/.exec(label);
  if (deadline) {
    const hour = Number(deadline[1]);
    const minute = Number(deadline[2]);
    if (hour <= 23 && minute <= 59) due = `${String(hour).padStart(2, "0")}:${deadline[2]}`;
    label = label.replace(deadline[0], "").trim();
  }
  return { label: label.replace(/\s{2,}/g, " "), unit, schedule, due };
}

// 그 날짜(YYYY-MM-DD)에 해당하는 항목인가
export function isScheduledOn(schedule: CheckSchedule | null, date: string): boolean {
  if (!schedule) return true;
  const day = new Date(`${date}T00:00:00Z`);
  if (schedule.kind === "weekly") return schedule.days.includes(day.getUTCDay());
  return schedule.dates.includes(day.getUTCDate());
}

// 기한이 지났나 (오늘이고, 지금 시각이 기한 + 여유를 넘었을 때만)
export function isLate(due: string | null, date: string, today: string, nowClock: string): boolean {
  if (!due || date !== today) return false;
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  return toMinutes(nowClock) > toMinutes(due) + lateGraceMinutes;
}

// 숫자 입력 검사: 숫자(소수 가능)만, 너무 길지 않게
export function normalizeMeasure(value: unknown): string | null {
  const text = String(value ?? "").trim().replace(/,/g, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(text) || text.length > 12) return null;
  return text;
}

export type DailyRow = { doc_id: string; item_key: string; item_text: string; checked_by: string; checked_by_name: string; checked_at: string; value?: string | null };

export type CheckItem = {
  key: string;
  text: string;            // 원문 (열쇠의 기준)
  label: string;           // 표시용
  unit: string | null;     // 숫자 입력 항목이면 단위
  value: string | null;    // 기록된 숫자
  schedule: string | null; // "매주 월·목" 같은 안내
  skipped: boolean;        // 오늘은 해당 없는 항목
  due: string | null;
  late: boolean;
  checkedByName: string | null;
  checkedAt: string | null;
  mine: boolean;
};

export type CheckDoc = {
  docId: string;
  title: string;
  sectionId: string;
  items: CheckItem[];
  done: number;
  total: number;   // 오늘 해당 없는 항목은 뺀 수
  late: number;
  // 사장의 확인함
  signoff: { name: string; at: string } | null;
  // 그날 체크했지만 지금 문서에는 없는 항목 (문서를 고친 경우) — 기록은 버리지 않고 따로 보여 준다
  earlier: { text: string; checkedByName: string; checkedAt: string }[];
};

export type BuildOptions = { date?: string; today?: string; nowClock?: string };

export function buildCheckDocs(docs: ManualDoc[], rows: DailyRow[], meId: string, options: BuildOptions = {}): CheckDoc[] {
  const today = options.today ?? todayInSeoul();
  const date = options.date ?? today;
  const nowClock = options.nowClock ?? clockInSeoul();
  return docs
    .filter((doc) => doc.dailyCheck && doc.kind !== "response")
    .map((doc) => {
      const mine = rows.filter((row) => row.doc_id === doc.id);
      const byKey = new Map(mine.map((row) => [row.item_key, row]));
      const items: CheckItem[] = doc.steps.map((step) => step.trim()).filter(Boolean).map((text) => {
        const key = checkItemKey(text);
        const row = byKey.get(key);
        const parsed = parseCheckStep(text);
        const skipped = !isScheduledOn(parsed.schedule, date);
        return {
          key,
          text,
          label: parsed.label,
          unit: parsed.unit,
          value: row?.value ?? null,
          schedule: parsed.schedule?.note ?? null,
          skipped,
          due: parsed.due,
          late: !skipped && !row && isLate(parsed.due, date, today, nowClock),
          checkedByName: row?.checked_by_name ?? null,
          checkedAt: row?.checked_at ?? null,
          mine: row?.checked_by === meId,
        };
      });
      const known = new Set(items.map((item) => item.key));
      const sign = byKey.get(signoffItemKey);
      const active = items.filter((item) => !item.skipped);
      return {
        docId: doc.id,
        title: doc.title,
        sectionId: doc.sectionId,
        items,
        done: active.filter((item) => item.checkedAt).length,
        total: active.length,
        late: active.filter((item) => item.late).length,
        signoff: sign ? { name: sign.checked_by_name, at: sign.checked_at } : null,
        earlier: mine.filter((row) => row.item_key !== signoffItemKey && !known.has(row.item_key)).map((row) => ({ text: row.item_text, checkedByName: row.checked_by_name, checkedAt: row.checked_at })),
      };
    });
}

// 사장용 지난 기록 요약: 날짜마다 문서별로 몇 개 했고 확인했는지
export type DaySummary = { date: string; docs: { docId: string; title: string; done: number; total: number; signedOff: boolean }[] };

export function buildDaySummaries(docs: ManualDoc[], rows: (DailyRow & { check_date: string })[], dates: string[], today = dates[0]): DaySummary[] {
  return dates.map((date) => ({
    date,
    docs: buildCheckDocs(docs, rows.filter((row) => row.check_date === date), "", { date, today }).map((doc) => ({ docId: doc.docId, title: doc.title, done: doc.done, total: doc.total, signedOff: Boolean(doc.signoff) })),
  }));
}

export function lastDates(today: string, count: number): string[] {
  const base = new Date(`${today}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => new Date(base.getTime() - index * 86_400_000).toISOString().slice(0, 10));
}
