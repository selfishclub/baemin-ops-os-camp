"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SourceTag } from "@/components/SourceTag";
import { useExport } from "@/components/useExport";
import { Notice } from "@/components/ui";
import { todayStr } from "@/lib/daily";
import { num } from "@/lib/format";
import { AD_GROUP_NOTE, AD_PLAN_KEY, EMPTY_AD_PLAN, START_CHECKLIST, budgetOutlook, groupCandidates, planAds, type AdCandidate, type AdPlan, type BidInfo } from "@/lib/market/adPlan";
import { KEYWORD_NAV_KEY, KEYWORD_VOLUMES_KEY, normalizeKeyword, type KeywordNavData, type VolumeMap } from "@/lib/market/keywordNav";
import { keywordSummaries } from "@/lib/market/rank";
import { getStore } from "@/lib/storage";

const HELPER = process.env.NEXT_PUBLIC_HELPER_URL || "http://127.0.0.1:4599";
const AD_BIDS_KEY = "ad_bids_v1";
type BidMap = Record<string, BidInfo & { at: string }>;

const VERDICT_CLS = { 추천: "bg-emerald-100 text-emerald-800", 보류: "bg-stone-200 text-stone-700", 나중: "bg-amber-100 text-amber-800" } as const;

// 광고 노트 — 시작안. 파워링크를 아직 안 켠 상태에서 "어느 키워드부터, 얼마로" 를 묶음별로 고르고 기록한다.
// 광고를 만들거나 켜는 건 네이버 광고 화면에서 사장님이 직접. 여기는 계획·기록·(켠 뒤) 성적만.
export default function AdPlanPage() {
  const exp = useExport();
  const today = todayStr();
  const [data, setData] = useState<KeywordNavData | null>(null);
  const [volumes, setVolumes] = useState<VolumeMap>({});
  const [bids, setBids] = useState<BidMap>({});
  const [plan, setPlan] = useState<AdPlan>(EMPTY_AD_PLAN);
  const [checks, setChecks] = useState<boolean[]>(START_CHECKLIST.map(() => false));
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "error" | "info"; text: string } | null>(null);
  const [logText, setLogText] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const store = getStore();
    void Promise.all([store.getSetting<KeywordNavData>(KEYWORD_NAV_KEY), store.getSetting<VolumeMap>(KEYWORD_VOLUMES_KEY), store.getSetting<BidMap>(AD_BIDS_KEY), store.getSetting<AdPlan & { checks?: boolean[] }>(AD_PLAN_KEY)]).then(([d, v, b, p]) => {
      setData(d ?? null);
      setVolumes(v ?? {});
      setBids(b ?? {});
      if (p) {
        setPlan({ ...EMPTY_AD_PLAN, ...p });
        if (p.checks) setChecks(START_CHECKLIST.map((_, i) => p.checks?.[i] ?? false));
      }
      setLoaded(true);
    });
  }, []);

  const savePlan = (next: AdPlan, nextChecks = checks) => {
    setPlan(next);
    void getStore().saveSetting(AD_PLAN_KEY, { ...next, checks: nextChecks }).catch(() => {});
  };
  const saveChecks = (c: boolean[]) => {
    setChecks(c);
    void getStore().saveSetting(AD_PLAN_KEY, { ...plan, checks: c }).catch(() => {});
  };

  const ranks = useMemo(() => {
    const out: Record<string, number | null> = {};
    if (exp.rank) for (const s of keywordSummaries(exp.rank.history)) if (s.latestDate) out[s.keyword] = s.rank;
    return out;
  }, [exp.rank]);

  const cands = useMemo(() => (data ? planAds(data, volumes, bids, ranks, { minVolume: 50, limit: 80 }) : []), [data, volumes, bids, ranks]);
  const groups = useMemo(() => groupCandidates(cands), [cands]);
  const needBids = cands.filter((c) => !(c.keyword in bids)).map((c) => c.keyword);
  const needStats = cands.filter((c) => !volumes[c.keyword]?.comp).map((c) => c.keyword);
  const outlook = budgetOutlook(plan);
  const inPlan = (k: string) => plan.items.some((i) => normalizeKeyword(i.keyword) === k);

  // 후보 키워드의 광고 통계(경쟁·광고 클릭)와 예상 입찰가를 한 번에 받아온다 — 읽기만
  async function fetchAll() {
    setBusy(true);
    setMsg({ tone: "info", text: `네이버에 후보 ${cands.length}개의 광고 통계·예상 입찰가를 묻는 중… (20~40초)` });
    try {
      const keys = cands.slice(0, 60).map((c) => c.keyword);
      if (needStats.length) {
        const r1 = await fetch(`${HELPER}/keyword-volume`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keywords: keys.filter((k) => needStats.includes(k)).slice(0, 100) }) });
        const j1 = (await r1.json()) as { ok: boolean; message?: string; exact?: { keyword: string; pc: number; mobile: number; total: number; under10: boolean; comp?: string | null; adClicks?: number | null; adDepth?: number | null }[] };
        if (!j1.ok) throw new Error(j1.message ?? "광고 통계를 읽지 못했어요.");
        const next: VolumeMap = { ...volumes };
        for (const v of j1.exact ?? []) next[v.keyword] = { total: v.total, pc: v.pc, mobile: v.mobile, under10: v.under10, at: today, comp: v.comp ?? null, adClicks: v.adClicks ?? null, adDepth: v.adDepth ?? null };
        setVolumes(next);
        void getStore().saveSetting(KEYWORD_VOLUMES_KEY, next).catch(() => {});
      }
      const r2 = await fetch(`${HELPER}/keyword-bid`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keywords: keys }) });
      const j2 = (await r2.json()) as { ok: boolean; message?: string; bids?: { keyword: string; top1: number | null; minShow: number | null }[] };
      if (!j2.ok) throw new Error(j2.message ?? "예상 입찰가를 읽지 못했어요.");
      const nb: BidMap = { ...bids };
      for (const b of j2.bids ?? []) nb[b.keyword] = { top1: b.top1, minShow: b.minShow, at: today };
      setBids(nb);
      void getStore().saveSetting(AD_BIDS_KEY, nb).catch(() => {});
      setMsg({ tone: "ok", text: `${j2.bids?.length ?? 0}개 키워드의 예상 입찰가를 받았어요. 아래 표가 새 숫자로 정렬됐어요.` });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "도우미에 연결하지 못했어요. 리뷰 수집기 폴더에서 npm run helper 를 켜 주세요." });
    } finally {
      setBusy(false);
    }
  }

  const toggle = (c: AdCandidate) => {
    if (inPlan(c.keyword)) savePlan({ ...plan, items: plan.items.filter((i) => normalizeKeyword(i.keyword) !== c.keyword) });
    else savePlan({ ...plan, items: [...plan.items, { keyword: c.keyword, group: c.group, bid: c.bid.minShow ?? c.bid.top1 ?? null, status: "예정" }] });
  };
  const addRecommended = () => {
    const picks = cands.filter((c) => c.verdict === "추천" && !inPlan(c.keyword)).slice(0, 12);
    savePlan({ ...plan, items: [...plan.items, ...picks.map((c) => ({ keyword: c.keyword, group: c.group, bid: c.bid.minShow ?? c.bid.top1 ?? null, status: "예정" as const }))] });
  };
  const addLog = (text: string) => {
    if (!text.trim()) return;
    savePlan({ ...plan, log: [...plan.log, { date: today, text: text.trim() }] });
    setLogText("");
  };

  if (!loaded || !exp.loaded) return <p className="py-10 text-center text-sm text-stone-500">불러오는 중…</p>;

  return (
    <>
      <section className="card space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">
            광고 노트 — 시작안
            <SourceTag from="카페스이" />
            <SourceTag from="배민아카데미" />
          </h2>
          <span className="flex gap-3 text-xs font-semibold">
            <Link href="/market/keywords" className="text-orange-700 underline">
              키워드 네비게이션 →
            </Link>
            <Link href="/market" className="text-stone-600 underline">
              ← 상권 탭
            </Link>
          </span>
        </div>
        <p className="text-sm text-stone-600">
          파워링크를 아직 안 켠 상태예요. 키워드 네비게이션의 검색수에 <b>광고 경쟁 · 광고 클릭 수 · 예상 입찰가</b>를 붙여서, <b>동네 메뉴 → 동네 상황 → 랜드마크 → 넓은 지역</b> 순서로 어느 키워드부터 얼마로 시작할지 골라요. 광고를 만들고 켜는 건 네이버 광고 화면에서 사장님이 직접 하고, 켠 뒤엔 여기에 성적이 붙어요.
        </p>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      </section>

      {!data ? (
        <Notice tone="info">
          먼저 <Link href="/market/keywords" className="font-semibold underline">키워드 네비게이션</Link>에 교육 엑셀을 올려 주세요. 그 키워드·검색수를 재료로 써요.
        </Notice>
      ) : (
        <>
          {/* 재료 */}
          <section className="card space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold">① 재료 받아오기</h2>
              <button className="btn-primary" disabled={busy || cands.length === 0} onClick={() => void fetchAll()}>
                {busy ? "묻는 중…" : needBids.length || needStats.length ? `후보 ${Math.min(cands.length, 60)}개 광고 통계·입찰가 받아오기` : "다시 받아오기 (숫자 새로)"}
              </button>
            </div>
            <p className="num text-xs text-stone-600">
              후보 {cands.length}개 (검색수 50 이상인 우리 키워드) · 입찰가 있는 것 {cands.length - needBids.length}개 · 광고 통계 있는 것 {cands.length - needStats.length}개
            </p>
            <p className="text-xs text-stone-500">네이버 검색광고 "예상 입찰가"를 읽기만 해요. 광고는 만들지 않아요. 입찰가는 그날그날 바뀌니 켜기 직전에 한 번 더 받아오세요.</p>
          </section>

          {/* 묶음별 후보 */}
          <section className="card space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-bold">② 묶음별 후보 — 어느 키워드부터</h2>
              <div className="flex items-center gap-2">
                <button className="btn-ghost px-3 py-1 text-xs" onClick={addRecommended} disabled={!cands.some((c) => c.verdict === "추천" && !inPlan(c.keyword))}>
                  "추천" 전부 시작안에 넣기 (최대 12개)
                </button>
                <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "보류·나중 접기" : "보류·나중도 보기"}
                </button>
              </div>
            </div>
            {groups.map((g) => {
              const items = showAll ? g.items : g.items.filter((c) => c.verdict === "추천");
              if (!items.length) return null;
              return (
                <div key={g.group}>
                  <p className="text-sm font-semibold">
                    {g.group} <span className="text-xs font-normal text-stone-500">— {AD_GROUP_NOTE[g.group]}</span>
                  </p>
                  <div className="mt-1 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-stone-500">
                        <tr>
                          <th className="py-1">키워드</th>
                          <th className="text-right">검색수</th>
                          <th className="text-center">경쟁</th>
                          <th className="text-right">광고 수</th>
                          <th className="text-right">최소 입찰가</th>
                          <th className="text-right">1위 입찰가</th>
                          <th className="text-right">자연 순위</th>
                          <th className="text-center">판단</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {items.map((c) => (
                          <tr key={c.keyword} className={inPlan(c.keyword) ? "bg-orange-50" : ""}>
                            <td className="py-1 font-semibold" title={c.reason}>
                              {c.keyword}
                            </td>
                            <td className="num text-right">{num(c.volume)}</td>
                            <td className="text-center text-xs">{c.comp ?? <span className="text-stone-300">?</span>}</td>
                            <td className="num text-right">{c.adDepth ?? <span className="text-stone-300">?</span>}</td>
                            <td className="num text-right">{c.bid.minShow === null ? <span className="text-stone-300">?</span> : `${num(c.bid.minShow)}원`}</td>
                            <td className="num text-right">{c.bid.top1 === null ? <span className="text-stone-300">?</span> : `${num(c.bid.top1)}원`}</td>
                            <td className="num text-right">{c.measured ? (c.organicRank === null ? "밖" : `${c.organicRank}위`) : <span className="text-stone-300">–</span>}</td>
                            <td className="text-center">
                              <span title={c.reason} className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${VERDICT_CLS[c.verdict]}`}>
                                {c.verdict}
                              </span>
                            </td>
                            <td className="text-right">
                              <button className={`px-2 py-0.5 text-[11px] ${inPlan(c.keyword) ? "text-stone-500 underline" : "btn-ghost"}`} onClick={() => toggle(c)}>
                                {inPlan(c.keyword) ? "빼기" : "시작안에"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-stone-500">
              경쟁은 광고 기준(낮음·중간·높음), 광고 수는 그 검색 결과에 보통 뜨는 광고 개수예요. "최소 입찰가"는 모바일에서 광고가 보이기 시작하는 금액, "1위 입찰가"는 맨 위에 뜨는 금액. 판단에 마우스를 올리면 이유가 보여요. 자연 순위가 3위 안이면 공짜 노출이 있어 보류로 둬요.
            </p>
          </section>

          {/* 내 시작안 */}
          <section className="card space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-bold">③ 내 시작안</h2>
              <label className="num flex items-center gap-2 text-sm">
                하루 예산
                <input className="field w-28 text-right" type="number" step={1000} min={1000} value={plan.dailyBudget} onChange={(e) => savePlan({ ...plan, dailyBudget: Math.max(0, Number(e.target.value) || 0) })} />원
              </label>
            </div>
            {plan.items.length === 0 ? (
              <Notice tone="info">위 표에서 "시작안에"를 눌러 키워드를 담아 주세요. 보통 동네 메뉴 4~6개 + 동네 상황 3~4개 + 랜드마크 2~3개면 충분해요.</Notice>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-stone-500">
                      <tr>
                        <th className="py-1">키워드</th>
                        <th>묶음(광고그룹)</th>
                        <th className="text-right">입찰가</th>
                        <th className="text-center">상태</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {plan.items.map((it, i) => (
                        <tr key={it.keyword}>
                          <td className="py-1 font-semibold">{it.keyword}</td>
                          <td className="text-xs">{it.group}</td>
                          <td className="num text-right">
                            <input className="field w-24 text-right" type="number" step={10} value={it.bid ?? ""} placeholder="?" onChange={(e) => savePlan({ ...plan, items: plan.items.map((x, j) => (j === i ? { ...x, bid: e.target.value === "" ? null : Number(e.target.value) } : x)) })} />
                          </td>
                          <td className="text-center">
                            <select className="field w-20 px-1 py-1 text-xs" value={it.status} onChange={(e) => savePlan({ ...plan, items: plan.items.map((x, j) => (j === i ? { ...x, status: e.target.value as AdPlan["items"][number]["status"] } : x)) })}>
                              <option>예정</option>
                              <option>켬</option>
                              <option>꺼둠</option>
                            </select>
                          </td>
                          <td className="text-right">
                            <button className="px-2 py-0.5 text-[11px] text-stone-500 underline" onClick={() => savePlan({ ...plan, items: plan.items.filter((_, j) => j !== i) })}>
                              빼기
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl bg-stone-50 px-3 py-2">
                    <p className="text-xs font-semibold text-stone-500">평균 입찰가</p>
                    <p className="num mt-0.5 text-lg font-bold">{outlook.avgBid === null ? "–" : `${num(outlook.avgBid)}원`}</p>
                  </div>
                  <div className="rounded-xl bg-stone-50 px-3 py-2">
                    <p className="text-xs font-semibold text-stone-500">하루 예산으로 받을 클릭 (거칠게)</p>
                    <p className="num mt-0.5 text-lg font-bold">{outlook.clicksPerDay === null ? "–" : `약 ${num(outlook.clicksPerDay)}번`}</p>
                  </div>
                  <div className="rounded-xl bg-orange-50 px-3 py-2">
                    <p className="text-xs font-semibold text-stone-500">한 달 최대 광고비</p>
                    <p className="num mt-0.5 text-lg font-bold">{num(outlook.monthCost)}원</p>
                  </div>
                </div>
                <p className="text-xs text-stone-500">클릭 수는 입찰가로만 거칠게 어림한 거예요. 실제로는 하루 예산을 다 못 쓰는 날이 많아요(검색이 적으면). 켜고 2주 뒤 실제 숫자로 바꿔요.</p>
              </>
            )}
          </section>

          {/* 시작 체크리스트 + 기록 */}
          <section className="card space-y-3">
            <h2 className="text-base font-bold">④ 켜는 날 할 일 · 바꾼 기록</h2>
            <ul className="space-y-1">
              {START_CHECKLIST.map((t, i) => (
                <li key={i}>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-0.5" checked={checks[i]} onChange={(e) => saveChecks(checks.map((v, j) => (j === i ? e.target.checked : v)))} />
                    <span className={checks[i] ? "text-stone-400 line-through" : ""}>{t}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              {plan.startedAt ? (
                <span className="num text-sm text-emerald-800">광고 켠 날 {plan.startedAt} · {Math.floor((Date.parse(today) - Date.parse(plan.startedAt)) / 86_400_000)}일째</span>
              ) : (
                <button
                  className="btn-primary"
                  onClick={() => {
                    if (!window.confirm("네이버 광고에서 파워링크를 켰나요? 켠 날을 기록해요 (장부 메모만, 네이버는 바뀌지 않아요).")) return;
                    savePlan({ ...plan, startedAt: today, items: plan.items.map((i) => (i.status === "예정" ? { ...i, status: "켬" } : i)), log: [...plan.log, { date: today, text: `파워링크 시작 — 키워드 ${plan.items.length}개, 하루 ${num(plan.dailyBudget)}원` }] });
                  }}
                >
                  오늘 광고 켰어요
                </button>
              )}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addLog(logText);
              }}
            >
              <input className="field" placeholder="바꾼 것 한 줄 — 예: 청주닭갈비 입찰가 630→500" value={logText} onChange={(e) => setLogText(e.target.value)} maxLength={80} />
              <button className="btn-ghost shrink-0 px-3" type="submit" disabled={!logText.trim()}>
                기록
              </button>
            </form>
            {plan.log.length > 0 && (
              <ul className="num space-y-0.5 text-sm text-stone-700">
                {[...plan.log].reverse().map((l, i) => (
                  <li key={i}>
                    <span className="text-xs text-stone-400">{l.date}</span> {l.text}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card space-y-1">
            <h2 className="text-base font-bold">⑤ 성적 <span className="text-xs font-normal text-stone-500">켠 뒤 2주부터</span></h2>
            <p className="text-sm text-stone-600">
              광고를 켜면 다음 단계에서 도우미가 밤마다 키워드별 <b>노출 · 클릭 · 광고비 · 클릭 1번 값</b>을 읽어 와 여기에 붙여요(카페스이 광고 노트의 "기간별 성적·광고그룹별·파워링크 키워드" 표). 평소 4주와 비교해 위험·주의·제안도 그때 나와요. 지금은 켜기 전이라 비어 있어요.
            </p>
          </section>
        </>
      )}
    </>
  );
}
