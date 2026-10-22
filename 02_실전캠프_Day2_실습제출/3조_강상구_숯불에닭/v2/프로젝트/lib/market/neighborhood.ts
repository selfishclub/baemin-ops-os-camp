import { unzipSync } from "fflate";

// 오늘 동네와 우리 가게 (docs/오늘동네와우리가게/PRD.md v1, 2026-10-21)
//  가게가 한산할 때 "동네 전체가 한산한지, 우리만 한산한지"를 되짚을 근거를 모은다.
//  같은 시각의 주변(주차·거리 체감)과 매장(착석 테이블)을 기록하고, 하루 단위 자료(관광 방문자·버스·마감 매출)는 따로 붙인다.
//  자동 판정·점수·경고 기준은 만들지 않는다(v2 초안). 숫자가 없으면 null — 0으로 채우지 않는다. 시각은 모두 한국 시각.

export const JOURNAL_KEY = "neighborhood_journal_v1";
export const PARKING_KEY = "neighborhood_parking_v1";
export const TABLES_KEY = "neighborhood_tables_v1";
/** 사장님이 지운 자동 주차 기록 id — 도우미에서 다시 받아 와도 다시 넣지 않는다 */
export const PARKING_DELETED_KEY = "neighborhood_parking_deleted_v1";
export const VISITORS_KEY = "neighborhood_visitors_v1";
export const BUS_KEY = "neighborhood_bus_v1";

export const PARKING_LOT = "율량동 주차타워";
export const PARKING_URL = "https://parking.cjuc.or.kr/main";
// 2026-10-22 확인: 청주 교통빅데이터 "실시간 잔여주차공간"에서 율량·사천동을 조회하면 결과가 없고 공식 API·이용 조건도 못 찾음.
//  같은 날 사장님 결정으로 문의 없이 통합주차포털 공개 첫 화면을 저녁 18~22시 매시 읽는다 (수집기 npm run parking → 도우미 /parking/readings).
export const PARKING_CITY_URL = "https://tdata.cheongju.go.kr/data/anls/trfa/pklotPage";
export const VISITOR_URL = "https://datalab.visitkorea.or.kr/datalab/portal/bda/getMetcoAna.do";
export const BUS_URL = "https://tdata.cheongju.go.kr/data/dwnld/page";
/** 율량·사천동 행정동 코드 (청주 버스 승하차 자료의 ADMDST_CD) */
export const YULLYANG_ADM = "4311454000";

export type Feel = "한산함" | "보통" | "붐빔" | "확인 못 함";
export const FEELS: Feel[] = ["한산함", "보통", "붐빔", "확인 못 함"];
export const TAGS = ["예약", "단체", "행사", "날씨", "영업 변경"];
/** 처음 쓰는 관찰 시각 제안 — 검증된 최적 시각이 아니라 처음 가정 (PRD 4-B) */
export const SUGGESTED_TIMES = ["18:00", "20:00", "22:00"];

export interface JournalEntry {
  id: string;
  date: string; // "2026-10-22"
  time: string; // "20:00"
  seated: number | null; // 지금 손님이 앉아 있는 테이블 수 (안 셌으면 null, 정말 없으면 0)
  totalTables: number | null; // 그때 쓸 수 있던 전체 테이블 수 — 설정값을 기록 순간에 같이 남긴다
  street: Feel | null; // 거리 체감
  nearby: Feel | null; // 주변 식당 체감 (선택, 가게 이름·손님 정보는 적지 않는다)
  tags: string[];
  memo: string;
  teamsIn: number | null; // 선택 — 직전 기록 뒤 새로 들어온 팀 수. 착석 테이블과 다른 숫자라 섞지 않는다
  savedAt: string; // 저장한 순간 (ISO)
}

export interface ParkingRecord {
  id: string;
  lot: string;
  date: string; // 사장님이 화면을 본 한국 날짜
  time: string; // 본 시각 "19:55"
  sourceTime: string | null; // 출처 화면에 적힌 기준 시각 — 화면에 없으면 null (미제공)
  total: number; // 전체 면수 (그때 화면 값 — 고정값으로 두지 않는다)
  available: number; // 주차 가능 대수
  method: "직접 입력" | "자동 수집";
  status?: string | null; // 포털 화면 표시 (여유·혼잡·만차) — 자동 수집만
  note: string;
  savedAt: string;
}

/** 도우미가 주는 한 번 읽은 값 (수집기 scripts/collect-parking.ts 의 ParkingReading) */
export interface ParkingReading {
  lot: string;
  date: string;
  time: string;
  readAt: string;
  total: number;
  available: number;
  status: string | null;
  sourceTime: null;
}

/** 자동으로 읽은 값을 장부 기록에 더한다. id 가 날짜·시각이라 여러 번 받아도 한 번만 들어간다. 이상한 숫자는 버린다 */
export function mergeAutoParking(list: ParkingRecord[], readings: ParkingReading[], deleted: Iterable<string> = []): { list: ParkingRecord[]; added: number } {
  const have = new Set([...list.map((r) => r.id), ...deleted]); // 지운 것도 "있는 것"으로 쳐서 다시 넣지 않는다
  const add: ParkingRecord[] = [];
  for (const r of readings) {
    const id = `auto-${r.date}-${r.time}`;
    if (have.has(id) || !isValidDate(r.date) || !isValidTime(r.time) || validateParking(r.total, r.available)) continue;
    have.add(id);
    add.push({ id, lot: r.lot, date: r.date, time: r.time, sourceTime: null, total: r.total, available: r.available, method: "자동 수집", status: r.status ?? null, note: "", savedAt: r.readAt });
  }
  if (!add.length) return { list, added: 0 };
  return { list: [...list, ...add].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)), added: add.length };
}

export interface TablesSetting {
  history: { from: string; total: number }[]; // 예전 방식: 그날부터 쓸 수 있는 테이블 수 (바뀌면 한 줄 더)
  // 2026-10-22 사장님: 내부 14개 · 야장 8개. 야장은 여는 날만 더한다
  inside?: number;
  outside?: number;
  terraceDays?: Record<string, boolean>; // 그날 야장을 열었나
}

/** 그날 야장을 열었나 — 적어 둔 날이 없으면 닫힘 */
export const terraceOpen = (s: TablesSetting | null, date: string) => !!s?.terraceDays?.[date];

export interface VisitorDay {
  total: number | null; // 전체 방문자
  outsider: number | null; // 외지인
  local: number | null; // 현지인
}
// 브라우저 저장 공간(5MB 안팎)이 빠듯해서 날짜마다 짧은 배열로 둔다 — [전체, 외지인, 현지인]
export type VisitorRow = [number | null, number | null, number | null];
export interface VisitorStore {
  region: string; // "율량·사천동"
  files: { name: string; importedAt: string; from: string; to: string; days: number }[];
  days: Record<string, VisitorRow>;
}
export function visitorDay(s: VisitorStore | null, date: string): VisitorDay | null {
  const r = s?.days[date];
  return r ? { total: r[0], outsider: r[1], local: r[2] } : null;
}

export interface BusStation {
  name: string;
  lat: number;
  lng: number;
  dist: number; // 가게에서 직선거리 (m)
}
export interface BusDay {
  dongUp: number; // 율량·사천동 전체 정류장 승차
  dongDown: number; // 하차
  near500Up: number; // 가게 500m 안 정류장 승차 (좌표 있는 정류장만)
  near500Down: number;
  near1000Up: number;
  near1000Down: number;
  stations: number; // 그날 자료가 있는 정류장 수
}
export interface BusMonthFile {
  month: string; // "2026-09"
  file: string;
  importedAt: string;
  rows: number; // 율량·사천동 정상 행
  invalidDates: Record<string, number>; // 달력에 없는 날짜(예: 20240931) → 행 수. 다른 날로 옮기지 않고 뺀다
  missingCoord: number; // 좌표가 0이거나 비어 있는 행 (동 합계에는 넣고 반경 계산에서는 뺀다)
  duplicates: number; // 같은 날·같은 정류장이 두 번 나온 행 (첫 행만 씀)
}
// 저장은 짧은 배열 — [동 승차, 동 하차, 500m 승차, 500m 하차, 1km 승차, 1km 하차, 정류장 수]
export type BusRow7 = [number, number, number, number, number, number, number];
export interface BusStore {
  adm: string;
  center: { lat: number; lng: number };
  months: BusMonthFile[];
  stations: Record<string, BusStation>;
  days: Record<string, BusRow7>;
}
export function busDay(s: BusStore | null, date: string): BusDay | null {
  const r = s?.days[date];
  return r ? { dongUp: r[0], dongDown: r[1], near500Up: r[2], near500Down: r[3], near1000Up: r[4], near1000Down: r[5], stations: r[6] } : null;
}

// ── 시각 ─────────────────────────────────────────────────────────────

/** 지금 한국 날짜·시각 — PC 시계가 다른 나라로 맞춰져 있어도 한국 기준 */
export function kstNow(now = new Date()): { date: string; time: string } {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}` };
}

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export const isValidTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const minutesBetween = (a: string, b: string) => Math.abs(minutesOf(a) - minutesOf(b));

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ── 주차 ─────────────────────────────────────────────────────────────

/** 잘못된 숫자면 이유를, 괜찮으면 null */
export function validateParking(total: number | null, available: number | null): string | null {
  if (total === null || available === null) return "전체 면수와 주차 가능 대수를 둘 다 적어 주세요.";
  if (!Number.isInteger(total) || !Number.isInteger(available)) return "면수는 정수로 적어 주세요.";
  if (total < 0 || available < 0) return "음수는 적을 수 없어요.";
  if (available > total) return `가능 대수(${available})가 전체 면수(${total})보다 많아요. 화면 숫자를 다시 확인해 주세요.`;
  return null;
}

/** 사용 중인 면수·점유율(%). 전체 면수가 0이면 점유율은 계산하지 않는다 */
export function parkingUse(r: Pick<ParkingRecord, "total" | "available">): { used: number; rate: number | null } {
  const used = r.total - r.available;
  return { used, rate: r.total > 0 ? Math.round((used / r.total) * 1000) / 10 : null };
}

/** 오늘 기록인데 지금보다 maxMin 분 넘게 지난 값 = 오래된 자료 */
export function parkingAge(r: Pick<ParkingRecord, "date" | "time">, now: { date: string; time: string }): number | null {
  if (r.date !== now.date) return null;
  return minutesOf(now.time) - minutesOf(r.time);
}

/** 같은 날 가장 가까운 주차 기록 (maxGap 분 안). 정확히 같은 시각이 아니면 gap 으로 차이를 보여 준다 */
export function nearestParking(records: ParkingRecord[], date: string, time: string, maxGap = 30): { rec: ParkingRecord; gap: number } | null {
  let best: { rec: ParkingRecord; gap: number } | null = null;
  for (const r of records) {
    if (r.date !== date) continue;
    const gap = minutesBetween(r.time, time);
    if (gap <= maxGap && (!best || gap < best.gap)) best = { rec: r, gap };
  }
  return best;
}

// ── 일지 ─────────────────────────────────────────────────────────────

/** 그날 쓸 수 있던 전체 테이블 수 — from 이 그날 이전인 것 중 가장 최근 */
export function tablesOn(s: TablesSetting | null, date: string): number | null {
  if (s?.inside != null) return s.inside + (terraceOpen(s, date) ? s.outside ?? 0 : 0);
  const rows = (s?.history ?? []).filter((h) => h.from <= date).sort((a, b) => a.from.localeCompare(b.from));
  return rows.length ? rows[rows.length - 1].total : null;
}

export function validateJournal(e: Pick<JournalEntry, "date" | "time" | "seated" | "totalTables" | "teamsIn">): string | null {
  if (!isValidDate(e.date)) return "날짜가 달력에 없는 날이에요.";
  if (!isValidTime(e.time)) return "시각은 00:00~23:59 로 적어 주세요.";
  for (const [v, name] of [[e.seated, "착석 테이블"], [e.totalTables, "전체 테이블"], [e.teamsIn, "입장 팀"]] as const) {
    if (v !== null && (!Number.isInteger(v) || v < 0)) return `${name} 수는 0 이상의 정수로 적어 주세요.`;
  }
  if (e.seated !== null && e.totalTables !== null && e.seated > e.totalTables) return `착석 테이블(${e.seated})이 전체 테이블(${e.totalTables})보다 많아요.`;
  return null;
}

/** id 가 같으면 바꾸고, 없으면 더한다. 날짜·시각 차례로 */
export function upsertById<T extends { id: string; date: string; time: string }>(list: T[], item: T): T[] {
  return [...list.filter((x) => x.id !== item.id), item].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

export interface TimelineRow {
  time: string;
  journal: JournalEntry | null;
  parking: ParkingRecord | null;
  gap: number; // 일지 시각과 연결한 주차 기록 시각 차이 (분). 0 이면 같은 시각
}

/** 그날 시간 흐름 — 일지마다 30분 안의 가장 가까운 주차 기록을 붙이고, 어느 일지에도 안 붙은 주차 기록은 따로 한 줄 */
export function dayTimeline(journal: JournalEntry[], parking: ParkingRecord[], date: string, maxGap = 30): TimelineRow[] {
  const rows: TimelineRow[] = [];
  const used = new Set<string>();
  const dayParking = parking.filter((p) => p.date === date);
  for (const j of journal.filter((x) => x.date === date)) {
    const n = nearestParking(dayParking, date, j.time, maxGap);
    if (n) used.add(n.rec.id);
    rows.push({ time: j.time, journal: j, parking: n?.rec ?? null, gap: n?.gap ?? 0 });
  }
  for (const p of dayParking) if (!used.has(p.id)) rows.push({ time: p.time, journal: null, parking: p, gap: 0 });
  return rows.sort((a, b) => a.time.localeCompare(b.time));
}

// ── 관광 데이터랩 방문자 (공식 다운로드 CSV) ───────────────────────────────

const toNum = (s: string | undefined): number | null => {
  const t = (s ?? "").replace(/["\s,]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
};
const ymd = (s: string) => (/^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s);
/** CSV 한 줄 → 칸. 따옴표 안의 쉼표(정류장 이름 "동양일보,엔포드호텔" 같은)는 칸을 나누지 않는다 */
function splitCsv(line: string): string[] {
  if (!line.includes('"')) return line.split(",").map((c) => c.trim());
  const out: string[] = [];
  let cur = "", q = false;
  for (let k = 0; k < line.length; k++) {
    const ch = line[k];
    if (ch === '"') {
      if (q && line[k + 1] === '"') { cur += '"'; k++; } else q = !q;
    } else if (ch === "," && !q) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
const stripBom = (s: string) => s.replace(/^﻿/, "");

export interface VisitorParse {
  region: string | null;
  days: Record<string, VisitorDay>;
  badRows: string[]; // 달력에 없는 날짜·숫자 아닌 값
  error: string | null; // 다른 지역·모르는 모양이면 이유
}

/**
 * 관광 데이터랩 "방문자 수 추이" 일간 다운로드.
 *  - 원본 모양: 기준년월,행정동명,방문자 구분,방문자 수 (날짜마다 외지인·전체·현지인 세 줄)
 *  - 합친 모양: 날짜,전체방문자,외지인방문자,현지인방문자 (지역 칸이 없어 파일 이름에 "율량"이 있어야 받는다)
 */
export function parseVisitorCsv(text: string, fileName = ""): VisitorParse {
  const lines = stripBom(text).split(/\r?\n/).filter((l) => l.trim() !== "");
  const out: VisitorParse = { region: null, days: {}, badRows: [], error: null };
  if (!lines.length) return { ...out, error: "빈 파일이에요." };
  const head = splitCsv(lines[0]);
  const at = (name: string) => head.findIndex((h) => h.replace(/\s/g, "").includes(name));
  const day = (d: string) => (out.days[d] ??= { total: null, outsider: null, local: null });

  if (at("방문자구분") >= 0) {
    const iDate = at("기준년월"), iRegion = at("행정동명"), iKind = at("방문자구분"), iVal = at("방문자수");
    if (iDate < 0 || iVal < 0) return { ...out, error: "날짜·방문자 수 칸을 못 찾았어요." };
    for (const l of lines.slice(1)) {
      const c = splitCsv(l);
      const date = ymd(c[iDate] ?? "");
      const region = iRegion >= 0 ? c[iRegion] : "";
      if (region) {
        if (!/율량/.test(region)) return { ...out, error: `율량·사천동 파일이 아니에요 (파일 지역: ${region}).` };
        out.region = "율량·사천동";
      }
      const v = toNum(c[iVal]);
      if (!isValidDate(date) || v === null) { out.badRows.push(l.slice(0, 60)); continue; }
      const kind = c[iKind] ?? "";
      if (kind.includes("전체")) day(date).total = v;
      else if (kind.includes("외지인")) day(date).outsider = v;
      else if (kind.includes("현지인")) day(date).local = v;
      else out.badRows.push(l.slice(0, 60));
    }
  } else if (at("전체방문자") >= 0 && at("날짜") >= 0) {
    if (!/율량/.test(fileName)) return { ...out, error: "지역 칸이 없는 파일이라 파일 이름에 '율량'이 있어야 받아요." };
    out.region = "율량·사천동";
    const iDate = at("날짜"), iT = at("전체방문자"), iO = at("외지인"), iL = at("현지인");
    for (const l of lines.slice(1)) {
      const c = splitCsv(l);
      const date = ymd(c[iDate] ?? "");
      if (!isValidDate(date)) { out.badRows.push(l.slice(0, 60)); continue; }
      out.days[date] = { total: toNum(c[iT]), outsider: iO >= 0 ? toNum(c[iO]) : null, local: iL >= 0 ? toNum(c[iL]) : null };
    }
  } else return { ...out, error: "관광 데이터랩 방문자 수 파일 모양이 아니에요." };

  if (!out.region) return { ...out, error: "파일에서 지역을 확인하지 못했어요." };
  if (!Object.keys(out.days).length) return { ...out, error: "읽을 수 있는 날짜가 없어요." };
  return out;
}

/** 같은 날짜는 새 파일 값으로 바꾼다 (두 번 넣어도 두 번 더해지지 않는다) */
export function mergeVisitors(prev: VisitorStore | null, p: VisitorParse, fileName: string, importedAt: string): { store: VisitorStore; added: number; changed: number } {
  const days = { ...(prev?.days ?? {}) };
  let added = 0, changed = 0;
  for (const [d, v] of Object.entries(p.days)) {
    const old = days[d];
    const row: VisitorRow = [v.total, v.outsider, v.local];
    if (!old) added++;
    else if (old.some((x, k) => x !== row[k])) changed++;
    days[d] = row;
  }
  const dates = Object.keys(p.days).sort();
  const files = [...(prev?.files ?? []).filter((f) => f.name !== fileName), { name: fileName, importedAt, from: dates[0], to: dates[dates.length - 1], days: dates.length }];
  return { store: { region: p.region ?? prev?.region ?? "율량·사천동", files, days }, added, changed };
}

// ── 청주 버스 정류소 일별 승하차 (공식 다운로드 ZIP) ─────────────────────────

/** 두 좌표 사이 직선거리 (m) */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}
const coordOk = (lat: number, lng: number) => lat > 35 && lat < 38 && lng > 126 && lng < 129;

interface BusRow { date: string; sid: string; name: string; lat: number; lng: number; up: number; down: number }

export interface BusParse {
  month: string | null;
  rows: BusRow[];
  invalidDates: Record<string, number>;
  missingCoord: number;
  duplicates: number;
  error: string | null;
}

/** 정류소별 일별 승하차 CSV 글자들 → 율량·사천동 행만. 달력에 없는 날짜는 빼고 센다 */
export function parseBusCsvTexts(texts: string[], adm = YULLYANG_ADM): BusParse {
  const out: BusParse = { month: null, rows: [], invalidDates: {}, missingCoord: 0, duplicates: 0, error: null };
  const seen = new Set<string>();
  for (const text of texts) {
    const lines = stripBom(text).split(/\r?\n/);
    const head = splitCsv(lines[0] ?? "");
    const i = (n: string) => head.indexOf(n);
    const need = ["BRDG_DD", "STN_ID", "STN_KORN_NM", "ADMDST_CD", "STN_LOT", "STN_LAT", "TKCAR_TOT", "GOCAR_TOT", "YYYYMM"];
    if (need.some((n) => i(n) < 0)) return { ...out, error: `정류소별 일별 승하차 파일 모양이 아니에요 (없는 칸: ${need.filter((n) => i(n) < 0).join(", ")}).` };
    for (const l of lines.slice(1)) {
      if (!l.trim()) continue;
      const c = splitCsv(l);
      if (c[i("ADMDST_CD")] !== adm) continue;
      const raw = `${c[i("YYYYMM")]}${(c[i("BRDG_DD")] ?? "").padStart(2, "0")}`;
      const date = ymd(raw);
      if (!isValidDate(date)) { out.invalidDates[raw] = (out.invalidDates[raw] ?? 0) + 1; continue; }
      out.month ??= date.slice(0, 7);
      const sid = c[i("STN_ID")];
      const key = `${date}|${sid}`;
      if (seen.has(key)) { out.duplicates++; continue; }
      seen.add(key);
      const lat = Number(c[i("STN_LAT")]) || 0, lng = Number(c[i("STN_LOT")]) || 0;
      if (!coordOk(lat, lng)) out.missingCoord++;
      out.rows.push({ date, sid, name: c[i("STN_KORN_NM")], lat, lng, up: Number(c[i("TKCAR_TOT")]) || 0, down: Number(c[i("GOCAR_TOT")]) || 0 });
    }
  }
  if (!out.error && !out.rows.length) out.error = "율량·사천동 정류장 행이 없어요.";
  return out;
}

/** 공식 다운로드 ZIP(확장자가 .bin 이어도 안이 ZIP 이면 됨) → 안의 CSV 글자들 */
export function unzipCsvTexts(bytes: Uint8Array): string[] {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("ZIP 파일이 아니에요.");
  const files = unzipSync(bytes, { filter: (f) => f.name.toLowerCase().endsWith(".csv") });
  const dec = new TextDecoder("utf-8");
  return Object.keys(files).sort().map((k) => dec.decode(files[k]));
}

/** 한 달 파일을 합친다. 같은 달을 다시 넣으면 그 달 날짜를 통째로 바꾼다 (중복 계산 없음) */
export function mergeBus(prev: BusStore | null, p: BusParse, file: string, importedAt: string, center: { lat: number; lng: number }): BusStore {
  if (!p.month) throw new Error(p.error ?? "읽을 행이 없어요.");
  const stations = { ...(prev?.stations ?? {}) };
  for (const r of p.rows) {
    if (!coordOk(r.lat, r.lng)) continue;
    if (!stations[r.sid]) stations[r.sid] = { name: r.name, lat: r.lat, lng: r.lng, dist: Math.round(distanceM(center, { lat: r.lat, lng: r.lng })) };
  }
  const days: Record<string, BusRow7> = {};
  for (const [d, v] of Object.entries(prev?.days ?? {})) if (d.slice(0, 7) !== p.month) days[d] = v;
  for (const r of p.rows) {
    const b = (days[r.date] ??= [0, 0, 0, 0, 0, 0, 0]);
    b[0] += r.up;
    b[1] += r.down;
    b[6]++;
    const dist = stations[r.sid]?.dist;
    if (dist !== undefined && dist <= 500) { b[2] += r.up; b[3] += r.down; }
    if (dist !== undefined && dist <= 1000) { b[4] += r.up; b[5] += r.down; }
  }
  const monthFile: BusMonthFile = { month: p.month, file, importedAt, rows: p.rows.length, invalidDates: p.invalidDates, missingCoord: p.missingCoord, duplicates: p.duplicates };
  const months = [...(prev?.months ?? []).filter((m) => m.month !== p.month), monthFile].sort((a, b) => a.month.localeCompare(b.month));
  return { adm: YULLYANG_ADM, center, months, stations, days };
}

/** 받아 둔 달 사이에 빠진 달 ("2026-05" 처럼 공식 목록에 없던 달) */
export function missingMonths(months: string[]): string[] {
  const s = [...new Set(months)].sort();
  if (s.length < 2) return [];
  const out: string[] = [];
  let [y, m] = s[0].split("-").map(Number);
  const last = s[s.length - 1];
  for (let k = 0; k < 600; k++) {
    const cur = `${y}-${String(m).padStart(2, "0")}`;
    if (cur > last) break;
    if (!s.includes(cur)) out.push(cur);
    if (m === 12) { y++; m = 1; } else m++;
  }
  return out;
}
