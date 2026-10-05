// 칭찬 릴레이: 하루 한 장, 이름으로. 받은 칭찬은 점수판에 더해진다 (받음 2점, 보냄 1점).
// 순수 함수만 — tests/praise-data.test.mjs 가 검사.

export type PraiseRow = {
  id: number;
  from_user: string;
  from_name: string;
  to_user: string;
  to_name: string;
  text: string;
  created_at: string;
};

export const praiseMaxLength = 120;
export const praisePerDay = 1;

// 자주 쓰는 칭찬 틀 (눌러서 넣고 고쳐 쓴다)
export const praiseTemplates = [
  "바쁜 시간에 먼저 나서서 도와줘서 고마워요",
  "손님께 설명하는 말투가 정말 친절했어요",
  "마감 정리가 깔끔해서 다음 날 오픈이 편했어요",
  "레시피대로 꼼꼼하게 만들어서 품질이 좋았어요",
  "힘든 손님을 침착하게 응대해서 배웠어요",
];

export function seoulDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

// 칭찬 글 검사: 비었거나 너무 길거나 자기 자신이면 안 된다
export function validatePraise(input: { fromUser: string; toUser: string; text: string }): string | null {
  const text = input.text.trim();
  if (!input.toUser) return "누구를 칭찬할지 골라 주세요.";
  if (input.toUser === input.fromUser) return "자기 자신은 칭찬할 수 없어요 — 동료를 칭찬해 주세요.";
  if (!text) return "칭찬 한 줄을 적어 주세요.";
  if (text.length > praiseMaxLength) return `칭찬은 ${praiseMaxLength}자까지예요.`;
  return null;
}

// 오늘 이미 보냈나 (한국 날짜 기준)
export function sentToday(rows: PraiseRow[], fromUser: string, today: string) {
  return rows.filter((row) => row.from_user === fromUser && seoulDate(row.created_at) === today).length >= praisePerDay;
}

export type PraiseSummary = { id: string; name: string; received: number; given: number; lastReceived: string };

// 사람별 받은·보낸 수 (기간 안의 기록으로)
export function summarizePraise(rows: PraiseRow[], staff: { id: string; display_name: string; login_id: string }[]): PraiseSummary[] {
  const map = new Map<string, PraiseSummary>();
  for (const person of staff) map.set(person.id, { id: person.id, name: person.display_name || person.login_id, received: 0, given: 0, lastReceived: "" });
  for (const row of rows) {
    const to = map.get(row.to_user);
    if (to) {
      to.received += 1;
      if (row.created_at > to.lastReceived) to.lastReceived = row.created_at;
    }
    const from = map.get(row.from_user);
    if (from) from.given += 1;
  }
  return [...map.values()].sort((a, b) => b.received - a.received || b.given - a.given || a.name.localeCompare(b.name, "ko"));
}

// 릴레이: 오늘 칭찬을 받았는데 아직 아무에게도 안 보냈으면 "이어가요"
export function shouldRelay(rows: PraiseRow[], me: string, today: string) {
  const receivedToday = rows.some((row) => row.to_user === me && seoulDate(row.created_at) === today);
  return receivedToday && !sentToday(rows, me, today);
}
