// 인수인계: 교대할 때 다음 근무자에게 남기는 메모 + 읽음 확인. 쓴 사람 2점, 읽었어요 1점.
// 순수 함수만 — tests/handover-data.test.mjs 가 검사.

export type HandoverShift = "open" | "middle" | "close" | "other";

export const shiftLabels: Record<HandoverShift, string> = { open: "오픈 → 미들", middle: "미들 → 마감", close: "마감 → 다음 날 오픈", other: "기타" };
export const handoverMaxLength = 500;
export const handoverDays = 7;

export type HandoverRead = { user_id: string; user_name: string; read_at: string };

export type HandoverRow = {
  id: number;
  author_id: string;
  author_name: string;
  shift: HandoverShift;
  text: string;
  created_at: string;
  reads: HandoverRead[];
};

export type HandoverView = HandoverRow & { readByMe: boolean; mine: boolean; unreadNames: string[] };

export function isShift(value: unknown): value is HandoverShift {
  return value === "open" || value === "middle" || value === "close" || value === "other";
}

export function validateHandover(input: { shift: unknown; text: string }): string | null {
  if (!isShift(input.shift)) return "어느 교대인지 골라 주세요.";
  const text = input.text.trim();
  if (!text) return "다음 근무자에게 남길 내용을 적어 주세요.";
  if (text.length > handoverMaxLength) return `인수인계는 ${handoverMaxLength}자까지예요.`;
  return null;
}

// 화면용: 내가 읽었는지, 내 글인지, 아직 안 읽은 재직 직원 이름
export function buildHandoverViews(rows: HandoverRow[], me: string, staff: { id: string; display_name: string; login_id: string; active: boolean; role: string }[]): HandoverView[] {
  const active = staff.filter((person) => person.active);
  return rows.map((row) => {
    const readIds = new Set(row.reads.map((read) => read.user_id));
    return {
      ...row,
      readByMe: readIds.has(me),
      mine: row.author_id === me,
      unreadNames: active.filter((person) => person.id !== row.author_id && !readIds.has(person.id)).map((person) => person.display_name || person.login_id),
    };
  });
}

export function unreadCount(views: HandoverView[]) {
  return views.filter((view) => !view.mine && !view.readByMe).length;
}
