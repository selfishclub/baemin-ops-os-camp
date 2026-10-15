"use client";

import { useEffect, useMemo, useState } from "react";
import { ExportUploadCard } from "@/components/ExportUploadCard";
import { useExport } from "@/components/useExport";
import { Notice } from "@/components/ui";
import { todayStr } from "@/lib/daily";
import { num } from "@/lib/format";
import { CHANGE_TODO, EMPTY_PLACE_KEYWORDS, PLACE_KEYWORDS_KEY, SLOT_HINTS, SLOT_LABELS, keywordSummaries, nextSeasonKeyword, rankSeries, rankText, type PlaceKeywords } from "@/lib/market/rank";
import { getStore } from "@/lib/storage";
import type { DailySale } from "@/lib/types";

const LINKS = [
  { name: "네이버 검색광고 키워드 도구", url: "https://searchad.naver.com/", why: "한 달 검색량·경쟁 정도 (카페스이가 시즌 키워드 고를 때 보던 곳)" },
  { name: "네이버 데이터랩 검색어 트렌드", url: "https://datalab.naver.com/keyword/trendSearch.naver", why: "키워드가 언제 오르는지 흐름" },
  { name: "소상공인365 상권분석", url: "https://sbiz365.kr/", why: "우리 동네 업종별 점포 수·유동인구·매출 추정" },
  { name: "스마트플레이스 (대표 키워드 바꾸는 곳)", url: "https://new.smartplace.naver.com/", why: "⑤칸을 바꾸는 날 여기서" },
];

// 상권 탭 — 네이버 플레이스 순위 추이(우리 순위 추적기) + 경쟁 가게 + 대표 키워드 5칸(카페스이 방식).
export default function MarketPage() {
  const exp = useExport();
  const today = todayStr();
  const rank = exp.rank;
  const summaries = useMemo(() => (rank ? keywordSummaries(rank.history, rank.keywords) : []), [rank]);
  const [keyword, setKeyword] = useState<string>("");
  const [sales, setSales] = useState<Map<string, number>>(new Map());
  const [pk, setPk] = useState<PlaceKeywords>(EMPTY_PLACE_KEYWORDS);
  const [pkLoaded, setPkLoaded] = useState(false);

  useEffect(() => {
    // 처음엔 순위가 있는 키워드부터 (50위 밖만 있으면 첫 것)
    if (!keyword && summaries.length) setKeyword((summaries.find((x) => x.rank !== null) ?? summaries[0]).keyword);
  }, [summaries, keyword]);

  useEffect(() => {
    const store = getStore();
    void store.listAllDailySales().then((rows: DailySale[]) => {
      const m = new Map<string, number>();
      for (const r of rows) m.set(r.date, (m.get(r.date) ?? 0) + r.amount);
      setSales(m);
    });
    void store.getSetting<PlaceKeywords>(PLACE_KEYWORDS_KEY).then((v) => {
      if (v) setPk({ ...EMPTY_PLACE_KEYWORDS, ...v, slots: [...EMPTY_PLACE_KEYWORDS.slots].map((s, i) => v.slots?.[i] ?? s) as PlaceKeywords["slots"], todo: CHANGE_TODO.map((_, i) => v.todo?.[i] ?? false) });
      setPkLoaded(true);
    });
  }, []);

  const savePk = (next: PlaceKeywords) => {
    setPk(next);
    void getStore().saveSetting(PLACE_KEYWORDS_KEY, next).catch(() => {});
  };

  const series = useMemo(() => (rank && keyword ? rankSeries(rank.history, keyword, 30) : []), [rank, keyword]);
  const latestResult = rank?.latest?.results.find((r) => r.keyword === keyword) ?? null;
  const nextSeason = nextSeasonKeyword(pk, today);

  if (!exp.loaded) return <p className="py-10 text-center text-sm text-stone-500">불러오는 중…</p>;

  return (
    <>
      <ExportUploadCard exp={exp} what="상권 탭의 순위" />

      {/* 순위 요약 */}
      <section className="card space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">네이버 플레이스 순위 <span className="text-xs font-normal text-stone-500">{rank?.shop || "우리 가게"} · 매일 09:00 자동 기록</span></h2>
          {rank?.latest && <span className="num text-xs text-stone-500">마지막으로 읽은 날 {rank.latest.date}</span>}
        </div>
        {!rank || summaries.length === 0 ? (
          <Notice tone="info">순위 기록이 아직 없어요. 리뷰 수집기에서 <code>npm run rank</code> 를 돌린 뒤 내보내기 파일을 올리면 키워드별 순위가 보여요.</Notice>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {summaries.map((s) => (
              <button key={s.keyword} className={`rounded-xl px-3 py-2 text-left ring-1 ${keyword === s.keyword ? "bg-orange-50 ring-orange-300" : "bg-stone-50 ring-stone-200"}`} onClick={() => setKeyword(s.keyword)}>
                <p className="flex items-baseline justify-between">
                  <span className="text-sm font-bold">{s.keyword}</span>
                  <span className="num text-lg font-extrabold">{s.rank === null ? (s.days ? "50위 밖" : "–") : `${s.rank}위`}</span>
                </p>
                <p className="num mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-stone-500">
                  {s.change !== null && s.change !== 0 && <span className={s.change > 0 ? "text-emerald-700" : "text-red-700"}>{s.change > 0 ? `▲ ${s.change}` : `▼ ${-s.change}`} (7일 전 {s.weekAgoRank}위)</span>}
                  {s.change === 0 && <span>7일 전과 같음</span>}
                  {s.best !== null && <span>최고 {s.best}위</span>}
                  {s.total !== null && <span>검색 결과 {num(s.total)}곳</span>}
                  {s.visitor !== null && <span>방문자 리뷰 {num(s.visitor)}</span>}
                  {s.blog !== null && <span>블로그 {num(s.blog)}</span>}
                  {s.save !== null && <span>저장 {num(s.save)}</span>}
                  {s.unreadDays > 0 && <span className="text-stone-400">못 읽은 날 {s.unreadDays}</span>}
                </p>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 추이 + 매출 */}
      {series.length > 0 && (
        <section className="card space-y-2">
          <h2 className="text-base font-bold">
            "{keyword}" 최근 30일 <span className="text-xs font-normal text-stone-500">순위와 그날 매출을 나란히</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[22rem] text-sm">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="py-1">날짜</th>
                  <th className="text-right">순위</th>
                  <th className="w-1/2">　</th>
                  <th className="text-right">그날 매출</th>
                </tr>
              </thead>
              <tbody className="num divide-y divide-stone-100">
                {[...series].reverse().map((p) => (
                  <tr key={p.date} className={p.note ? "text-stone-400" : ""}>
                    <td className="py-1">{p.date.slice(5)}</td>
                    <td className="text-right font-bold">{rankText(p)}</td>
                    <td className="px-2">
                      {p.rank !== null && !p.note && (
                        <span className="block h-2.5 rounded bg-stone-100">
                          <span className="block h-2.5 rounded bg-orange-400" style={{ width: `${Math.max(4, ((51 - Math.min(p.rank, 50)) / 50) * 100)}%` }} />
                        </span>
                      )}
                    </td>
                    <td className="text-right">{sales.has(p.date) ? num(sales.get(p.date)!) : <span className="text-stone-300">–</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-stone-500">막대가 길수록 순위가 좋아요. 매출은 오늘 탭에 넣은 채널 합계예요. 순위가 바뀐 뒤 매출이 달라졌는지 볼 때 쓰세요(날씨·행사도 섞여 있어요).</p>
        </section>
      )}

      {/* 경쟁 가게 */}
      {latestResult && latestResult.top.length > 0 && (
        <section className="card space-y-2">
          <h2 className="text-base font-bold">
            "{keyword}" 검색 결과 위쪽 가게 <span className="num text-xs font-normal text-stone-500">{rank!.latest!.date} 기준</span>
          </h2>
          <ol className="divide-y divide-stone-100 text-sm">
            {latestResult.top.slice(0, 15).map((t, i) => {
              const mine = rank?.shop && t.name.replace(/\s/g, "").includes(rank.shop.replace(/\s/g, "").slice(0, 4));
              return (
                <li key={i} className={`flex items-center gap-2 py-1.5 ${mine ? "rounded bg-orange-50 px-1 font-bold" : ""}`}>
                  <span className="num w-7 text-right text-stone-500">{t.rank ?? i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{t.name}{mine && " ← 우리"}</span>
                  <span className="num text-xs text-stone-500">리뷰 {t.visitor ?? "–"} · 블로그 {t.blog ?? "–"} · 저장 {t.save ?? "–"}</span>
                </li>
              );
            })}
          </ol>
          {latestResult.adNames.length > 0 && <p className="text-xs text-stone-500">광고로 위에 뜬 가게: {latestResult.adNames.join(", ")}</p>}
        </section>
      )}

      {/* 대표 키워드 5칸 */}
      <section className="card space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">스마트플레이스 대표 키워드 5칸</h2>
          <span className="text-xs text-stone-500">카페스이 방식 — 네 칸은 고정, ⑤칸만 시즌마다</span>
        </div>
        <p className="text-sm text-stone-600">
          검색이 오르기 <b>한 달 전에</b> ⑤칸을 바꿔 두는 게 핵심이에요. 가게 이름·지역명만 있는 말은 네이버가 이미 알아서 안 넣고, 리뷰·블로그에 한 번도 안 나온 말도 안 넣어요.
        </p>
        {pkLoaded && (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {SLOT_LABELS.map((label, i) => (
                <label key={i} className={`block text-xs font-semibold text-stone-500 ${i === 4 ? "sm:col-span-2" : ""}`}>
                  {label}
                  <input className={`field mt-1 ${i === 4 ? "border-orange-300 bg-orange-50" : ""}`} placeholder={SLOT_HINTS[i]} value={pk.slots[i]} onChange={(e) => savePk({ ...pk, slots: pk.slots.map((s, j) => (j === i ? e.target.value : s)) as PlaceKeywords["slots"] })} />
                </label>
              ))}
            </div>
            <div className="rounded-xl bg-stone-50 p-3">
              <p className="text-xs font-semibold text-stone-500">⑤칸 시즌 달력 — 달마다 넣을 말을 미리 적어 두세요</p>
              <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((m) => (
                  <label key={m} className="text-[11px] text-stone-500">
                    {m}월
                    <input className="field mt-0.5 px-2 py-1 text-xs" value={pk.season[m] ?? ""} onChange={(e) => savePk({ ...pk, season: { ...pk.season, [m]: e.target.value } })} />
                  </label>
                ))}
              </div>
              {nextSeason && (
                <p className="mt-2 text-sm text-orange-900">
                  다음 달({nextSeason.month}월) ⑤칸: <b>{nextSeason.keyword}</b> — 지금 바꿔 두면 검색이 몰리기 전에 자리를 잡아요.
                </p>
              )}
            </div>
            <div className="rounded-xl bg-stone-50 p-3">
              <p className="flex items-center justify-between text-xs font-semibold text-stone-500">
                바꾸는 날 할 일
                <button className="rounded bg-stone-800 px-2 py-0.5 text-[11px] font-bold text-white" onClick={() => savePk({ ...pk, changedAt: today, todo: CHANGE_TODO.map(() => false) })}>
                  오늘 바꿨어요 (체크 새로)
                </button>
              </p>
              <ul className="mt-1.5 space-y-1">
                {CHANGE_TODO.map((t, i) => (
                  <li key={i}>
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-0.5" checked={pk.todo[i]} onChange={(e) => savePk({ ...pk, todo: pk.todo.map((v, j) => (j === i ? e.target.checked : v)) })} />
                      <span className={pk.todo[i] ? "text-stone-400 line-through" : ""}>{t}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {pk.changedAt && <p className="num mt-1.5 text-xs text-stone-500">마지막으로 바꾼 날 {pk.changedAt} → {daysSince(pk.changedAt, today) >= 7 ? "순위를 다시 재 볼 때예요 (위 순위 카드)" : `${7 - daysSince(pk.changedAt, today)}일 뒤에 순위를 다시 재 보세요`}</p>}
            </div>
          </>
        )}
      </section>

      <section className="card space-y-2">
        <h2 className="text-base font-bold">참고 자료 (링크만, 연결 아님)</h2>
        <ul className="space-y-1 text-sm">
          {LINKS.map((l) => (
            <li key={l.url}>
              <a className="font-semibold text-orange-700 underline" href={l.url} target="_blank" rel="noreferrer">
                {l.name}
              </a>
              <span className="ml-1 text-xs text-stone-500">{l.why}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

const daysSince = (a: string, b: string) => Math.floor((Date.parse(b) - Date.parse(a)) / 86_400_000);
