"use client";

import { useMemo, useState } from "react";
import { Notice } from "@/components/ui";
import { num } from "@/lib/format";
import { adAlerts, byGroup, byKeyword, compareWeek, inspectText, keywordIds, monthlyCost, totals, weeklySeries, type NaverAdExport, type Totals } from "@/lib/market/adStats";
import { shiftDate } from "@/lib/market/rank";

// 광고 노트 ⑤ 성적 — 카페스이 광고 노트의 틀: 이번 주 챙길 것(위험·주의·제안) → 기간별 성적 → 주별 흐름 → 광고그룹별 → 키워드별.
// 숫자는 도우미가 밤마다 네이버 광고 API에서 읽어 온 것. 광고비는 VAT 뺀 금액이라 청구서보다 10% 적게 보여요.
const LEVEL_CLS = { 위험: "bg-red-50 text-red-900 ring-red-200", 주의: "bg-amber-50 text-amber-900 ring-amber-200", 제안: "bg-sky-50 text-sky-900 ring-sky-200" } as const;

function Delta({ now, before, unit = "", goodUp = true }: { now: number | null; before: number | null; unit?: string; goodUp?: boolean }) {
  if (now === null || before === null || before === 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return <span className="num ml-1 text-[11px] text-stone-400">평소와 같음</span>;
  const good = goodUp ? pct > 0 : pct < 0;
  return (
    <span className={`num ml-1 text-[11px] ${good ? "text-emerald-700" : "text-red-700"}`}>
      {pct > 0 ? "▲" : "▼"} {Math.abs(pct)}% (평소 {num(before)}
      {unit})
    </span>
  );
}

function Tile({ label, t, u, kind }: { label: string; t: Totals; u: Totals; kind: "cost" | "clk" | "cpc" | "ctr" }) {
  const v = kind === "cost" ? t.cost : kind === "clk" ? t.clk : kind === "cpc" ? t.cpc : t.ctr;
  const b = kind === "cost" ? u.cost : kind === "clk" ? u.clk : kind === "cpc" ? u.cpc : u.ctr;
  const text = v === null ? "–" : kind === "ctr" ? `${v}%` : kind === "clk" ? `${num(v)}번` : `${num(v)}원`;
  return (
    <div className="rounded-xl bg-stone-50 px-3 py-2">
      <p className="text-xs font-semibold text-stone-500">{label}</p>
      <p className="num mt-0.5 text-lg font-bold">{text}</p>
      <Delta now={v} before={b} unit={kind === "ctr" ? "%" : kind === "clk" ? "번" : "원"} goodUp={kind === "clk" || kind === "ctr"} />
    </div>
  );
}

export function AdResultsSection({ ad, today, startedAt }: { ad: NaverAdExport | null; today: string; startedAt: string | null }) {
  const [period, setPeriod] = useState<7 | 14 | 30>(7);
  const from = shiftDate(today, -(period - 1));
  const ids = useMemo(() => (ad ? keywordIds(ad) : new Set<string>()), [ad]);
  const cmp = useMemo(() => (ad ? compareWeek(ad, today) : null), [ad, today]);
  const weeks = useMemo(() => (ad ? weeklySeries(ad, today, 8) : []), [ad, today]);
  const groups = useMemo(() => (ad ? byGroup(ad, from, today) : []), [ad, from, today]);
  const kws = useMemo(() => (ad ? byKeyword(ad, from, today) : []), [ad, from, today]);
  const alerts = useMemo(() => (ad ? adAlerts(ad, today) : []), [ad, today]);
  const periodT = useMemo(() => (ad ? totals(ad.stats, ids, from, today) : null), [ad, ids, from, today]);
  const [showAllKw, setShowAllKw] = useState(false);

  if (!ad) {
    return (
      <section className="card space-y-1">
        <h2 className="text-base font-bold">
          ⑤ 성적 <span className="text-xs font-normal text-stone-500">켠 뒤 2주부터</span>
        </h2>
        <p className="text-sm text-stone-600">
          도우미가 밤마다 네이버 광고 API에서 키워드별 <b>노출 · 클릭 · 광고비 · 평균 순위</b>를 읽어 와 여기에 붙여요. 아직 받은 자료가 없어요 — 리뷰 수집기에서 <code>npm run collect:naver-ad</code> 뒤 <code>npm run export:ledger</code>, 또는 내일 아침 자동 수집 뒤에 보여요.
        </p>
      </section>
    );
  }

  const campaign = ad.campaigns.find((c) => c.type === "WEB_SITE") ?? ad.campaigns[0];
  const reviewCount = ad.keywords.filter((k) => k.inspect === "UNDER_REVIEW").length;
  const runningCount = ad.keywords.filter((k) => k.status === "ELIGIBLE" && k.on).length;
  const hasData = ad.stats.length > 0;
  const days = startedAt ? Math.floor((Date.parse(today) - Date.parse(startedAt)) / 86_400_000) : null;
  const month = today.slice(0, 7);
  const visibleKws = showAllKw ? kws : kws.slice(0, 20);

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">
          ⑤ 성적 <span className="text-xs font-normal text-stone-500">네이버 광고 API · 밤마다 자동</span>
        </h2>
        <span className="num text-xs text-stone-500">{ad.collectedAt ? `마지막으로 읽은 때 ${ad.collectedAt.replace("T", " ").slice(0, 16)}` : ""}</span>
      </div>

      {/* 지금 광고 세팅 */}
      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-xl bg-stone-50 px-3 py-2">
          <p className="text-xs font-semibold text-stone-500">캠페인</p>
          <p className="font-bold">
            {campaign?.name ?? "–"} <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${campaign?.on ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"}`}>{campaign?.on ? "ON" : "OFF"}</span>
          </p>
          <p className="num text-xs text-stone-500">하루 예산 {campaign?.dailyBudget ? `${num(campaign.dailyBudget)}원` : "–"}{days !== null ? ` · 켠 지 ${days}일` : ""}</p>
        </div>
        <div className="rounded-xl bg-stone-50 px-3 py-2">
          <p className="text-xs font-semibold text-stone-500">광고그룹 · 키워드</p>
          <p className="num font-bold">
            {ad.groups.length}묶음 · {ad.keywords.length}개
          </p>
          <p className="num text-xs text-stone-500">
            운영 {runningCount} · 검토 중 {reviewCount}
            {reviewCount > 0 && reviewCount === ad.keywords.length && " — 검토가 끝나면 저절로 나가요"}
          </p>
        </div>
        <div className="rounded-xl bg-orange-50 px-3 py-2">
          <p className="text-xs font-semibold text-stone-500">{Number(month.slice(5))}월 광고비 (VAT 포함 어림)</p>
          <p className="num font-bold">{num(monthlyCost(ad, month))}원</p>
          <p className="text-xs text-stone-500">장부 고정비 "광고비"에 이 숫자를 적어요</p>
        </div>
      </div>

      {/* 이번 주 챙길 것 */}
      <div>
        <p className="text-sm font-semibold">이번 주 챙길 것 <span className="text-xs font-normal text-stone-500">지난 7일을 평소 4주와 비교했어요</span></p>
        {alerts.length === 0 ? (
          <p className="mt-1 text-sm text-stone-500">{hasData ? "눈에 띄는 문제가 없어요." : "아직 성적 숫자가 없어요. 검토가 끝나고 광고가 나가기 시작하면 여기에 붙어요."}</p>
        ) : (
          <ul className="mt-1 space-y-1.5">
            {alerts.map((a, i) => (
              <li key={i} className={`rounded-xl px-3 py-2 text-sm ring-1 ${LEVEL_CLS[a.level]}`}>
                <b className="mr-1.5">{a.level}</b>
                {a.text}
              </li>
            ))}
          </ul>
        )}
      </div>

      {hasData && cmp && (
        <>
          {/* 기간별 성적 */}
          <div>
            <p className="text-sm font-semibold">
              지난 7일 성적 <span className="num text-xs font-normal text-stone-500">{cmp.from.slice(5)} ~ {cmp.to.slice(5)}{cmp.usualWeeks >= 1 ? ` · 평소 = 그 앞 ${cmp.usualWeeks}주 평균` : " · 평소와 비교하려면 2주 더 필요"}</span>
            </p>
            <div className="mt-1 grid gap-2 sm:grid-cols-4">
              <Tile label="광고비" t={cmp.thisWeek} u={cmp.usual} kind="cost" />
              <Tile label="클릭" t={cmp.thisWeek} u={cmp.usual} kind="clk" />
              <Tile label="클릭 1번에" t={cmp.thisWeek} u={cmp.usual} kind="cpc" />
              <Tile label="누른 비율" t={cmp.thisWeek} u={cmp.usual} kind="ctr" />
            </div>
          </div>

          {/* 주별 흐름 */}
          <div>
            <p className="text-sm font-semibold">주별 흐름 <span className="text-xs font-normal text-stone-500">최근 8주 · 막대는 클릭, 숫자는 광고비</span></p>
            <div className="mt-1 flex h-24 items-end gap-1">
              {(() => {
                const max = Math.max(1, ...weeks.map((w) => w.t.clk));
                return weeks.map((w) => (
                  <div key={w.to} className="flex flex-1 flex-col items-center" title={`${w.from} ~ ${w.to} · 클릭 ${w.t.clk} · 광고비 ${num(w.t.cost)}원`}>
                    <span className="num text-[10px] text-stone-500">{w.t.cost ? num(Math.round(w.t.cost / 1000)) + "천" : ""}</span>
                    <div className="w-full rounded-t bg-orange-400" style={{ height: `${Math.max(2, (w.t.clk / max) * 64)}px` }} />
                    <span className="num text-[10px] text-stone-400">{w.to.slice(5)}</span>
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* 광고그룹별 · 키워드별 */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">묶음별 · 키워드별</p>
            <div className="flex gap-1">
              {([7, 14, 30] as const).map((p) => (
                <button key={p} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${period === p ? "bg-orange-600 text-white" : "bg-stone-100 text-stone-600"}`} onClick={() => setPeriod(p)}>
                  최근 {p}일
                </button>
              ))}
            </div>
          </div>
          {periodT && (
            <p className="num text-xs text-stone-600">
              최근 {period}일 합계: 노출 {num(periodT.imp)} · 클릭 {num(periodT.clk)} · 광고비 {num(periodT.cost)}원{periodT.cpc !== null && ` · 클릭 1번에 ${num(periodT.cpc)}원`}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="py-1">묶음</th>
                  <th className="text-right">광고비</th>
                  <th className="text-right">클릭</th>
                  <th className="text-right">노출</th>
                  <th className="text-right">누른 비율</th>
                  <th className="text-right">클릭 1번에</th>
                  <th className="text-right">평균 순위</th>
                </tr>
              </thead>
              <tbody className="num divide-y divide-stone-100">
                {groups.map((g) => (
                  <tr key={g.group.id} className={g.on ? "" : "text-stone-400"}>
                    <td className="py-1 font-semibold">
                      {g.group.name} <span className="text-[11px] font-normal text-stone-400">{g.keywords}개</span>
                    </td>
                    <td className="text-right">
                      {num(g.t.cost)}원<Delta now={g.t.cost} before={g.prev.cost} unit="원" goodUp={false} />
                    </td>
                    <td className="text-right">
                      {num(g.t.clk)}<Delta now={g.t.clk} before={g.prev.clk} />
                    </td>
                    <td className="text-right">{num(g.t.imp)}</td>
                    <td className="text-right">{g.t.ctr === null ? "–" : `${g.t.ctr}%`}</td>
                    <td className="text-right">{g.t.cpc === null ? "–" : `${num(g.t.cpc)}원`}</td>
                    <td className="text-right">{g.t.avgRank === null ? "–" : `${g.t.avgRank}위`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="py-1">키워드</th>
                  <th className="text-right">노출</th>
                  <th className="text-right">클릭</th>
                  <th className="text-right">광고비</th>
                  <th className="text-right">클릭 1번에</th>
                  <th className="text-right">순위</th>
                  <th className="text-right">입찰가</th>
                  <th className="text-center">품질</th>
                  <th className="text-center">상태</th>
                </tr>
              </thead>
              <tbody className="num divide-y divide-stone-100">
                {visibleKws.map((r) => (
                  <tr key={r.k.id} className={r.t.imp === 0 ? "text-stone-400" : ""}>
                    <td className="py-1 font-semibold">
                      {r.k.keyword} <span className="text-[11px] font-normal text-stone-400">{r.groupName}</span>
                    </td>
                    <td className="text-right">{num(r.t.imp)}</td>
                    <td className="text-right">{num(r.t.clk)}</td>
                    <td className="text-right">{r.t.cost ? `${num(r.t.cost)}원` : "–"}</td>
                    <td className="text-right">{r.t.cpc === null ? "–" : `${num(r.t.cpc)}원`}</td>
                    <td className="text-right">{r.t.avgRank === null ? "–" : `${r.t.avgRank}위`}</td>
                    <td className="text-right">{r.bidShown === null ? "–" : `${num(r.bidShown)}원`}</td>
                    <td className="text-center">{r.k.quality === null ? "–" : `${r.k.quality}/7`}</td>
                    <td className="text-center text-xs">{inspectText(r.k)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {kws.length > 20 && (
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setShowAllKw((v) => !v)}>
              {showAllKw ? "접기" : `키워드 ${kws.length - 20}개 더 보기`}
            </button>
          )}
          <p className="text-xs text-stone-500">광고비는 VAT를 뺀 금액이라 네이버 청구서보다 10% 적어요. 회색 키워드는 그 기간에 한 번도 안 보인 것. 입찰가·켜고 끄기는 네이버 광고 화면에서 바꾸고, 바꾼 것은 위 "바꾼 기록"에 한 줄 남겨 두세요.</p>
        </>
      )}
      {!hasData && (
        <Notice tone="info">
          키워드 {ad.keywords.length}개가 등록돼 있고{reviewCount ? ` ${reviewCount}개는 검토 중이에요` : ""}. 광고가 나가기 시작하면 다음 날 아침부터 숫자가 붙어요. 첫 2주는 그냥 두고 보는 기간이에요.
        </Notice>
      )}
    </section>
  );
}
