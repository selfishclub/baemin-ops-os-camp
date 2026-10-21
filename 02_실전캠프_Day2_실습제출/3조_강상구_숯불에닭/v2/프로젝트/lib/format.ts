export const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
export const num = (n: number) => Math.round(n).toLocaleString("ko-KR");
export const pctText = (p: number | null) => (p === null ? "–" : `${p.toFixed(1)}%`);
export const signed = (n: number) => `${n > 0 ? "▲" : n < 0 ? "▼" : ""}${num(Math.abs(n))}`;
export const parseNum = (s: string) => Number(s.replace(/[^\d-]/g, "")) || 0;

// 내려받는 파일 이름에 붙이는 날짜·시각 — 한국 시각 기준 (toISOString 은 영국 시각이라 밤 9시 뒤엔 하루 전 날짜가 찍힌다)
const kstParts = (now: Date) => {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}-${g("minute")}-${g("second")}` };
};
/** "2026-10-22" */
export const fileDate = (now = new Date()) => kstParts(now).date;
/** "2026-10-22_01-46-07" */
export const fileStamp = (now = new Date()) => {
  const k = kstParts(now);
  return `${k.date}_${k.time}`;
};
