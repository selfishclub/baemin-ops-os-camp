// 열람 기록·접속 위치·자동 로그아웃에서 쓰는 순수 함수들 (데이터 창고·화면과 무관, tests/view-data.test.mjs 가 검사)

export type ViewKind = "login" | "logout" | "recipe" | "manual" | "media" | "chat" | "blocked";

export type ViewRow = {
  id: number;
  user_id: string;
  user_name: string;
  kind: ViewKind;
  target_id: string;
  target_name: string;
  ip: string;
  outside: boolean;
  device: string;
  viewed_at: string;
};

export const viewKindLabels: Record<ViewKind, string> = {
  login: "로그인",
  logout: "로그아웃",
  recipe: "레시피 열람",
  manual: "매뉴얼 열람",
  media: "사진 열람",
  chat: "챗봇 질문",
  blocked: "매장 밖 접속 차단",
};

// 요청 머리글에서 접속한 곳의 인터넷 주소를 뽑는다 (Vercel 은 x-forwarded-for 에 실제 주소를 맨 앞에 준다)
export function pickIp(headers: { get(name: string): string | null }) {
  const forwarded = headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim() ?? "";
  const ip = first || headers.get("x-real-ip")?.trim() || "";
  return ip.replace(/^::ffff:/, "").slice(0, 45);
}

// 브라우저 식별 문자열을 "아이폰 · Safari" 처럼 짧게. 기록 화면에서 어느 기기였는지 알아보기 위한 것
export function describeDevice(userAgent: string) {
  const ua = userAgent || "";
  const os = /iPhone/i.test(ua) ? "아이폰"
    : /iPad/i.test(ua) ? "아이패드"
    : /Android/i.test(ua) ? "안드로이드"
    : /Windows/i.test(ua) ? "윈도우 PC"
    : /Macintosh|Mac OS/i.test(ua) ? "맥"
    : /Linux/i.test(ua) ? "리눅스"
    : "알 수 없는 기기";
  const browser = /Edg\//i.test(ua) ? "Edge"
    : /SamsungBrowser/i.test(ua) ? "삼성 브라우저"
    : /Whale/i.test(ua) ? "웨일"
    : /KAKAOTALK/i.test(ua) ? "카카오톡"
    : /NAVER/i.test(ua) ? "네이버 앱"
    : /Chrome\//i.test(ua) && !/Chromium/i.test(ua) ? "Chrome"
    : /Firefox\//i.test(ua) ? "Firefox"
    : /Safari\//i.test(ua) ? "Safari"
    : "";
  return browser ? `${os} · ${browser}` : os;
}

// 매장 인터넷 주소 목록: "1.2.3.4, 5.6.7." 처럼 쉼표로 여러 개. 끝이 점(.)으로 끝나면 앞부분만 맞으면 된다
export function parseShopIps(value: string | undefined) {
  return (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

export function matchesShopIp(ip: string, patterns: string[]) {
  if (!ip) return false;
  return patterns.some((pattern) => (pattern.endsWith(".") || pattern.endsWith(":") ? ip.startsWith(pattern) : ip === pattern));
}

// 매장 주소 목록이 비어 있으면 아무도 "밖"이 아니다 (설정 전에는 표시만 없고 막지도 않는다)
export function isOutsideShop(ip: string, patterns: string[]) {
  return patterns.length > 0 && !matchesShopIp(ip, patterns);
}

// 자동 로그아웃까지의 분. 비었으면 30분, 0 이면 끄기, 너무 짧으면 5분
export function parseIdleMinutes(value: string | undefined) {
  if (value === undefined || value.trim() === "") return 30;
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.max(5, Math.min(24 * 60, Math.round(minutes)));
}

export function isIdleExpired(lastSeenMs: number, nowMs: number, idleMinutes: number) {
  if (idleMinutes <= 0) return false;
  if (!Number.isFinite(lastSeenMs) || lastSeenMs <= 0) return false;
  return nowMs - lastSeenMs > idleMinutes * 60_000;
}

export type PersonSummary = {
  id: string;
  name: string;
  lastAt: string;
  lastKind: ViewKind | "";
  lastDevice: string;
  todayCount: number;
  periodCount: number;
  outsideCount: number;
  blockedCount: number;
};

// 사람별 요약: 마지막 활동, 오늘 건수, 기간 건수, 매장 밖 건수
export function summarizeByPerson(rows: ViewRow[], today: string, staff: { id: string; display_name: string; login_id: string }[]): PersonSummary[] {
  const map = new Map<string, PersonSummary>();
  for (const person of staff) {
    map.set(person.id, { id: person.id, name: person.display_name || person.login_id, lastAt: "", lastKind: "", lastDevice: "", todayCount: 0, periodCount: 0, outsideCount: 0, blockedCount: 0 });
  }
  for (const row of rows) {
    const entry = map.get(row.user_id) ?? { id: row.user_id, name: row.user_name || "(이름 없음)", lastAt: "", lastKind: "" as const, lastDevice: "", todayCount: 0, periodCount: 0, outsideCount: 0, blockedCount: 0 };
    map.set(row.user_id, entry);
    entry.periodCount += 1;
    if (seoulDate(row.viewed_at) === today) entry.todayCount += 1;
    if (row.outside) entry.outsideCount += 1;
    if (row.kind === "blocked") entry.blockedCount += 1;
    if (!entry.lastAt || row.viewed_at > entry.lastAt) {
      entry.lastAt = row.viewed_at;
      entry.lastKind = row.kind;
      entry.lastDevice = row.device;
    }
  }
  return [...map.values()].sort((a, b) => (b.lastAt > a.lastAt ? 1 : b.lastAt < a.lastAt ? -1 : a.name.localeCompare(b.name, "ko")));
}

// 날짜별 묶음 (최근 날짜가 먼저, 같은 날 안에서는 최근 것이 먼저)
export function groupByDate(rows: ViewRow[]): { date: string; rows: ViewRow[] }[] {
  const groups = new Map<string, ViewRow[]>();
  for (const row of [...rows].sort((a, b) => (a.viewed_at < b.viewed_at ? 1 : a.viewed_at > b.viewed_at ? -1 : 0))) {
    const date = seoulDate(row.viewed_at);
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date)!.push(row);
  }
  return [...groups.entries()].map(([date, items]) => ({ date, rows: items }));
}

// 한국 시간 기준 YYYY-MM-DD
export function seoulDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function seoulTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

// 기록 한 줄을 사람이 읽는 문장으로
export function describeRow(row: ViewRow) {
  switch (row.kind) {
    case "recipe": return `레시피 「${row.target_name || row.target_id}」`;
    case "manual": return `매뉴얼 「${row.target_name || row.target_id}」`;
    case "media": return `사진 · ${row.target_name || row.target_id}`;
    case "chat": return `물어보기: ${row.target_name}`;
    case "login": return "로그인";
    case "logout": return row.target_name ? `로그아웃 (${row.target_name})` : "로그아웃";
    case "blocked": return "매장 밖에서 열려다 막힘";
    default: return row.target_name;
  }
}
