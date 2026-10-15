import { emptyData, readLocal, writeLocal, type LocalData } from "./local";

// 백업 파일 — 내 PC 모드는 브라우저에만 저장되므로, 브라우저 기록을 지우면 사라진다.
// 그래서 백업 파일(JSON)로 내려받고 다시 불러올 수 있게 한다. 백업 파일에는 실제 숫자가 들어 있으니 저장소에 올리지 않는다.
//
// 복원은 세 단계로 나눈다. 어느 단계도 "쓰기"를 하지 않고, 마지막 applyBackup 만 쓴다.
//  1) inspectBackup(text)  — 파일을 읽고 검사해서 요약을 만든다. 저장소를 건드리지 않는다.
//  2) 화면이 요약·차이·경고를 보여 주고 사장님 확인을 받는다 (RestoreDialog).
//  3) applyBackup(inspection) — 한 번의 setItem 으로 덮어쓴다. 실패하면 브라우저가 이전 값을 그대로 둔다.

export const BACKUP_APP = "sootdak-ledger";
export const BACKUP_VERSION = 1;
const SUPPORTED_VERSIONS = [1];

export function exportBackup(): string {
  return JSON.stringify({ app: BACKUP_APP, version: BACKUP_VERSION, savedAt: new Date().toISOString(), data: readLocal() }, null, 2);
}

// ── 검사 ─────────────────────────────────────────────────────────
export interface BackupSummary {
  transactions: number;
  txMonths: string[]; // 거래가 있는 달 (정렬)
  dailySales: number;
  saleDates: { from: string; to: string } | null;
  saleMonths: string[];
  staff: number;
  shifts: number;
  settings: number;
  settingKeys: string[];
  rules: number;
  channelSales: number;
  closings: number;
  uploads: number;
  weather: number;
  latestDate: string | null; // 거래·일별매출 중 가장 늦은 날짜 (백업이 오래됐는지 보려고)
}

export type BackupInspection =
  | { ok: false; errors: string[] }
  | {
      ok: true;
      data: LocalData;
      version: number;
      savedAt: string | null;
      summary: BackupSummary;
      warnings: string[]; // 복원은 되지만 알고 있어야 할 것
      filled: string[]; // 파일에 없어서 안전한 기본값으로 채운 항목
    };

const LIST_KEYS: (keyof LocalData)[] = ["transactions", "rules", "channelSales", "closings", "uploads", "dailySales", "shifts", "staff", "settings", "weather"];
const KEY_LABEL: Record<keyof LocalData, string> = {
  transactions: "거래(통장)",
  rules: "분류 규칙",
  channelSales: "달별 채널 매출",
  closings: "마감 기록",
  uploads: "올린 파일 기록",
  dailySales: "일별 매출",
  shifts: "근무 기록",
  staff: "직원",
  settings: "설정",
  weather: "날씨",
};
// 이게 없으면 복원하지 않는다. 나머지는 빈 목록(규칙은 기본 규칙)으로 채우고 그 사실을 알린다.
const REQUIRED: (keyof LocalData)[] = ["transactions"];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const MAX_ERRORS = 12;

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export function summarize(d: LocalData): BackupSummary {
  const txMonths = [...new Set(d.transactions.map((t) => t.month))].sort();
  const saleDates = d.dailySales.map((s) => s.date).sort();
  const saleMonths = [...new Set(saleDates.map((x) => x.slice(0, 7)))].sort();
  const allDates = [...d.transactions.map((t) => t.date), ...saleDates].filter((x) => DATE.test(x)).sort();
  return {
    transactions: d.transactions.length,
    txMonths,
    dailySales: d.dailySales.length,
    saleDates: saleDates.length ? { from: saleDates[0], to: saleDates[saleDates.length - 1] } : null,
    saleMonths,
    staff: d.staff.length,
    shifts: d.shifts.length,
    settings: d.settings.length,
    settingKeys: d.settings.map((s) => s.key).sort(),
    rules: d.rules.length,
    channelSales: d.channelSales.length,
    closings: d.closings.length,
    uploads: d.uploads.length,
    weather: d.weather.length,
    latestDate: allDates.length ? allDates[allDates.length - 1] : null,
  };
}

export function inspectBackup(text: string): BackupInspection {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["파일을 읽지 못했어요. 이 도구에서 저장한 .json 파일이 맞나요? (중간에 잘렸거나 다른 파일이에요)"] };
  }
  if (!isObj(parsed)) return { ok: false, errors: ["백업 파일의 모양이 아니에요."] };
  if (parsed.app !== BACKUP_APP) return { ok: false, errors: ["이 도구의 백업 파일이 아니에요 (앱 표시가 달라요)."] };
  if (!isNum(parsed.version)) return { ok: false, errors: ["백업 버전 정보가 없어요. 손으로 고친 파일이거나 불완전한 파일이에요."] };
  if (!SUPPORTED_VERSIONS.includes(parsed.version)) {
    return { ok: false, errors: [parsed.version > BACKUP_VERSION ? `새 버전(${parsed.version})의 백업이라 이 앱(버전 ${BACKUP_VERSION})에서는 불러올 수 없어요. 앱을 먼저 새로 받아 주세요.` : `지원하지 않는 백업 버전(${parsed.version})이에요.`] };
  }
  if (!isObj(parsed.data)) return { ok: false, errors: ["백업 안에 장부 데이터(data)가 없어요."] };
  const raw = parsed.data;

  const errors: string[] = [];
  const warnings: string[] = [];
  const filled: string[] = [];
  const err = (m: string) => {
    if (errors.length < MAX_ERRORS) errors.push(m);
  };

  // 1) 항목별 존재·모양
  for (const k of LIST_KEYS) {
    const v = raw[k];
    if (v === undefined) {
      if (REQUIRED.includes(k)) err(`필수 항목 '${KEY_LABEL[k]}'이 파일에 없어요. 불완전한 파일이라 복원하지 않아요.`);
      else filled.push(k === "rules" ? `${KEY_LABEL[k]} — 파일에 없어서 기본 규칙으로 채워요` : `${KEY_LABEL[k]} — 파일에 없어서 빈 목록으로 채워요`);
    } else if (!Array.isArray(v)) err(`'${KEY_LABEL[k]}' 항목이 목록이 아니에요.`);
  }
  if (errors.length) return { ok: false, errors };

  // 파일에 없는 항목은 emptyData() 의 기본값(규칙은 기본 규칙, 나머지는 빈 목록)으로 채운다. 위 filled 에 적어 둔 것과 같다.
  const data: LocalData = { ...emptyData(), ...(raw as Partial<LocalData>) };

  // 2) 줄 단위 검사 — 날짜·금액·필수 칸·중복·참조
  // 중복은 "경고"다, 거절이 아니다. 앱 자체가 품고 있는 데이터(예: 다른 도구가 넣은 같은 날·같은 카드사 두 줄)를
  // 백업조차 못 하게 되면 더 위험하다 (G단계 실제 장부에서 발견). 복원하면 그대로 복원되고, 화면에서 고치면 된다.
  const dupCount = new Map<string, number>();
  const seen = (label: string) => {
    const s = new Set<string>();
    return (key: string, where: string) => {
      if (s.has(key)) {
        dupCount.set(label, (dupCount.get(label) ?? 0) + 1);
        if ((dupCount.get(label) ?? 0) <= 3) warnings.push(`${label}에 같은 ${where}이(가) 두 번 있어요: ${key} — 그날 숫자가 두 번 더해질 수 있어요. 화면에서 그날을 다시 저장하면 한 줄로 정리돼요.`);
      }
      s.add(key);
    };
  };
  const txSeen = seen("거래");
  data.transactions.forEach((t, i) => {
    const at = `거래 ${i + 1}번째 줄`;
    if (!isStr(t?.id)) return err(`${at}: 식별자(id)가 없어요.`);
    txSeen(t.id, "식별자");
    if (!MONTH.test(String(t.month))) err(`${at}: 달(month) 형식이 틀려요 (${String(t.month)}).`);
    if (!DATE.test(String(t.date))) err(`${at}: 날짜 형식이 틀려요 (${String(t.date)}).`);
    // 음수는 허용한다 — 은행 내역의 취소·환불 줄은 출금이 음수로 들어온다 (F단계에서 가짜 9월 파일로 발견)
    if (!isNum(t.out) || !isNum(t.in)) err(`${at}: 출금·입금이 숫자가 아니에요.`);
    if (t.source !== "bank" && t.source !== "manual") err(`${at}: 출처(source)가 bank/manual 이 아니에요.`);
  });
  const saleSeen = seen("일별 매출");
  data.dailySales.forEach((s, i) => {
    const at = `일별 매출 ${i + 1}번째 줄`;
    if (!DATE.test(String(s?.date))) return err(`${at}: 날짜 형식이 틀려요 (${String(s?.date)}).`);
    if (!isStr(s.channel)) return err(`${at}: 채널이 비어 있어요.`);
    if (!isNum(s.amount)) err(`${at}: 금액이 숫자가 아니에요.`);
    // 같은 날·같은 카드사라도 "포스 간편결제 승인(pos_easy)" 줄은 일반 승인 줄과 따로 한 줄 더 두는 게 앱 설계다 → 출처까지 같을 때만 중복
    saleSeen(`${s.date}/${s.channel}${s.source ? `(${s.source})` : ""}`, "날짜·채널·출처");
  });
  const staffSeen = seen("직원");
  const staffIds = new Set<string>();
  data.staff.forEach((p, i) => {
    if (!isStr(p?.id)) return err(`직원 ${i + 1}번째 줄: 식별자가 없어요.`);
    staffSeen(p.id, "식별자");
    staffIds.add(p.id);
    if (!isNum(p.wage) || p.wage < 0) err(`직원 ${i + 1}번째 줄: 시급이 숫자가 아니에요.`);
  });
  let orphanShifts = 0;
  data.shifts.forEach((sh, i) => {
    const at = `근무 ${i + 1}번째 줄`;
    if (!DATE.test(String(sh?.date))) return err(`${at}: 날짜 형식이 틀려요.`);
    if (!isStr(sh.staffId)) return err(`${at}: 직원 표시가 없어요.`);
    if (!isNum(sh.hours) || sh.hours < 0) err(`${at}: 근무시간이 숫자가 아니에요.`);
    if (!staffIds.has(sh.staffId)) orphanShifts += 1;
  });
  if (orphanShifts) warnings.push(`근무 기록 ${orphanShifts}줄이 파일에 없는 직원을 가리켜요 (지운 직원일 수 있어요). 그 줄의 인건비는 0원으로 계산돼요.`);
  const ruleSeen = seen("분류 규칙");
  data.rules.forEach((r, i) => {
    if (!isStr(r?.id)) return err(`분류 규칙 ${i + 1}번째 줄: 식별자가 없어요.`);
    ruleSeen(r.id, "식별자");
    if (!isStr(r.keyword)) err(`분류 규칙 ${i + 1}번째 줄: 글자(keyword)가 비어 있어요.`);
  });
  const csSeen = seen("달별 채널 매출");
  data.channelSales.forEach((c, i) => {
    const at = `달별 채널 매출 ${i + 1}번째 줄`;
    if (!MONTH.test(String(c?.month)) || !isStr(c?.channel)) return err(`${at}: 달 또는 채널이 틀려요.`);
    if (!isNum(c.orders) || !isNum(c.deposit)) err(`${at}: 주문금액·정산금액이 숫자가 아니에요.`);
    csSeen(`${c.month}/${c.channel}`, "달·채널");
  });
  const closingSeen = seen("마감 기록");
  data.closings.forEach((c) => isStr(c?.month) && closingSeen(c.month, "달"));
  const uploadSeen = seen("올린 파일 기록");
  data.uploads.forEach((u) => isStr(u?.id) && uploadSeen(u.id, "식별자"));
  const settingSeen = seen("설정");
  data.settings.forEach((s, i) => {
    if (!isStr(s?.key)) return err(`설정 ${i + 1}번째 줄: 이름(key)이 없어요.`);
    settingSeen(s.key, "이름");
  });
  const weatherSeen = seen("날씨");
  data.weather.forEach((w) => DATE.test(String(w?.date)) && weatherSeen(w.date, "날짜"));

  if (errors.length) return { ok: false, errors };

  const savedAt = typeof parsed.savedAt === "string" ? parsed.savedAt : null;
  if (!savedAt) warnings.push("백업 저장 시각이 파일에 없어요.");
  return { ok: true, data, version: parsed.version, savedAt, summary: summarize(data), warnings, filled };
}

// ── 현재 장부와 비교 ───────────────────────────────────────────────
export interface BackupDiff {
  rows: { label: string; current: number; backup: number }[];
  losses: string[]; // 복원하면 사라질 수 있는 것
  olderThanCurrent: boolean; // 백업의 마지막 날짜가 현재 장부보다 앞섬
}

export function diffBackup(current: BackupSummary, backup: BackupSummary): BackupDiff {
  const rows: BackupDiff["rows"] = [
    { label: "거래(통장)", current: current.transactions, backup: backup.transactions },
    { label: "일별 매출", current: current.dailySales, backup: backup.dailySales },
    { label: "직원", current: current.staff, backup: backup.staff },
    { label: "근무 기록", current: current.shifts, backup: backup.shifts },
    { label: "설정", current: current.settings, backup: backup.settings },
    { label: "분류 규칙", current: current.rules, backup: backup.rules },
    { label: "달별 채널 매출", current: current.channelSales, backup: backup.channelSales },
    { label: "마감 기록", current: current.closings, backup: backup.closings },
    { label: "날씨", current: current.weather, backup: backup.weather },
  ];
  const losses: string[] = [];
  const lostTxMonths = current.txMonths.filter((m) => !backup.txMonths.includes(m));
  if (lostTxMonths.length) losses.push(`거래가 있는 달 중 파일에 없는 달: ${lostTxMonths.join(", ")}`);
  const lostSaleMonths = current.saleMonths.filter((m) => !backup.saleMonths.includes(m));
  if (lostSaleMonths.length) losses.push(`일별 매출이 있는 달 중 파일에 없는 달: ${lostSaleMonths.join(", ")}`);
  const lostKeys = current.settingKeys.filter((k) => !backup.settingKeys.includes(k));
  if (lostKeys.length) losses.push(`파일에 없는 설정 ${lostKeys.length}개 (${lostKeys.slice(0, 5).join(", ")}${lostKeys.length > 5 ? " …" : ""})`);
  for (const r of rows) if (r.backup < r.current) losses.push(`${r.label}: ${r.current}건 → ${r.backup}건 (${r.current - r.backup}건 줄어요)`);
  const olderThanCurrent = !!(current.latestDate && backup.latestDate && backup.latestDate < current.latestDate) || !!(current.latestDate && !backup.latestDate);
  return { rows, losses, olderThanCurrent };
}

// ── 영수증 사진 연결 ────────────────────────────────────────────────
// 사진은 IndexedDB 에 따로 있고 ownerId(영수증 id 또는 고정비 id)로만 연결된다.
// JSON 복원은 사진을 건드리지 않지만, 설정 안의 영수증·고정비 목록이 바뀌면 연결이 끊긴 사진(고아)이 생길 수 있다.
export function photoOwnerIds(d: LocalData): Set<string> {
  const ids = new Set<string>();
  for (const s of d.settings) {
    if (!(s.key.startsWith("purchases_") || s.key === "fixed_costs") || !Array.isArray(s.value)) continue;
    for (const row of s.value as unknown[]) {
      const id = (row as { id?: unknown })?.id;
      if (typeof id === "string") ids.add(id);
    }
  }
  return ids;
}

export interface PhotoLinkRisk {
  photos: number; // 이 브라우저의 사진 수
  linkedNow: number; // 지금 장부와 연결된 사진
  linkedAfter: number; // 복원 뒤에도 연결될 사진
  orphanedAfter: number; // 복원하면 연결이 끊길 사진
  message: string | null;
}

export function photoLinkRisk(current: LocalData | null, backup: LocalData, countsByOwner: Record<string, number>): PhotoLinkRisk {
  const owners = Object.keys(countsByOwner);
  const photos = owners.reduce((a, k) => a + countsByOwner[k], 0);
  const nowIds = current ? photoOwnerIds(current) : new Set<string>();
  const afterIds = photoOwnerIds(backup);
  const linkedNow = owners.filter((k) => nowIds.has(k)).reduce((a, k) => a + countsByOwner[k], 0);
  const linkedAfter = owners.filter((k) => afterIds.has(k)).reduce((a, k) => a + countsByOwner[k], 0);
  const orphanedAfter = owners.filter((k) => nowIds.has(k) && !afterIds.has(k)).reduce((a, k) => a + countsByOwner[k], 0);
  let message: string | null = null;
  if (photos === 0) message = null;
  else if (orphanedAfter > 0) message = `영수증 사진 ${orphanedAfter}장은 복원 뒤 연결이 끊겨요 (사진은 지워지지 않지만 화면에서 보이지 않아요). 이 파일에 그 영수증 기록이 없기 때문이에요.`;
  else if (linkedAfter < photos) message = `사진 ${photos - linkedAfter}장은 지금도 연결된 영수증이 없어요. 복원과는 무관해요.`;
  return { photos, linkedNow, linkedAfter, orphanedAfter, message };
}

// ── 확인 조건 ────────────────────────────────────────────────────
export const RESTORE_WORD = "복원";

export interface RestoreGate {
  hasCurrent: boolean; // 현재 장부에 지킬 것이 있다 (비어 있지 않거나 손상 상태)
  typed: string; // 사장님이 친 글자
  preBackupConfirmed: boolean; // 사전 백업(또는 손상 원본) 파일을 확인했다고 체크
}
export function canRestore(g: RestoreGate): boolean {
  if (!g.hasCurrent) return true;
  return g.typed.trim() === RESTORE_WORD && g.preBackupConfirmed;
}

// ── 쓰기 ─────────────────────────────────────────────────────────
// 한 번의 setItem. 지우고 다시 쓰지 않는다 — 실패하면 브라우저가 이전 값을 그대로 둔다.
export function applyBackup(inspection: Extract<BackupInspection, { ok: true }>): LocalData {
  writeLocal(inspection.data);
  return inspection.data;
}
