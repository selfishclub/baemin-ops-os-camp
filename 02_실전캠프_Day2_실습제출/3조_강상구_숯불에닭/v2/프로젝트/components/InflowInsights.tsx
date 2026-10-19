"use client";
import { useMemo, useState } from "react";
import type { MarketInflow } from "@/lib/export/types";
import { inflowResearch } from "@/lib/market/inflowInsights";
import { INFLOW_RESEARCHED_AT } from "@/lib/market/inflowEvents";
import { num } from "@/lib/format";

export function InflowInsights({ inflow }: { inflow: MarketInflow }) {
  const research = useMemo(() => inflowResearch(inflow), [inflow]);
  const [year, setYear] = useState("");
  const [word, setWord] = useState("");
  const [allChanges, setAllChanges] = useState(false);
  const term = word.replace(/\s+/g, "");
  const cases = research.cases.filter(item => (!year || item.event.start.startsWith(year) || item.event.end.startsWith(year)) && `${item.event.title}${item.event.place}${item.months.flatMap(month => month.items.map(row => row.keyword)).join("")}`.replace(/\s+/g, "").includes(term));
  const changes = research.changes.filter(row => (!year || row.month.startsWith(year)) && row.keyword.includes(term));
  const available = research.months.filter(month => month.hasData);
  return <section id="inflow-insights" className="card scroll-mt-24 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-bold">특이한 검색 유입과 가능한 이유</h2><p className="mt-1 text-xs text-stone-500">행사 자료 확인일 {INFLOW_RESEARCHED_AT} · 원인 확정이 아닌 날짜·장소 대조 결과예요.</p></div>
      <a href="#inflow-month-coverage" className="text-xs text-emerald-700 underline">분석 범위 보기</a>
    </div>
    <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
      {research.months[0]?.month} ~ {research.months.at(-1)?.month} · 월별 {research.months.length}개월 검토 · 유효 자료 {available.length}개월 · 일간 {research.dailyCount}일 대조 자료
      <p className="mt-1 text-xs">모든 날짜의 일간 자료를 수집한 것은 아니에요. 월별 후보에서 행사일과 비교일을 골라 대조했어요. 행사 기록은 수시 자동 검색이 아닌 이번에 조사한 자료예요.</p>
    </div>
    <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)]">
      <select aria-label="유입 사례 연도" className="h-10 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm" value={year} onChange={e => {setYear(e.target.value);setAllChanges(false);}}><option value="">전체 기간</option>{[...new Set(research.months.map(month => month.month.slice(0, 4)))].sort().reverse().map(y => <option key={y} value={y}>{y}년</option>)}</select>
      <input aria-label="유입 사례 검색" className="field min-w-0 flex-1" placeholder="장소·검색어·행사 검색" value={word} onChange={e => {setWord(e.target.value);setAllChanges(false);}} />
    </div>
    <p className="text-xs text-stone-500">비교일은 확인한 행사일 중 가장 많은 날의 일주일 전 같은 요일이에요. 확인한 날만 비교하므로 기간 전체의 최고일이나 행사 효과로 단정하지 않아요.</p>
    <div className="grid gap-3 lg:grid-cols-2">
      {cases.map(item => <article key={item.event.id} id={`inflow-case-${item.event.id}`} className="scroll-mt-24 rounded-xl border border-stone-200 bg-white p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.label === "비교일보다 증가" ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-600"}`}>{item.label}</span><span className="text-xs text-stone-500">{item.label === "비교일보다 증가" ? "원인 추정" : "대조 결과"}</span></div>
        <h3 className="font-bold">{item.event.title}</h3>
        <p className="mt-1 text-xs text-stone-500">{item.event.start} ~ {item.event.end} · {item.event.place}</p>
        {item.peak && <div className="mt-3 rounded-lg bg-stone-50 p-3 text-sm"><b>{item.peak.date} 관련 유입 {num(item.peak.count)}회</b>{item.baseline && <p className="mt-1">전주 같은 요일({item.baseline.date}) {num(item.baseline.count)}회 → {num(item.peak.count)}회</p>}<p className="mt-1 text-xs text-stone-500">행사 기간 {item.expectedDays}일 중 {item.days.length}일 확인 · 확인한 날의 합계 {num(item.observed)}회</p></div>}
        <p className="mt-3 text-sm">{item.event.note}</p>
        {item.peak && item.baseline && item.peak.count <= item.baseline.count && <p className="mt-2 text-xs font-medium text-amber-800">확인한 날짜에서는 유입 증가가 확인되지 않았어요. 이 행사를 급증 원인으로 판단하지 않았어요.</p>}
        <details className="mt-3 text-xs"><summary className="cursor-pointer text-emerald-700">유입 근거와 검색어 보기</summary><div className="mt-2 space-y-2">
          {item.days.map(day => <p key={day.date}>{day.date} · {num(day.count)}회{day.items.length ? ` — ${day.items.map(row => `${row.keyword} ${num(row.pv)}회`).join(", ")}` : " — 해당 검색어 미표시"}</p>)}
          {item.months.map(month => <p key={month.month}>{month.month} 월별 관련 유입 {num(month.count)}회 · {month.items.map(row => `${row.keyword} ${num(row.pv)}회`).join(", ") || "해당 검색어 미표시"}</p>)}
          <p className="text-stone-500">월별 숫자는 그 달 전체(이번 달은 자료 종료일까지)이며 행사일 합계가 아니에요. 같은 장소의 여러 행사에 월별 숫자가 중복 표시될 수 있어 사례끼리 합산하면 안 돼요.</p>
        </div></details>
        <a href={item.event.url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs text-emerald-700 underline">근거: {item.event.source} ↗</a>
      </article>)}
    </div>
    {!cases.length && <p className="text-sm text-stone-500">조건에 맞는 행사 사례가 없어요. 아래 키워드 변화도 확인해 주세요.</p>}
    <details className="rounded-xl border border-stone-200 p-4">
      <summary className="cursor-pointer font-semibold">전체 키워드 변화 후보 {num(changes.length)}건</summary>
      <p className="my-3 text-xs text-stone-500">가게 이름·검색어 없음을 제외한 모든 키워드를 월별로 비교했어요. 이번 달은 날짜 수를 보정해 하루 평균으로 비교해요. 5회 이상이며 앞달보다 하루 평균 2배 이상이거나 앞달 목록에 없는 키워드예요. 앞달 자료가 비어 있으면 비교하지 않아요. 검색 노출·대표 키워드 변경 등 가게 운영 변화도 영향을 줄 수 있어요.</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[36rem] text-left text-xs"><thead><tr className="border-b border-stone-200 text-stone-500"><th className="py-2">기간</th><th>검색어</th><th>이번 / 앞달</th><th>하루 평균 변화</th><th>행사 대조</th></tr></thead><tbody>{(allChanges ? changes : changes.slice(0, 20)).map(row => <tr key={`${row.month}/${row.keyword}`} className="border-b border-stone-100"><td className="py-2">{row.month}</td><td>{row.keyword}</td><td>{num(row.count)} / {num(row.previous)}회</td><td>{row.ratio === null ? "앞달 목록에 없음" : `${row.ratio.toFixed(1)}배`}</td><td>{row.events.length ? row.events.map(event => <a key={event.id} href={`#inflow-case-${event.id}`} className="block text-emerald-700 underline">{event.title} · 행사월 일치</a>) : "행사 근거 미확인"}</td></tr>)}</tbody></table></div>
      {changes.length > 20 && <button type="button" className="btn-ghost mt-3 text-xs" onClick={() => setAllChanges(value => !value)}>{allChanges ? "20건만 보기" : `모두 보기 (${changes.length}건)`}</button>}
    </details>
    <details id="inflow-month-coverage" className="rounded-xl border border-stone-200 p-4"><summary className="cursor-pointer font-semibold">전기간 월별 자료 범위와 빈 달</summary><p className="my-3 text-xs text-stone-500">빈 원본 응답을 유입 0회로 해석하지 않았어요. 자료가 없는 달은 이유를 분석할 수 없어요.</p><div className="grid gap-2 sm:grid-cols-3">{research.months.map(month => <p key={month.month} className="rounded-lg bg-stone-50 p-2 text-xs">{month.month} · {month.hasData ? `${num(month.count)}회 / ${month.keywords}개 검색어` : "자료 없음"}</p>)}</div></details>
    <p className="text-xs text-stone-500">숫자는 네이버검색을 통해 가게 플레이스로 들어온 횟수예요. 전체 검색량·매장 방문·매출이 아니며, 행사와 유입의 인과관계가 입증된 것은 아니에요.</p>
  </section>;
}
