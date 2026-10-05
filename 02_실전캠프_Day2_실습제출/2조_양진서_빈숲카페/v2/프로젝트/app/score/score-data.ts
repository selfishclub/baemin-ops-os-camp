// 점수판·레벨: 이미 남는 기록(오늘 체크, 교육 체크, 퀴즈, 시험, 바뀐 레시피 확인)을 사람별로 세어 점수와 레벨로 바꾼다.
// 순수 함수만 — 데이터 창고·화면과 무관 (tests/score-data.test.mjs 가 검사).
//
// 원칙: 점수와 레벨은 "재미와 격려"용이다. 급여·승급 결정에 자동으로 연결하지 않는다 (승급은 시험·인증에서 사장이 정한다).

export type ActivityCounts = {
  user_id: string;
  display_name: string;
  login_id: string;
  role: "owner" | "staff";
  active: boolean;
  checks: number;           // 오늘 체크 항목을 누른 수
  signoffs: number;         // 사장 "확인함" (사장만)
  practiced_recipes: number; // 메뉴 "만들어 봤음"
  confirmed_recipes: number; // 메뉴 사장 "확인함"
  docs_read: number;        // 매뉴얼 "읽었어요"
  docs_confirmed: number;   // 매뉴얼 사장 확인
  exam_items: number;       // 실기 합격 항목
  quiz_passed: number;      // 연습 퀴즈 70% 이상
  exam_written: number;     // 시험 필기 80% 이상
  acks: number;             // 바뀐 레시피·매뉴얼 "확인했어요"
  reads: number;            // 레시피·매뉴얼 열람 (점수 아님, 통계용)
};

export type ScoreCategory = { key: keyof ActivityCounts; label: string; points: number; unit: string };

// 무엇을 하면 몇 점인지 (바꾸려면 여기 한 곳)
export const scoreCategories: ScoreCategory[] = [
  { key: "checks", label: "오늘 체크", points: 1, unit: "항목" },
  { key: "acks", label: "바뀐 내용 확인했어요", points: 1, unit: "건" },
  { key: "docs_read", label: "매뉴얼 읽었어요", points: 1, unit: "장" },
  { key: "docs_confirmed", label: "매뉴얼 사장 확인", points: 2, unit: "장" },
  { key: "practiced_recipes", label: "메뉴 만들어 봤음", points: 2, unit: "개" },
  { key: "confirmed_recipes", label: "메뉴 사장 확인", points: 3, unit: "개" },
  { key: "quiz_passed", label: "연습 퀴즈 통과", points: 3, unit: "번" },
  { key: "exam_items", label: "실기 합격", points: 5, unit: "항목" },
  { key: "exam_written", label: "필기 합격", points: 10, unit: "번" },
];

export type LevelDef = { name: string; min: number; mark: string; note: string };

// 카페다운 레벨 이름. 숫자는 "한 달 성실히 하면 한 단계" 정도로 잡았다 — 사장이 바꿔도 된다.
export const defaultLevels: LevelDef[] = [
  { name: "새싹", min: 0, mark: "🌱", note: "처음 왔어요" },
  { name: "원두", min: 30, mark: "🫘", note: "기본을 익히는 중" },
  { name: "바리스타", min: 80, mark: "☕", note: "혼자서도 한 품질" },
  { name: "로스터", min: 160, mark: "🔥", note: "후배를 가르칠 수 있어요" },
  { name: "숲지기", min: 300, mark: "🌳", note: "빈숲을 지키는 사람" },
];

export type BreakdownItem = { key: keyof ActivityCounts; label: string; count: number; points: number; each: number; unit: string };

export function breakdown(counts: ActivityCounts): BreakdownItem[] {
  return scoreCategories.map((category) => {
    const count = Number(counts[category.key] ?? 0);
    return { key: category.key, label: category.label, count, each: category.points, unit: category.unit, points: count * category.points };
  });
}

export function totalPoints(counts: ActivityCounts) {
  return breakdown(counts).reduce((sum, item) => sum + item.points, 0);
}

export type LevelStatus = { level: LevelDef; index: number; next: LevelDef | null; toNext: number; progress: number };

export function levelFor(points: number, levels: LevelDef[] = defaultLevels): LevelStatus {
  const sorted = [...levels].sort((a, b) => a.min - b.min);
  let index = 0;
  for (let i = 0; i < sorted.length; i += 1) if (points >= sorted[i].min) index = i;
  const level = sorted[index];
  const next = sorted[index + 1] ?? null;
  const span = next ? next.min - level.min : 1;
  const progress = next ? Math.min(1, Math.max(0, (points - level.min) / span)) : 1;
  return { level, index, next, toNext: next ? Math.max(0, next.min - points) : 0, progress };
}

export type BoardRow = {
  id: string;
  name: string;
  role: "owner" | "staff";
  allTime: number;
  period: number;
  level: LevelStatus;
  rank: number; // 기간 점수 순위 (같은 점수는 같은 등수)
};

// 점수판: 기간 점수로 줄 세우고, 레벨은 누적 점수로. 사장은 점수판에서 뺀다 (직원끼리 겨루는 판)
export function buildBoard(allTime: ActivityCounts[], period: ActivityCounts[], levels: LevelDef[] = defaultLevels): BoardRow[] {
  const periodMap = new Map(period.map((row) => [row.user_id, row]));
  const rows = allTime
    .filter((row) => row.active && row.role !== "owner")
    .map((row) => {
      const all = totalPoints(row);
      const periodRow = periodMap.get(row.user_id);
      return { id: row.user_id, name: row.display_name || row.login_id, role: row.role, allTime: all, period: periodRow ? totalPoints(periodRow) : 0, level: levelFor(all, levels), rank: 0 };
    })
    .sort((a, b) => b.period - a.period || b.allTime - a.allTime || a.name.localeCompare(b.name, "ko"));
  let rank = 0;
  let last = -1;
  rows.forEach((row, index) => {
    if (row.period !== last) {
      rank = index + 1;
      last = row.period;
    }
    row.rank = rank;
  });
  return rows;
}

export type Highlight = { key: keyof ActivityCounts; label: string; name: string; count: number };

// 사장 통계: 항목마다 "제일 많이 한 사람" (0건이면 없음)
export function highlights(rows: ActivityCounts[]): Highlight[] {
  const labels: { key: keyof ActivityCounts; label: string }[] = [
    { key: "checks", label: "오늘 체크를 제일 많이" },
    { key: "acks", label: "바뀐 내용을 제일 빨리·많이 확인" },
    { key: "docs_read", label: "매뉴얼을 제일 많이 읽음" },
    { key: "practiced_recipes", label: "메뉴를 제일 많이 만들어 봄" },
    { key: "quiz_passed", label: "퀴즈를 제일 많이 통과" },
    { key: "reads", label: "레시피·매뉴얼을 제일 자주 열어 봄" },
  ];
  const staff = rows.filter((row) => row.active && row.role !== "owner");
  return labels.flatMap(({ key, label }) => {
    const best = [...staff].sort((a, b) => Number(b[key]) - Number(a[key]))[0];
    const count = best ? Number(best[key]) : 0;
    return count > 0 ? [{ key, label, name: best.display_name || best.login_id, count }] : [];
  });
}

export type Period = "week" | "month" | "all";

export const periodLabels: Record<Period, string> = { week: "이번 주", month: "이번 달", all: "전체" };

// 기간 시작 시각 (한국 시간 기준). week = 이번 주 월요일 0시, month = 이달 1일 0시
export function periodStart(period: Period, now = new Date()): string | null {
  if (period === "all") return null;
  const seoul = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const y = seoul.getFullYear();
  const m = seoul.getMonth();
  const d = seoul.getDate();
  if (period === "month") return new Date(`${y}-${String(m + 1).padStart(2, "0")}-01T00:00:00+09:00`).toISOString();
  const weekday = (seoul.getDay() + 6) % 7; // 월요일 = 0
  const monday = new Date(Date.UTC(y, m, d - weekday));
  return new Date(`${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, "0")}-${String(monday.getUTCDate()).padStart(2, "0")}T00:00:00+09:00`).toISOString();
}

export function emptyCounts(user: { id: string; display_name: string; login_id: string; role: "owner" | "staff"; active: boolean }): ActivityCounts {
  return { user_id: user.id, display_name: user.display_name, login_id: user.login_id, role: user.role, active: user.active, checks: 0, signoffs: 0, practiced_recipes: 0, confirmed_recipes: 0, docs_read: 0, docs_confirmed: 0, exam_items: 0, quiz_passed: 0, exam_written: 0, acks: 0, reads: 0 };
}
