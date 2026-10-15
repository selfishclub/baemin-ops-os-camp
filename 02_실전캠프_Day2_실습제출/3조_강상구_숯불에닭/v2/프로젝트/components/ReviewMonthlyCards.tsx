"use client";

import { useMemo, useState } from "react";
import type { ExportReview } from "@/lib/export/types";
import { marketingIdeas, meetingText, monthlyReport, prevMonthOf, type Channel } from "@/lib/reviews/monthly";
import { PLATFORM_NAME, dayOf } from "@/lib/reviews/stats";
import { num, pctText } from "@/lib/format";

const CH_TONE: Record<Channel, string> = { 캐러셀: "bg-orange-100 text-orange-800", 릴스: "bg-violet-100 text-violet-800", "플레이스 소식": "bg-emerald-100 text-emerald-800" };
const CH_ICON: Record<Channel, string> = { 캐러셀: "▦", 릴스: "▶", "플레이스 소식": "N" };

function useCopy() {
  const [done, setDone] = useState<string | null>(null);
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(key);
      setTimeout(() => setDone(null), 1500);
    } catch {}
  };
  return { done, copy };
}

// 한달 분석 — 카페스이 리뷰 모음소의 "한달 분석" 틀. 달을 고르면 한 줄 요약 · 칭찬 · 아쉬움·질문 · 메뉴 · 손님 문장 10 · 회의 자료 복사.
export function MonthlyReportCard({ reviews, today }: { reviews: ExportReview[]; today: string }) {
  const months = useMemo(() => {
    const set = new Set(reviews.map((r) => dayOf(r.date)?.slice(0, 7)).filter((m): m is string => !!m));
    return [...set].sort().reverse().slice(0, 12);
  }, [reviews]);
  const [month, setMonth] = useState<string>(() => (months.includes(prevMonthOf(today.slice(0, 7))) ? prevMonthOf(today.slice(0, 7)) : months[0] ?? today.slice(0, 7)));
  const m = useMemo(() => monthlyReport(reviews, month), [reviews, month]);
  const { done, copy } = useCopy();
  const label = (ym: string) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5))}월`;

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">한달 분석 — 손님 리포트</h2>
        <div className="flex items-center gap-2">
          <select className="field w-auto py-1 text-xs" value={month} onChange={(e) => setMonth(e.target.value)}>
            {(months.length ? months : [month]).map((ym) => (
              <option key={ym} value={ym}>
                {label(ym)}
              </option>
            ))}
          </select>
          <button className="rounded bg-stone-800 px-2.5 py-1 text-xs font-bold text-white" onClick={() => copy("meeting", meetingText(m))}>
            {done === "meeting" ? "복사됨" : "회의 자료 복사"}
          </button>
        </div>
      </div>

      <p className="rounded-xl bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-900">{m.oneLine}</p>

      {m.count > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <Box label="리뷰" value={`${num(m.count)}건`} sub={`지난달 ${num(m.prevCount)}`} />
            <Box label="평균 별점" value={m.avgRating === null ? "–" : `★ ${m.avgRating.toFixed(1)}`} sub={m.prevAvgRating === null ? "" : `지난달 ${m.prevAvgRating.toFixed(1)}`} />
            <Box label="답변률" value={pctText(m.answerRate)} sub={m.byPlatform.map((p) => `${p.name} ${p.count}`).join(" · ")} />
            <Box label="아쉬움 · 질문" value={`${m.complaints} · ${m.questions}`} sub="건" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-sm font-bold">손님이 칭찬한 것</p>
              {m.praise.length === 0 ? (
                <p className="text-xs text-stone-500">주제 꼬리표가 없어요</p>
              ) : (
                <ul className="mt-1 space-y-1.5">
                  {m.praise.slice(0, 5).map((p) => (
                    <li key={p.topic} className="rounded-lg bg-stone-50 px-2 py-1.5 text-sm">
                      <b>{p.topic}</b> <span className="num text-xs text-stone-500">{p.count}명</span>
                      {p.examples[0] && <p className="mt-0.5 text-xs text-stone-600">“{p.examples[0]}”</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-sm font-bold">아쉬움 · 질문</p>
              {m.regrets.length === 0 && m.questionList.length === 0 ? (
                <p className="text-xs text-emerald-700">이 달은 아쉬운 리뷰도 질문도 없었어요 👍</p>
              ) : (
                <ul className="mt-1 space-y-1.5">
                  {m.regrets.map((p) => (
                    <li key={p.topic} className="rounded-lg bg-red-50 px-2 py-1.5 text-sm text-red-900">
                      <b>{p.topic}</b> <span className="num text-xs">{p.count}건</span>
                      {p.examples[0] && <p className="mt-0.5 text-xs">“{p.examples[0]}”</p>}
                    </li>
                  ))}
                  {m.questionList.map((q, i) => (
                    <li key={i} className="rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                      질문: “{q}”
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {m.menus.length > 0 && (
            <div>
              <p className="text-sm font-bold">리뷰에 적힌 메뉴</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {m.menus.map((x) => (
                  <li key={x.menu} className="rounded-full bg-stone-100 px-3 py-1 text-xs">
                    <b>{x.menu}</b> <span className="num text-stone-500">{x.count}</span>
                    {x.avgRating !== null && <span className="num ml-1 text-amber-600">★{x.avgRating.toFixed(1)}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {m.sellingPoints.length > 0 && (
            <div className="rounded-xl bg-stone-50 px-3 py-2">
              <p className="text-sm font-bold">마케팅 소구점 — 무엇을 말할지</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-stone-700">
                {m.sellingPoints.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
          )}

          {m.sentences.length > 0 && (
            <div>
              <p className="text-sm font-bold">
                이달의 손님 문장 <span className="num text-xs font-normal text-stone-500">{m.sentences.length}</span>
              </p>
              <ul className="mt-1 space-y-1">
                {m.sentences.map((s) => (
                  <li key={`${s.platform}-${s.id}`} className="flex items-start gap-2 text-sm">
                    <span className="shrink-0 text-xs text-stone-400">{PLATFORM_NAME[s.platform]}</span>
                    <span className="min-w-0 flex-1">“{s.content.replace(/\s+/g, " ").trim()}”</span>
                    <button className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-bold text-stone-600" onClick={() => copy(s.id, s.content)}>
                      {done === s.id ? "복사됨" : "복사"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      <p className="text-xs text-stone-500">카페스이 리뷰 모음소의 한달 분석 틀이에요. 회의 자료를 복사해 붙이고, 할 일과 담당만 정하세요.</p>
    </section>
  );
}

// 마케팅 자료 — 리뷰 속 손님 문장을 인스타 캐러셀 · 릴스 · 플레이스 소식 주제로. 훅 카피는 AI에게 부탁하는 문장을 복사해서 사장님이 직접 붙인다.
export function MarketingIdeasCard({ reviews, today }: { reviews: ExportReview[]; today: string }) {
  const month = today.slice(0, 7);
  const ideas = useMemo(() => {
    const now = marketingIdeas(reviews, month);
    return now.length >= 3 ? now : [...now, ...marketingIdeas(reviews, prevMonthOf(month), 6 - now.length).filter((i) => !now.some((n) => n.review.id === i.review.id))];
  }, [reviews, month]);
  const { done, copy } = useCopy();

  return (
    <section className="card space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">마케팅 자료 — 손님 문장으로 게시물 주제</h2>
        <span className="text-xs text-stone-500">최근 리뷰에서 · 어디에 올릴지</span>
      </div>
      {ideas.length === 0 ? (
        <p className="text-sm text-stone-500">별점 4 이상 리뷰 문장이 모이면 여기에 게시물 주제가 떠요.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {ideas.map((i) => (
            <li key={`${i.review.platform}-${i.review.id}`} className="rounded-xl bg-stone-50 px-3 py-2">
              <p className="flex items-center justify-between gap-2 text-xs">
                <b className="text-stone-700">{i.theme}</b>
                <span className={`rounded px-1.5 py-0.5 font-bold ${CH_TONE[i.channel]}`}>
                  {CH_ICON[i.channel]} {i.channel}
                </span>
              </p>
              <p className="mt-1 text-sm">“{i.sentence}”</p>
              <p className="mt-0.5 text-[11px] text-stone-500">
                {PLATFORM_NAME[i.review.platform]} · {dayOf(i.review.date)}
                {i.review.menu ? ` · ${i.review.menu}` : ""} — {i.why}
              </p>
              <button className="mt-1.5 rounded bg-stone-800 px-2 py-0.5 text-[11px] font-bold text-white" onClick={() => copy(i.review.id, i.hookPrompt)}>
                {done === i.review.id ? "복사됨" : "훅 카피 부탁 문장 복사"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-stone-500">복사한 문장을 Claude에 붙이면 훅 카피 5개가 나와요. AI가 지어낸 말이 아니라 손님이 실제로 한 말에서 시작해요.</p>
    </section>
  );
}

function Box({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-stone-50 px-2 py-2">
      <p className="text-xs font-semibold text-stone-500">{label}</p>
      <p className="num mt-0.5 text-sm font-bold text-stone-900">{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-stone-400">{sub}</p>
    </div>
  );
}
