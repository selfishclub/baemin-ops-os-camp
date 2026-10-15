"use client";

import { useEffect, useMemo, useState } from "react";
import { ExportUploadCard } from "@/components/ExportUploadCard";
import { MarketManualCard } from "@/components/MarketManualCard";
import { useExport } from "@/components/useExport";
import { Notice } from "@/components/ui";
import { todayStr } from "@/lib/daily";
import { num } from "@/lib/format";
import { CHANGE_TODO, EMPTY_PLACE_KEYWORDS, PLACE_KEYWORDS_KEY, SLOT_HINTS, SLOT_LABELS, keywordSummaries, nextSeasonKeyword, rankSeries, rankText, type PlaceKeywords } from "@/lib/market/rank";
import { areaSummary, competitorRows, trendSummary } from "@/lib/market/area";
import { getStore } from "@/lib/storage";
import type { DailySale } from "@/lib/types";

const SAME_WORDS = ["닭", "치킨", "닭갈비"];
const MONTH = (p: string) => `${Number(p.slice(5, 7))}월`;

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
  // 우리 동네 (npm run market 결과). 같은 종류 가게는 우리 가게 업종 글자로 고른다 — 닭·치킨·닭갈비
  const market = exp.market;
  const area = useMemo(() => (market?.area ? areaSummary(market.area, SAME_WORDS) : null), [market]);
  const trends = useMemo(() => (market?.trend ? market.trend.groups.map(trendSummary) : []), [market]);
  const competitor = useMemo(() => {
    const c = market?.competitors.find((x) => x.keyword === keyword) ?? market?.competitors[0];
    return c ? competitorRows(c) : null;
  }, [market, keyword]);

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

      {/* 우리 동네 — 점포 · 인구 */}
      <section className="card space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">우리 동네는 어떤가</h2>
          <span className="text-xs text-stone-500">공공데이터 상가정보 · 통계청 · 한 달에 한 번 <code>npm run market</code></span>
        </div>
        {!market || (!area && !market.population) ? (
          <Notice tone="info">
            아직 동네 조사 자료가 없어요. 리뷰 수집기 .env.local 에 공공데이터포털·통계청 키(무료)를 넣고 <code>npm run market</code> → <code>npm run export:ledger</code> 뒤 파일을 올리면, 반경 500m 안 점포 수·같은 업종 가게·동 인구가 보여요.
          </Notice>
        ) : (
          <>
            {area && (
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl bg-stone-50 px-3 py-2">
                  <p className="text-xs font-semibold text-stone-500">반경 {area.radius}m 안 점포</p>
                  <p className="num mt-0.5 text-lg font-bold">{num(area.total)}곳</p>
                  <p className="num text-[11px] text-stone-500">{area.byLarge.slice(0, 3).map((b) => `${b.name} ${b.count}`).join(" · ")}</p>
                </div>
                <div className="rounded-xl bg-stone-50 px-3 py-2">
                  <p className="text-xs font-semibold text-stone-500">음식점 종류</p>
                  <p className="num mt-0.5 text-sm">{area.food.slice(0, 5).map((f) => `${f.name} ${f.count}`).join(" · ") || "–"}</p>
                </div>
                <div className={`rounded-xl px-3 py-2 ${area.same.length ? "bg-orange-50" : "bg-stone-50"}`}>
                  <p className="text-xs font-semibold text-stone-500">같은 종류 가게 (닭·치킨)</p>
                  <p className="num mt-0.5 text-lg font-bold">{num(area.same.length)}곳</p>
                  <p className="truncate text-[11px] text-stone-500">{area.same.slice(0, 4).map((x) => x.name).join(", ")}</p>
                </div>
              </div>
            )}
            {area?.prev && (
              <p className="text-sm">
                <b>{area.prev.surveyedAt}</b> 조사와 비교: 새로 생긴 가게 <b className="num text-emerald-700">{area.prev.opened.length}</b>
                {area.prev.opened.length > 0 && <span className="text-xs text-stone-500"> ({area.prev.opened.slice(0, 5).map((x) => x.name).join(", ")})</span>} · 사라진 가게 <b className="num text-red-700">{area.prev.closed.length}</b>
                {area.prev.closed.length > 0 && <span className="text-xs text-stone-500"> ({area.prev.closed.slice(0, 5).map((x) => x.name).join(", ")})</span>}
              </p>
            )}
            {market.population && (
              <p className="num text-sm text-stone-700">
                {market.population.admName} 인구 <b>{num(market.population.total)}명</b> ({market.population.year}년)
                {market.population.avgAge !== null && <> · 평균 {market.population.avgAge}세</>}
                {market.population.households !== null && <> · {num(market.population.households)}가구</>}
              </p>
            )}
            {area && <p className="num text-xs text-stone-400">조사일 {area.surveyedAt} · 공공데이터 상가정보는 등록 기준이라 실제와 몇 곳 다를 수 있어요</p>}
          </>
        )}
      </section>

      <MarketManualCard today={today} />

      {/* 검색 흐름 */}
      {trends.length > 0 && market?.trend && (
        <section className="card space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold">
              키워드 검색 흐름 <span className="text-xs font-normal text-stone-500">네이버 데이터랩 · 최근 12개월</span>
            </h2>
            <span className="num text-xs text-stone-500">
              {MONTH(market.trend.start)} ~ {MONTH(market.trend.end)}
            </span>
          </div>
          <ul className="space-y-2">
            {market.trend.groups.map((g, gi) => {
              const t = trends[gi];
              const max = Math.max(1, ...g.data.map((d) => d.ratio));
              return (
                <li key={g.name} className="rounded-xl bg-stone-50 px-3 py-2">
                  <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <b>{g.name}</b>
                    <span className="num text-xs text-stone-600">
                      {t.bestMonth !== null && (
                        <>
                          가장 많이 찾는 달 <b>{t.bestMonth}월</b> → ⑤칸은 <b>{t.prepareMonth}월</b>에 바꾸기
                        </>
                      )}
                      {t.latestVsAvg !== null && <> · 지금은 평소의 {Math.round(t.latestVsAvg * 100)}%</>}
                    </span>
                  </p>
                  <div className="mt-1 flex h-12 items-end gap-0.5">
                    {g.data.map((d) => (
                      <div key={d.period} className="flex flex-1 flex-col items-center" title={`${d.period} ${d.ratio}`}>
                        <div className={`w-full rounded-t ${t.peakMonths.includes(Number(d.period.slice(5, 7))) ? "bg-orange-500" : "bg-orange-200"}`} style={{ height: `${Math.max(2, (d.ratio / max) * 36)}px` }} />
                        <span className="text-[9px] text-stone-400">{Number(d.period.slice(5, 7))}</span>
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-stone-500">진한 막대가 평소보다 20% 넘게 많이 찾은 달이에요. 검색량은 그 기간 최대를 100으로 둔 비율이라 키워드끼리 크기 비교는 안 돼요.</p>
        </section>
      )}

      {/* 경쟁 가게 변화 */}
      {competitor && competitor.rows.length > 0 && (
        <section className="card space-y-2">
          <h2 className="text-base font-bold">
            경쟁 가게 변화{" "}
            <span className="num text-xs font-normal text-stone-500">
              "{keyword}" · {competitor.from} → {competitor.to} ({competitor.days}일)
            </span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] text-sm">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="py-1">가게</th>
                  <th className="text-right">순위</th>
                  <th className="text-right">방문자 리뷰</th>
                  <th className="text-right">그동안 늘어난 리뷰</th>
                </tr>
              </thead>
              <tbody className="num divide-y divide-stone-100">
                {competitor.rows.slice(0, 12).map((r) => (
                  <tr key={r.id} className={r.mine ? "bg-orange-50 font-bold" : ""}>
                    <td className="py-1">
                      {r.name}
                      {r.mine && " ← 우리"}
                    </td>
                    <td className="text-right">
                      {r.rankNow ?? "밖"}
                      {r.rankFirst !== null && r.rankNow !== null && r.rankFirst !== r.rankNow && <span className={`ml-1 text-xs ${r.rankNow < r.rankFirst ? "text-emerald-700" : "text-red-700"}`}>({r.rankFirst}→)</span>}
                    </td>
                    <td className="text-right">{r.visitorNow === null ? "–" : num(r.visitorNow)}</td>
                    <td className={`text-right ${(r.visitorGain ?? 0) > 0 ? "text-emerald-700" : ""}`}>{r.visitorGain === null ? <span className="text-stone-300">새로 올라옴</span> : `+${num(r.visitorGain)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-stone-500">리뷰가 빨리 느는 가게가 손님을 끌어가는 가게예요. 우리보다 빠르면 그 가게 리뷰에서 손님이 뭘 좋아하는지 보세요.</p>
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
