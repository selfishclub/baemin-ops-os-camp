"use client";

import { useMemo, useState } from "react";
import { CONTENT_KIND_LABEL, CONTENT_KINDS, type Carousel, type ContentKind, type ContentRow, type News, type Reels, type Review } from "@/lib/types";
import { ReviewCard } from "./ReviewCard";
import { CopyButton } from "./ui";

export function ContentStudio({ review: initialReview, initialContents, aiReady }: { review: Review; initialContents: ContentRow[]; aiReady: boolean }) {
  const [review, setReview] = useState(initialReview);
  const [contents, setContents] = useState(initialContents);
  const [tab, setTab] = useState<ContentKind>("carousel");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [batchIdx, setBatchIdx] = useState(0);

  // 같은 시각(created_at)에 저장된 3종을 한 묶음으로
  const batches = useMemo(() => {
    const map = new Map<string, ContentRow[]>();
    for (const c of contents) {
      const arr = map.get(c.created_at) || [];
      arr.push(c);
      map.set(c.created_at, arr);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([created_at, rows]) => ({ created_at, rows }));
  }, [contents]);

  const batch = batches[batchIdx];
  const current = batch?.rows.find((r) => r.kind === tab) || null;

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/reviews/${review.id}/generate`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message);
      setContents((prev) => [...data.contents, ...prev]);
      setBatchIdx(0);
      setReview((r) => ({ ...r, content_count: r.content_count + 1 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleBookmark(r: Review, next: boolean) {
    setReview({ ...r, bookmarked: next });
    await fetch(`/api/reviews/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookmarked: next }) });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
      <div className="flex flex-col gap-3">
        <ReviewCard review={review} onBookmark={toggleBookmark} />
        <div className="card p-4">
          <button type="button" className="btn btn-primary w-full justify-center" disabled={busy || !aiReady || !review.review_text.trim()} onClick={generate}>
            {busy ? "AI가 3가지 콘텐츠를 만드는 중… (30초~1분)" : contents.length ? "다시 생성하기" : "이 리뷰로 콘텐츠 3종 만들기"}
          </button>
          {!aiReady ? <p className="mt-2 text-xs text-red-700">AI 키가 연결되지 않았습니다. 설정 화면의 &quot;AI 연결 상태&quot; 안내를 따라주세요.</p> : null}
          {!review.review_text.trim() ? <p className="mt-2 text-xs text-[var(--muted)]">본문이 없는 리뷰(별점만)는 콘텐츠를 만들 수 없어요.</p> : null}
          {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
          <p className="mt-2 text-xs text-[var(--muted)]">인스타 캐러셀(3~5장) · 릴스/쇼츠 대본 · 네이버/당근 새소식 문구가 한 번에 만들어집니다.</p>
        </div>
        {batches.length > 1 ? (
          <div className="card p-3 text-sm">
            <label className="label">생성 기록</label>
            <select className="select" value={batchIdx} onChange={(e) => setBatchIdx(Number(e.target.value))}>
              {batches.map((b, i) => (
                <option key={b.created_at} value={i}>
                  {i === 0 ? "최신 · " : ""}{b.created_at.slice(0, 16).replace("T", " ")} ({b.rows[0]?.model})
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex gap-1">
          {CONTENT_KINDS.map((k) => (
            <button key={k} type="button" className={`chip ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
              {CONTENT_KIND_LABEL[k]}
            </button>
          ))}
        </div>

        {!current ? (
          <div className="card p-10 text-center text-sm text-[var(--muted)]">
            {busy ? "만드는 중입니다…" : "아직 만든 콘텐츠가 없어요. 왼쪽 버튼을 눌러보세요."}
          </div>
        ) : current.kind === "carousel" ? (
          <CarouselView data={current.payload as Carousel} quote={current.key_quote} />
        ) : current.kind === "reels" ? (
          <ReelsView data={current.payload as Reels} />
        ) : (
          <NewsView data={current.payload as News} />
        )}
      </div>
    </div>
  );
}

/* ---------- 캐러셀 ---------- */

function carouselText(d: Carousel): string {
  return d.slides.map((s) => `[${s.index}] ${s.headline}${s.body ? "\n" + s.body : ""}`).join("\n\n");
}

function CarouselView({ data, quote }: { data: Carousel; quote: string }) {
  const captionAll = `${data.caption}\n\n${data.hashtags.join(" ")}`;
  return (
    <div className="flex flex-col gap-3">
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold">인스타그램 캐러셀 · {data.slides.length}장</h3>
          <span className="ml-auto flex gap-2">
            <CopyButton text={carouselText(data)} label="슬라이드 문구 복사" />
            <CopyButton text={data.slides.map((s) => `[${s.index}] ${s.image_prompt}`).join("\n")} label="이미지 프롬프트 복사" />
          </span>
        </div>
        <p className="mt-1 text-sm text-[var(--muted)]">컨셉: {data.concept}</p>
        {quote ? <p className="mt-1 text-sm">핵심 인용: “{quote}”</p> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.slides.map((s) => (
          <div key={s.index} className="card flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between text-xs text-[var(--muted)]">
              <span>슬라이드 {s.index}</span>
              <span className="tag">{s.role === "cover" ? "표지" : s.role === "closing" ? "마무리" : "본문"}</span>
            </div>
            <div className="rounded-xl bg-[#f6f5f1] p-4">
              <p className="text-lg font-extrabold leading-snug">{s.headline}</p>
              {s.body ? <p className="mt-2 text-sm leading-relaxed">{s.body}</p> : null}
            </div>
            <details className="text-xs text-[var(--muted)]">
              <summary className="cursor-pointer">이미지 프롬프트 · 디자인 메모</summary>
              <p className="mt-1 whitespace-pre-wrap font-mono">{s.image_prompt}</p>
              <p className="mt-1">{s.design_note}</p>
            </details>
          </div>
        ))}
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between">
          <h4 className="font-bold">캡션 + 해시태그</h4>
          <CopyButton text={captionAll} label="캡션 복사" />
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{data.caption}</p>
        <p className="mt-2 text-sm text-[#3b5bdb]">{data.hashtags.join(" ")}</p>
      </div>
    </div>
  );
}

/* ---------- 릴스 ---------- */

const PHASE: Record<string, string> = { opening: "오프닝", highlight: "하이라이트", closing: "클로징" };

function reelsText(d: Reels): string {
  const scenes = d.scenes.map((s) => `#${s.order} [${PHASE[s.phase] || s.phase} · ${s.duration_sec}초]\n대사: ${s.script}\n자막: ${s.subtitle}\n장면: ${s.visual}`).join("\n\n");
  return `${d.title} (${d.duration_sec}초)\n훅: ${d.hook}\n\n${scenes}\n\nBGM: ${d.bgm_style}\n분위기: ${d.mood}\nCTA: ${d.cta}`;
}

function ReelsView({ data }: { data: Reels }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold">{data.title}</h3>
          <span className="tag">{data.duration_sec}초</span>
          <span className="ml-auto"><CopyButton text={reelsText(data)} label="대본 전체 복사" /></span>
        </div>
        <p className="mt-2 text-sm"><b>훅(첫 2초):</b> {data.hook}</p>
        <p className="mt-1 text-sm text-[var(--muted)]">BGM: {data.bgm_style} · 분위기: {data.mood}</p>
      </div>
      <div className="flex flex-col gap-2">
        {data.scenes.map((s) => (
          <div key={s.order} className="card grid gap-2 p-4 md:grid-cols-[110px_1fr]">
            <div className="text-xs text-[var(--muted)]">
              <p className="font-bold text-[var(--ink)]">#{s.order} {PHASE[s.phase] || s.phase}</p>
              <p>{s.duration_sec}초</p>
            </div>
            <div className="text-sm">
              <p><b>대사</b> {s.script}</p>
              <p className="mt-1"><b>자막</b> <span className="rounded bg-[#1f1d1a] px-1.5 py-0.5 text-white">{s.subtitle}</span></p>
              <p className="mt-1 text-[var(--muted)]"><b>장면</b> {s.visual}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="card p-4 text-sm"><b>CTA</b> {data.cta}</div>
    </div>
  );
}

/* ---------- 새소식 ---------- */

function NewsView({ data }: { data: News }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[#03875f]">네이버 플레이스 새소식</h3>
          <CopyButton text={`${data.naver.title}\n\n${data.naver.body}`} />
        </div>
        <p className="mt-3 font-bold">{data.naver.title}</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{data.naver.body}</p>
        <p className="mt-2 text-xs text-[var(--muted)]">{data.naver.body.length}자</p>
      </div>
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[#ff6f0f]">당근 새소식</h3>
          <CopyButton text={`${data.daangn.title}\n\n${data.daangn.body}`} />
        </div>
        <p className="mt-3 font-bold">{data.daangn.title}</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{data.daangn.body}</p>
        <p className="mt-2 text-xs text-[var(--muted)]">{data.daangn.body.length}자</p>
      </div>
    </div>
  );
}
