// 리뷰 탭 계산 — 카페스이 리뷰 모음소 대시보드 틀(이번 주 vs 지난주 · 오늘 먼저 볼 것 · 플랫폼별 답변률 ·
// 답글까지 걸린 시간 · 별점 분포 · 요일별)을 우리 리뷰 수집기 자료로 낸다. 화면은 계산하지 않고 여기 결과만 보여 준다.
import type { ExportReview, ReviewPlatform } from "../export/types";
import { todayStr } from "../daily";

export const PLATFORM_NAME: Record<ReviewPlatform, string> = { naver: "네이버", baemin: "배민", coupang: "쿠팡이츠" };

// 답글을 달 수 있는 기간 (어드민에서 확인한 값). 지나면 "오늘 먼저 볼 것"에서 뺀다 — 달 수 없는 리뷰를 재촉하지 않기 위해
export const REPLY_WINDOW_DAYS: Partial<Record<ReviewPlatform, number>> = { baemin: 30, coupang: 30 };

export const dayOf = (iso: string | null): string | null => (iso && iso.length >= 10 ? iso.slice(0, 10) : null);
const MS_DAY = 86_400_000;
const daysBetween = (a: string, b: string) => Math.floor((Date.parse(b) - Date.parse(a)) / MS_DAY);

/** 월요일 시작 주의 첫날 */
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const wd = (d.getUTCDay() + 6) % 7; // 0=월
  d.setUTCDate(d.getUTCDate() - wd);
  return d.toISOString().slice(0, 10);
}
export const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * MS_DAY).toISOString().slice(0, 10);

/** 손님에게 보이는 리뷰만 (사장님만 보는 리뷰는 답글 대상이 아님) */
export const visible = (rs: ExportReview[]) => rs.filter((r) => !r.ownerOnly && r.date);

export const isUnanswered = (r: ExportReview) => !r.reply;
export const isComplaint = (r: ExportReview) => (r.rating !== null && r.rating <= 3) || !!r.complaintType;
export const isQuestion = (r: ExportReview) => /\?|문의|가능한가요|되나요|있나요|주나요|할 수 있/.test(r.content);

export function replyDaysLeft(r: ExportReview, today: string): number | null {
  const w = REPLY_WINDOW_DAYS[r.platform];
  const d = dayOf(r.date);
  if (!w || !d) return null;
  return w - daysBetween(d, today);
}

/** 기간 만료와 답변 완료를 구분한다. 날짜가 없으면 작성 불가로 단정하지 않는다. */
export function isReplyUnavailable(r: ExportReview, today: string): boolean {
  return !r.ownerOnly && isUnanswered(r) && (replyDaysLeft(r, today) ?? 0) < 0;
}
export function canReply(r: ExportReview, today: string): boolean {
  return !r.ownerOnly && isUnanswered(r) && !isReplyUnavailable(r, today);
}

export interface PeriodStats {
  from: string;
  to: string;
  count: number;
  unanswered: number;
  avgRating: number | null; // 별점 준 리뷰만
  complaints: number;
}

function periodStats(rs: ExportReview[], from: string, to: string): PeriodStats {
  const inRange = rs.filter((r) => { const d = dayOf(r.date)!; return d >= from && d <= to; });
  const rated = inRange.filter((r) => r.rating !== null);
  return {
    from,
    to,
    count: inRange.length,
    unanswered: inRange.filter(isUnanswered).length,
    avgRating: rated.length ? Math.round((rated.reduce((a, r) => a + r.rating!, 0) / rated.length) * 100) / 100 : null,
    complaints: inRange.filter(isComplaint).length,
  };
}

export type FirstKind = "complaint" | "question" | "old" | "draft";

export interface FirstItem {
  kind: FirstKind;
  title: string;
  reviews: ExportReview[];
}

export interface PlatformStats {
  platform: ReviewPlatform;
  name: string;
  total: number;
  answered: number;
  unanswered: number;
  answerRate: number | null; // %
  avgRating: number | null;
  medianReplyHours: number | null; // 답글까지 걸린 시간 (중앙값)
  unansweredOpen: number; // 아직 달 수 있는 미답변
  replyUnavailable: number; // 기간이 지나 더는 답글을 달 수 없는 리뷰
}

export interface ReviewStats {
  today: string;
  total: number;
  thisWeek: PeriodStats;
  lastWeek: PeriodStats;
  first: FirstItem[];
  platforms: PlatformStats[];
  ratingDist: { rating: number; count: number }[]; // 1~5
  noRating: number;
  weekday: number[]; // 월~일 7칸, 전체 기간
  monthly: { month: string; count: number; unanswered: number; avgRating: number | null }[]; // 최근 12개월
  topics: { topic: string; count: number; positive: number; negative: number }[]; // 많이 나온 순
  unansweredList: ExportReview[]; // 최근 것부터, 달 수 있는 것만
  unavailableList: ExportReview[]; // 기간 만료: 할 일에서 빼고 보관
}

export function reviewStats(all: ExportReview[], today: string): ReviewStats {
  const rs = visible(all);
  const ws = weekStart(today);
  const thisWeek = periodStats(rs, ws, today);
  const lastWeek = periodStats(rs, shift(ws, -7), shift(ws, -1));

  const open = (r: ExportReview) => canReply(r, today);
  const unavailableList = rs.filter((r) => isReplyUnavailable(r, today)).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const unansweredOpen = rs.filter(open).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const first: FirstItem[] = [];
  const complaints = unansweredOpen.filter(isComplaint);
  if (complaints.length) first.push({ kind: "complaint", title: "아쉬움을 남긴 리뷰에 아직 답이 없어요", reviews: complaints });
  const questions = unansweredOpen.filter((r) => !isComplaint(r) && isQuestion(r));
  if (questions.length) first.push({ kind: "question", title: "손님이 물어봤는데 아직 답이 안 나갔어요", reviews: questions });
  const old = unansweredOpen.filter((r) => !isComplaint(r) && !isQuestion(r) && daysBetween(dayOf(r.date)!, today) >= 14);
  if (old.length) first.push({ kind: "old", title: "2주 넘게 답글이 안 나간 리뷰가 있어요", reviews: old });
  const drafted = unansweredOpen.filter((r) => r.draft && !r.draft.needsOwnerInput);
  if (drafted.length) first.push({ kind: "draft", title: "초안이 준비된 리뷰 — 복사해서 올리면 끝", reviews: drafted });

  const platforms = (["naver", "baemin", "coupang"] as ReviewPlatform[])
    .map((p) => {
      const mine = rs.filter((r) => r.platform === p);
      const answered = mine.filter((r) => !isUnanswered(r));
      const rated = mine.filter((r) => r.rating !== null);
      const hours = answered
        .filter((r) => r.replyDate && r.date)
        .map((r) => (Date.parse(r.replyDate!) - Date.parse(r.date!)) / 3_600_000)
        .filter((h) => Number.isFinite(h) && h >= 0)
        .sort((a, b) => a - b);
      return {
        platform: p,
        name: PLATFORM_NAME[p],
        total: mine.length,
        answered: answered.length,
        unanswered: mine.filter(open).length,
        replyUnavailable: mine.filter((r) => isReplyUnavailable(r, today)).length,
        answerRate: mine.length ? Math.round((answered.length / mine.length) * 1000) / 10 : null,
        avgRating: rated.length ? Math.round((rated.reduce((a, r) => a + r.rating!, 0) / rated.length) * 100) / 100 : null,
        medianReplyHours: hours.length ? Math.round(hours[Math.floor(hours.length / 2)] * 10) / 10 : null,
        unansweredOpen: mine.filter(open).length,
      };
    })
    .filter((p) => p.total > 0);

  const ratingDist = [1, 2, 3, 4, 5].map((rating) => ({ rating, count: rs.filter((r) => r.rating !== null && Math.round(r.rating) === rating).length }));
  const weekday = [0, 0, 0, 0, 0, 0, 0];
  for (const r of rs) weekday[(new Date(`${dayOf(r.date)}T00:00:00Z`).getUTCDay() + 6) % 7]++;

  const monthly: ReviewStats["monthly"] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - i);
    const month = d.toISOString().slice(0, 7);
    const inM = rs.filter((r) => dayOf(r.date)!.startsWith(month));
    const rated = inM.filter((r) => r.rating !== null);
    monthly.push({ month, count: inM.length, unanswered: inM.filter(isUnanswered).length, avgRating: rated.length ? Math.round((rated.reduce((a, r) => a + r.rating!, 0) / rated.length) * 100) / 100 : null });
  }

  const topicMap = new Map<string, { count: number; positive: number; negative: number }>();
  for (const r of rs) {
    for (const t of r.topics) {
      const m = topicMap.get(t) ?? { count: 0, positive: 0, negative: 0 };
      m.count++;
      if (r.rating !== null && r.rating >= 4) m.positive++;
      if (isComplaint(r)) m.negative++;
      topicMap.set(t, m);
    }
  }
  const topics = [...topicMap].map(([topic, m]) => ({ topic, ...m })).sort((a, b) => b.count - a.count).slice(0, 12);

  return { today, total: rs.length, thisWeek, lastWeek, first, platforms, ratingDist, noRating: rs.filter((r) => r.rating === null).length, weekday, monthly, topics, unansweredList: unansweredOpen, unavailableList };
}

/** 손익 첫 화면용 — 이 달 리뷰 수·미답변·평균 별점 */
export function monthReviewSummary(all: ExportReview[], month: string, today = todayStr()) {
  const rs = visible(all).filter((r) => dayOf(r.date)!.startsWith(month));
  const rated = rs.filter((r) => r.rating !== null);
  return { count: rs.length, unanswered: rs.filter((r) => canReply(r, today)).length, replyUnavailable: rs.filter((r) => isReplyUnavailable(r, today)).length, complaints: rs.filter(isComplaint).length, avgRating: rated.length ? Math.round((rated.reduce((a, r) => a + r.rating!, 0) / rated.length) * 100) / 100 : null };
}
