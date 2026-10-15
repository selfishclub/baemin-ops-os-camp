// "답글 달았어요" 표시 — 사장님이 플랫폼에서 등록을 누른 뒤 장부에 남기는 표시.
// 수집기가 다음에 그 리뷰를 다시 읽어 올 때까지는 내보내기 파일에 답글이 없으니, 그동안 미답변에서 빼 두는 용도다.
// 수집기가 진짜 답글을 가져오면 그 값이 우선이고, 이 표시는 더 이상 쓰이지 않는다.
import type { ExportReview } from "../export/types";

export const REPLY_MARKS_KEY = "review_reply_marks_v1";

export interface ReplyMark {
  platform: string;
  id: string;
  at: string; // ISO — 표시한 때
  text: string; // 그때 올린 답글 (장부에서 보여 주기용)
}

export const markKey = (platform: string, id: string) => `${platform}:${id}`;

/** 내보내기 리뷰에 표시를 입힌다 — 표시가 있고 아직 답글이 없으면 답한 것으로 본다 */
export function applyMarks(reviews: ExportReview[], marks: ReplyMark[]): ExportReview[] {
  if (!marks.length) return reviews;
  const m = new Map(marks.map((x) => [markKey(x.platform, x.id), x]));
  return reviews.map((r) => {
    if (r.reply) return r;
    const k = m.get(markKey(r.platform, r.id));
    return k ? { ...r, reply: k.text || "(장부에서 답글 달았다고 표시함)", replyDate: k.at, draft: r.draft ? { ...r.draft, status: "posted" } : r.draft } : r;
  });
}

/** 수집기가 진짜 답글을 가져온 리뷰의 표시는 지워도 된다 (쌓이지 않게) */
export function pruneMarks(reviews: ExportReview[], marks: ReplyMark[]): ReplyMark[] {
  const replied = new Set(reviews.filter((r) => r.reply && r.replyDate && !(r.reply ?? "").startsWith("(장부에서")).map((r) => markKey(r.platform, r.id)));
  return marks.filter((x) => !replied.has(markKey(x.platform, x.id)));
}
