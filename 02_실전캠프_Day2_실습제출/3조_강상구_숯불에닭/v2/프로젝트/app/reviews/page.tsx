"use client";

import { useMemo, useState } from "react";
import { ExportStatusLine } from "@/components/ExportUploadCard";
import { SourceTag } from "@/components/SourceTag";
import { ReplyEditor } from "@/components/ReplyEditor";
import { MarketingIdeasCard, MonthlyReportCard } from "@/components/ReviewMonthlyCards";
import { useExport } from "@/components/useExport";
import { Notice } from "@/components/ui";
import type { ExportReview } from "@/lib/export/types";
import { PLATFORM_NAME, dayOf, replyDaysLeft, reviewStats, type FirstKind, type PeriodStats } from "@/lib/reviews/stats";
import { todayStr } from "@/lib/daily";
import { num, pctText } from "@/lib/format";

const WD = ["월", "화", "수", "목", "금", "토", "일"];
const KIND_TONE: Record<FirstKind, string> = { complaint: "bg-red-50 text-red-900 ring-red-200", question: "bg-amber-50 text-amber-900 ring-amber-200", old: "bg-stone-50 text-stone-800 ring-stone-200", draft: "bg-emerald-50 text-emerald-900 ring-emerald-200" };
const PLATFORM_BADGE: Record<string, string> = { naver: "bg-emerald-100 text-emerald-800", baemin: "bg-sky-100 text-sky-800", coupang: "bg-orange-100 text-orange-800" };

// 리뷰 탭 — 카페스이 리뷰 모음소 대시보드 틀. 자료는 리뷰 수집기 내보내기 파일에서 온다. 답글 등록은 사장님이 플랫폼에서 직접.
export default function ReviewsPage() {
  const exp = useExport();
  const today = todayStr();
  const stats = useMemo(() => (exp.reviews.length ? reviewStats(exp.reviews, today) : null), [exp.reviews, today]);
  const [open, setOpen] = useState<FirstKind | null>(null);
  const [listPlatform, setListPlatform] = useState<string>("all");

  if (!exp.loaded) return <p className="py-10 text-center text-sm text-stone-500">불러오는 중…</p>;

  return (
    <>
      <ExportStatusLine exp={exp} need="리뷰 탭" />

      {!stats ? (
        <Notice tone="info">아직 리뷰 자료가 없어요. 올리기 탭에서 리뷰 수집기 파일을 올리면 이번 주 리뷰 · 먼저 답할 리뷰 · 플랫폼별 답변률 · 한달 분석 · 마케팅 자료가 보여요.</Notice>
      ) : (
        <>
          {/* 이번 주 vs 지난주 */}
          <section className="card space-y-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-bold">
                이번 주 vs 지난주
                <SourceTag from="카페스이" />
              </h2>
              <span className="num text-xs text-stone-500">
                {stats.thisWeek.from.slice(5)} ~ {stats.thisWeek.to.slice(5)} · 전체 {num(stats.total)}건
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <WeekBox label="리뷰" now={stats.thisWeek} prev={stats.lastWeek} pick={(p) => p.count} unit="건" />
              <WeekBox label="미답변" now={stats.thisWeek} prev={stats.lastWeek} pick={(p) => p.unanswered} unit="건" lowerIsBetter />
              <WeekBox label="평균 별점" now={stats.thisWeek} prev={stats.lastWeek} pick={(p) => p.avgRating} unit="점" decimals />
              <WeekBox label="아쉬운 리뷰" now={stats.thisWeek} prev={stats.lastWeek} pick={(p) => p.complaints} unit="건" lowerIsBetter />
            </div>
          </section>

          {/* 오늘 먼저 볼 것 */}
          <section className="card space-y-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-bold">
                오늘 먼저 볼 것
                <SourceTag from="카페스이" />
              </h2>
              <span className="text-xs text-stone-500">답글을 달 수 있는 리뷰만</span>
            </div>
            {stats.first.length === 0 ? (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">먼저 볼 리뷰가 없어요. 다 답했어요 👍</p>
            ) : (
              <ul className="space-y-1.5">
                {stats.first.map((f) => (
                  <li key={f.kind} className={`rounded-xl px-3 py-2 ring-1 ${KIND_TONE[f.kind]}`}>
                    <button className="flex w-full items-center justify-between text-left text-sm font-semibold" onClick={() => setOpen(open === f.kind ? null : f.kind)}>
                      <span>{f.title}</span>
                      <span className="num">{f.reviews.length}건 {open === f.kind ? "▴" : "▾"}</span>
                    </button>
                    {open === f.kind && (
                      <ul className="mt-2 space-y-2">
                        {f.reviews.slice(0, 10).map((r) => (
                          <ReviewRow key={`${r.platform}-${r.id}`} r={r} today={today} />
                        ))}
                        {f.reviews.length > 10 && <li className="text-xs text-stone-500">… 그 밖에 {f.reviews.length - 10}건은 아래 미답변 목록에서</li>}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 플랫폼별 */}
          <section className="card space-y-2">
            <h2 className="text-base font-bold">플랫폼별 답변률 · 답글까지 걸린 시간</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] text-sm">
                <thead className="text-left text-xs text-stone-500">
                  <tr>
                    <th className="py-1">플랫폼</th>
                    <th className="text-right">리뷰</th>
                    <th className="text-right">답글</th>
                    <th className="text-right">미답변</th>
                    <th className="text-right">답변률</th>
                    <th className="text-right">평균 별점</th>
                    <th className="text-right">답글까지</th>
                  </tr>
                </thead>
                <tbody className="num divide-y divide-stone-100">
                  {stats.platforms.map((p) => (
                    <tr key={p.platform}>
                      <td className="py-1.5 font-semibold">{p.name}</td>
                      <td className="text-right">{num(p.total)}</td>
                      <td className="text-right">{num(p.answered)}</td>
                      <td className="text-right">
                        {num(p.unanswered)}
                        {p.unansweredOpen !== p.unanswered && <span className="ml-1 text-xs text-stone-400">(달 수 있는 {p.unansweredOpen})</span>}
                      </td>
                      <td className={`text-right font-bold ${(p.answerRate ?? 0) < 80 ? "text-red-700" : ""}`}>{pctText(p.answerRate)}</td>
                      <td className="text-right">{p.avgRating === null ? "–" : p.avgRating.toFixed(2)}</td>
                      <td className="text-right">{p.medianReplyHours === null ? "–" : hoursText(p.medianReplyHours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-stone-500">답글까지는 답한 리뷰들의 중앙값이에요. 배민·쿠팡이츠는 30일이 지나면 답글을 달 수 없어서 "달 수 있는" 수를 따로 적었어요.</p>
          </section>

          {/* 별점 · 요일 */}
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="card space-y-2">
              <h2 className="text-base font-bold">별점 분포</h2>
              <Bars rows={[...stats.ratingDist].reverse().map((d) => ({ label: `${"★".repeat(d.rating)}`, value: d.count }))} />
              {stats.noRating > 0 && <p className="text-xs text-stone-500">별점 없이 글만 남긴 리뷰 {num(stats.noRating)}건 (네이버)</p>}
            </div>
            <div className="card space-y-2">
              <h2 className="text-base font-bold">요일별 리뷰</h2>
              <Bars rows={stats.weekday.map((v, i) => ({ label: WD[i], value: v }))} />
              <p className="text-xs text-stone-500">리뷰를 쓴 요일 기준 · 전체 기간</p>
            </div>
          </section>

          {/* 달마다 */}
          <section className="card space-y-2">
            <h2 className="text-base font-bold">달마다 들어온 리뷰 <span className="text-xs font-normal text-stone-500">최근 12개월</span></h2>
            <Bars rows={stats.monthly.map((m) => ({ label: `${Number(m.month.slice(5))}월`, value: m.count, sub: m.avgRating === null ? "" : `★${m.avgRating.toFixed(1)}` }))} horizontal={false} />
          </section>

          {/* 한달 분석 · 마케팅 자료 (카페스이 틀) */}
          <MonthlyReportCard reviews={exp.reviews} today={today} />
          <MarketingIdeasCard reviews={exp.reviews} today={today} />

          {/* 주제 */}
          {stats.topics.length > 0 && (
            <section className="card space-y-2">
              <h2 className="text-base font-bold">손님이 무엇을 말하나 <span className="text-xs font-normal text-stone-500">수집기가 붙인 주제 꼬리표</span></h2>
              <ul className="flex flex-wrap gap-1.5">
                {stats.topics.map((t) => (
                  <li key={t.topic} className="rounded-full bg-stone-100 px-3 py-1 text-xs">
                    <b>{t.topic}</b> <span className="num text-stone-500">{t.count}</span>
                    {t.negative > 0 && <span className="num ml-1 text-red-700">아쉬움 {t.negative}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 미답변 목록 */}
          <section className="card space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-bold">미답변 리뷰 <span className="num text-xs font-normal text-stone-500">{stats.unansweredList.length}건 · 최근 것부터</span></h2>
              <div className="flex gap-1">
                {["all", "naver", "baemin", "coupang"].map((p) => (
                  <button key={p} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${listPlatform === p ? "bg-orange-600 text-white" : "bg-stone-100 text-stone-600"}`} onClick={() => setListPlatform(p)}>
                    {p === "all" ? "전체" : PLATFORM_NAME[p as keyof typeof PLATFORM_NAME]}
                  </button>
                ))}
              </div>
            </div>
            <ul className="space-y-2">
              {stats.unansweredList
                .filter((r) => listPlatform === "all" || r.platform === listPlatform)
                .slice(0, 30)
                .map((r) => (
                  <ReviewRow key={`${r.platform}-${r.id}`} r={r} today={today} />
                ))}
            </ul>
            <p className="text-xs text-stone-500">초안을 고쳐 “확정”하면 “답글칸 채우기”로 도우미가 플랫폼 답글칸까지 넣어 줘요. 등록 버튼은 사장님이 직접 누릅니다.</p>
          </section>
        </>
      )}
    </>
  );
}

function hoursText(h: number) {
  if (h < 48) return `${Math.round(h)}시간`;
  return `${Math.round(h / 24)}일`;
}

function WeekBox({ label, now, prev, pick, unit, lowerIsBetter, decimals }: { label: string; now: PeriodStats; prev: PeriodStats; pick: (p: PeriodStats) => number | null; unit: string; lowerIsBetter?: boolean; decimals?: boolean }) {
  const a = pick(now);
  const b = pick(prev);
  const show = (v: number | null) => (v === null ? "–" : decimals ? v.toFixed(1) : num(v));
  const diff = a !== null && b !== null ? a - b : null;
  const good = diff === null || diff === 0 ? null : lowerIsBetter ? diff < 0 : diff > 0;
  return (
    <div className="rounded-xl bg-stone-50 px-3 py-2">
      <p className="text-xs font-semibold text-stone-500">{label}</p>
      <p className="num mt-0.5 text-lg font-bold">
        {show(a)}
        <span className="ml-0.5 text-xs font-normal text-stone-500">{unit}</span>
      </p>
      <p className={`num text-[11px] ${good === null ? "text-stone-400" : good ? "text-emerald-700" : "text-red-700"}`}>
        지난주 {show(b)}
        {diff !== null && diff !== 0 && ` (${diff > 0 ? "+" : ""}${decimals ? diff.toFixed(1) : num(diff)})`}
      </p>
    </div>
  );
}

function Bars({ rows, horizontal = true }: { rows: { label: string; value: number; sub?: string }[]; horizontal?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!horizontal)
    return (
      <div className="flex h-28 items-end gap-1">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-0.5">
            <span className="num text-[10px] text-stone-500">{r.value || ""}</span>
            <div className="w-full rounded-t bg-orange-400" style={{ height: `${Math.max(2, (r.value / max) * 70)}px` }} title={`${r.label} ${r.value}건 ${r.sub ?? ""}`} />
            <span className="text-[10px] text-stone-500">{r.label}</span>
          </div>
        ))}
      </div>
    );
  return (
    <ul className="space-y-1">
      {rows.map((r, i) => (
        <li key={i} className="flex items-center gap-2 text-xs">
          <span className="w-12 shrink-0 text-stone-600">{r.label}</span>
          <span className="h-3 flex-1 rounded bg-stone-100">
            <span className="block h-3 rounded bg-orange-400" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="num w-8 text-right text-stone-600">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

function ReviewRow({ r, today }: { r: ExportReview; today: string }) {
  const left = replyDaysLeft(r, today);
  const isUnansweredRow = !r.reply; // 초안이 없어도 미답변이면 직접 쓸 수 있게
  return (
    <li className="rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-stone-200">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className={`rounded px-1.5 py-0.5 font-bold ${PLATFORM_BADGE[r.platform]}`}>{PLATFORM_NAME[r.platform]}</span>
        <span className="font-semibold">{r.author}</span>
        {r.rating !== null && <span className="text-amber-600">{"★".repeat(Math.round(r.rating))}</span>}
        <span className="num text-stone-400">{dayOf(r.date)}</span>
        {r.menu && <span className="truncate text-stone-500">· {r.menu}</span>}
        {left !== null && left >= 0 && <span className={`num ml-auto rounded px-1.5 py-0.5 ${left <= 5 ? "bg-red-50 text-red-700" : "bg-stone-100 text-stone-600"}`}>답글 {left}일 남음</span>}
      </div>
      <p className="mt-1 whitespace-pre-wrap text-stone-800">{r.content}</p>
      {/* 답글 쓰기·확정·답글칸 채우기 — 등록은 사장님이 플랫폼에서 */}
      {(r.draft || isUnansweredRow) && <ReplyEditor key={`${r.platform}-${r.id}-${r.draft?.status ?? ""}`} review={r} />}
    </li>
  );
}
