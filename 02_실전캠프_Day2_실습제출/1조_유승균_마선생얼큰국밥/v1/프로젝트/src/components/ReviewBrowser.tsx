"use client";

import { useCallback, useEffect, useState } from "react";
import { CATEGORIES, PLATFORM_LABEL, PLATFORMS, SENTIMENT_LABEL, SENTIMENTS, type Review } from "@/lib/types";
import { ReviewCard } from "./ReviewCard";

const PAGE = 30;

export function ReviewBrowser({ bookmarkedOnly = false, title }: { bookmarkedOnly?: boolean; title?: string }) {
  const [platform, setPlatform] = useState("");
  const [category, setCategory] = useState("");
  const [sentiment, setSentiment] = useState("");
  const [sort, setSort] = useState<"date" | "score">("date");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (offset = 0) => {
      setLoading(true);
      setError("");
      const sp = new URLSearchParams();
      if (platform) sp.set("platform", platform);
      if (category) sp.set("category", category);
      if (sentiment) sp.set("sentiment", sentiment);
      if (q) sp.set("q", q);
      if (bookmarkedOnly) sp.set("bookmarked", "1");
      sp.set("sort", sort);
      sp.set("limit", String(PAGE));
      sp.set("offset", String(offset));
      try {
        const res = await fetch(`/api/reviews?${sp}`);
        const data = await res.json();
        if (!data.ok) throw new Error(data.message);
        setItems((prev) => (offset === 0 ? data.items : [...prev, ...data.items]));
        setTotal(data.total);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [platform, category, sentiment, q, sort, bookmarkedOnly]
  );

  useEffect(() => {
    const t = setTimeout(() => load(0), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  useEffect(() => {
    const onRefresh = () => load(0);
    window.addEventListener("reviews:refresh", onRefresh);
    return () => window.removeEventListener("reviews:refresh", onRefresh);
  }, [load]);

  async function toggleBookmark(r: Review, next: boolean) {
    setItems((prev) => prev.map((x) => (x.id === r.id ? { ...x, bookmarked: next } : x)));
    const res = await fetch(`/api/reviews/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookmarked: next }) });
    const data = await res.json();
    if (!data.ok) {
      alert(data.message || "북마크 저장 실패");
      setItems((prev) => prev.map((x) => (x.id === r.id ? { ...x, bookmarked: !next } : x)));
    } else if (bookmarkedOnly && !next) {
      setItems((prev) => prev.filter((x) => x.id !== r.id));
      setTotal((t) => t - 1);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {title ? <h2 className="mr-2 text-lg font-bold">{title}</h2> : null}
        <span className="text-sm text-[var(--muted)]">총 {total}개</span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <input className="input !w-48" placeholder="리뷰·메뉴 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select !w-auto" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="">모든 플랫폼</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>
            ))}
          </select>
          <select className="select !w-auto" value={sentiment} onChange={(e) => setSentiment(e.target.value)}>
            <option value="">모든 감정</option>
            {SENTIMENTS.map((s) => (
              <option key={s} value={s}>{SENTIMENT_LABEL[s]}</option>
            ))}
          </select>
          <select className="select !w-auto" value={sort} onChange={(e) => setSort(e.target.value as "date" | "score")}>
            <option value="date">최신순</option>
            <option value="score">소재 점수순</option>
          </select>
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={`chip ${category === "" ? "active" : ""}`} onClick={() => setCategory("")}>전체</button>
        {CATEGORIES.map((c) => (
          <button key={c} type="button" className={`chip ${category === c ? "active" : ""}`} onClick={() => setCategory(category === c ? "" : c)}>
            {c}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {!loading && items.length === 0 ? (
        <div className="card p-8 text-center text-sm text-[var(--muted)]">
          {bookmarkedOnly ? "아직 담아둔 리뷰가 없어요. 대시보드에서 ☆ 를 눌러 좋은 리뷰를 담아두세요." : "아직 리뷰가 없어요. 위에서 리뷰를 수집해보세요."}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((r) => (
          <ReviewCard key={r.id} review={r} onBookmark={toggleBookmark} />
        ))}
      </div>

      {items.length < total ? (
        <button type="button" className="btn mx-auto" disabled={loading} onClick={() => load(items.length)}>
          {loading ? "불러오는 중…" : `더 보기 (${items.length}/${total})`}
        </button>
      ) : null}
    </section>
  );
}
