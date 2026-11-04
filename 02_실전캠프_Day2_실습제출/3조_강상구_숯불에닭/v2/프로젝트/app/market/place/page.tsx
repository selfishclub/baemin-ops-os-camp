"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ExportStatusLine } from "@/components/ExportUploadCard";
import { SourceTag } from "@/components/SourceTag";
import { useExport } from "@/components/useExport";
import { Notice } from "@/components/ui";
import { todayStr } from "@/lib/daily";
import { EMPTY_PLACE_CARE, PLACE_CARE_KEY, ROUTINE_ITEMS, SETUP_ITEMS, WORK_KINDS, health14, rivalWords, routineDue, slotMismatch, wordCoverage, workEffect, type PlaceCare, type PlaceWork, type WorkKind } from "@/lib/market/placeCare";
import { EMPTY_PLACE_KEYWORDS, PLACE_KEYWORDS_KEY, type PlaceKeywords } from "@/lib/market/rank";
import { getStore } from "@/lib/storage";

// 상권 탭 하위 화면 — 플레이스를 어떻게 돌볼지. 순위 표는 상권 탭, 유입 표는 스마트플레이스 탭에 있고 여기는 "무엇을 할까"만 본다.
// 책에서 합법적으로 쓸 수 있는 부분만 옮겼다 (lib/market/placeCare.ts 머리말).
const TONE: Record<string, string> = { ok: "bg-emerald-50 text-emerald-900", warn: "bg-amber-50 text-amber-900", info: "bg-stone-50 text-stone-700" };
const VERDICT: Record<string, string> = { "둘 다 있음": "text-emerald-700", "소개글에 넣을 말": "font-bold text-orange-700", "리뷰에 없는 말": "text-sky-700", "둘 다 없음": "text-stone-400" };

export default function PlaceCarePage() {
  const exp = useExport();
  const [care, setCare] = useState<PlaceCare>(EMPTY_PLACE_CARE);
  const [pk, setPk] = useState<PlaceKeywords>(EMPTY_PLACE_KEYWORDS);
  const [wordInput, setWordInput] = useState("");
  const [draft, setDraft] = useState<{ date: string; kind: WorkKind; note: string }>({ date: todayStr(), kind: "소개글", note: "" });
  const today = todayStr();

  useEffect(() => {
    const store = getStore();
    void store.getSetting<PlaceCare>(PLACE_CARE_KEY).then((v) => v && setCare({ ...EMPTY_PLACE_CARE, ...v }));
    void store.getSetting<PlaceKeywords>(PLACE_KEYWORDS_KEY).then((v) => v && setPk({ ...EMPTY_PLACE_KEYWORDS, ...v }));
  }, []);

  const save = (next: PlaceCare) => {
    setCare(next);
    void getStore().saveSetting(PLACE_CARE_KEY, next).catch(() => {});
  };

  const history = exp.rank?.history;
  const inflow = exp.market?.inflow ?? null;
  const info = exp.rank?.placeInfo ?? null;
  const health = useMemo(() => (history ? health14(history, inflow, today) : null), [history, inflow, today]);
  const mineSlots = info?.mine.keywords ?? [];
  const mismatch = useMemo(() => slotMismatch(pk.slots, info?.mine.keywords ?? null), [pk.slots, info]);
  const rivals = useMemo(() => rivalWords(info, mineSlots).filter((r) => r.count >= 2), [info, mineSlots]);
  const coverage = useMemo(() => wordCoverage(care.words, info?.mine.description ?? null, exp.reviews, today), [care.words, info, exp.reviews, today]);
  const lastNaverReview = useMemo(() => exp.reviews.filter((r) => r.platform === "naver").reduce((m, r) => ((r.date ?? "") > m ? r.date ?? "" : m), ""), [exp.reviews]);
  const works = useMemo(() => [...care.work].sort((a, b) => b.date.localeCompare(a.date)), [care.work]);

  if (!exp.loaded) return <p className="py-10 text-center text-sm text-stone-500">불러오는 중…</p>;

  const descLength = info?.mine.description?.length ?? null;
  const addWork = () => {
    const work: PlaceWork = { id: `${Date.now()}`, date: draft.date, kind: draft.kind, note: draft.note.trim() };
    save({ ...care, work: [...care.work, work] });
    setDraft({ ...draft, note: "" });
  };

  return (
    <>
      <ExportStatusLine exp={exp} need="순위 · 플레이스 정보" />
      <div className="flex justify-between gap-2">
        <Link href="/market" className="btn-ghost text-sm">← 상권 탭</Link>
      </div>

      {/* 최근 14일 점검 */}
      <section className="card space-y-2">
        <h2 className="text-base font-bold">
          최근 14일 점검
          <SourceTag from="두더지" />
        </h2>
        {!health ? (
          <Notice tone="info">순위 기록이 14일 넘게 쌓이면 보여 드려요.</Notice>
        ) : (
          <>
            <p className="num text-xs text-stone-500">순위 {health.from} → {health.to} · 오름 {health.moves.up} · 내림 {health.moves.down} · 50위 밖으로 {health.moves.lost} · 안으로 {health.moves.gained} · 그대로 {health.moves.same}</p>
            <ul className="space-y-1 text-sm">
              {health.checks.map((c) => (
                <li key={c.label} className={`rounded-lg px-3 py-2 ${TONE[c.tone]}`}><b>{c.label}</b> · <span className="num">{c.text}</span></li>
              ))}
            </ul>
            {health.moves.lostWords.length > 0 && <p className="text-xs text-stone-600">50위 밖으로 나간 말: {health.moves.lostWords.slice(0, 12).join(", ")}{health.moves.lostWords.length > 12 ? ` 외 ${health.moves.lostWords.length - 12}개` : ""}</p>}
          </>
        )}
        <p className="text-xs text-stone-500">14일 단위는 책의 관찰이고 네이버 공식 발표는 아니에요.</p>
      </section>

      {/* 내 칸 vs 상위 가게 */}
      <section className="card space-y-3">
        <h2 className="text-base font-bold">
          대표 키워드 — 내 칸과 상위 가게
          <SourceTag from="두더지" />
        </h2>
        {!info ? (
          <Notice tone="info">아직 플레이스 정보가 없어요. 리뷰 수집기에서 <code>npm run place-info</code> → <code>npm run export:ledger</code> 를 돌려 주세요.</Notice>
        ) : (
          <>
            <div className="text-sm">
              <p className="text-xs font-semibold text-stone-500">네이버에 지금 올라간 칸 <span className="num font-normal">{info.date} 읽음</span></p>
              {info.mine.keywords ? (
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {info.mine.keywords.map((k) => <li key={k} className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold">{k}</li>)}
                </ul>
              ) : <p className="text-amber-800">{info.mine.note ?? "못 읽었어요."}</p>}
            </div>
            {mismatch && (mismatch.onlyLedger.length > 0 || mismatch.onlyNaver.length > 0) && pk.slots.some(Boolean) && (
              <Notice tone="warn">
                상권 탭에 적어 둔 칸과 달라요. 장부에만: {mismatch.onlyLedger.join(", ") || "없음"} · 네이버에만: {mismatch.onlyNaver.join(", ") || "없음"}. 상권 탭에서 칸을 고치고 "오늘 바꿨어요"를 누르면 효과 추적이 이어져요.
              </Notice>
            )}
            {rivals.length > 0 ? (
              <div>
                <p className="text-xs font-semibold text-stone-500">핵심 키워드 상위 가게 {info.places.length}곳에서 2곳 이상 쓰는 말 <span className="num font-normal">{info.placesDate} 읽음</span></p>
                <table className="mt-1 w-full text-sm">
                  <tbody className="divide-y divide-stone-100">
                    {rivals.slice(0, 15).map((r) => (
                      <tr key={r.word}>
                        <td className="py-1 font-semibold">{r.word}</td>
                        <td className="num w-12 text-right">{r.count}곳</td>
                        <td className="w-20 text-right text-xs">{r.inMine ? <span className="text-emerald-700">내 칸에 있음</span> : <span className="font-bold text-orange-700">내 칸에 없음</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-stone-500">2곳 이상 겹치는 말이 없어요.</p>}
            <details className="text-xs">
              <summary className="cursor-pointer font-semibold text-stone-600">가게별 대표 키워드 보기</summary>
              <ul className="mt-2 space-y-1">
                {info.places.map((p) => <li key={p.id}><b>{p.name}</b> <span className="text-stone-500">({p.from.map((f) => `${f.keyword} ${f.rank ?? "–"}위`).join(", ")})</span> — {p.keywords?.join(", ") || p.note || "없음"}</li>)}
              </ul>
            </details>
            <p className="text-xs text-stone-500">그대로 베끼지 말고 우리 가게에 실제로 맞는 말만 골라요. 한 칸에 한 단어가 네이버 안내이고, 여러 말을 붙인 칸은 반려될 수 있어요. 칸을 바꾸면 순위가 바로 움직이니 한 번에 한 칸씩요.</p>
          </>
        )}
      </section>

      {/* 소개글 · 리뷰 */}
      <section className="card space-y-2">
        <h2 className="text-base font-bold">
          그 말이 소개글과 손님 리뷰에 있나
          <SourceTag from="두더지" />
        </h2>
        {descLength !== null && (
          <p className="num text-sm">
            소개글 {descLength}자 <span className={descLength >= 700 && descLength <= 1500 ? "text-emerald-700" : "font-bold text-amber-800"}>(책 권장 700~1500자)</span>
            {info?.mine.road ? ` · 찾아오는 길 ${info.mine.road.length}자` : ""}
          </p>
        )}
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-stone-500">
            <tr><th className="py-1">말</th><th className="text-right">소개글</th><th className="text-right">리뷰</th><th className="text-right">최근 90일</th><th className="text-right">판단</th><th /></tr>
          </thead>
          <tbody className="num divide-y divide-stone-100">
            {coverage.map((c) => (
              <tr key={c.word}>
                <td className="py-1 font-semibold">{c.word}</td>
                <td className="text-right">{info?.mine.description ? c.inDescription : "–"}</td>
                <td className="text-right">{c.reviews}</td>
                <td className="text-right">{c.recentReviews}</td>
                <td className={`text-right text-xs ${VERDICT[c.verdict]}`}>{c.verdict}</td>
                <td className="w-6 text-right"><button type="button" className="text-stone-400" aria-label={`${c.word} 빼기`} onClick={() => save({ ...care, words: care.words.filter((w) => w !== c.word) })}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const w = wordInput.replace(/\s+/g, ""); if (w && !care.words.includes(w)) save({ ...care, words: [...care.words, w] }); setWordInput(""); }}>
          <input className="field min-w-0 flex-1" placeholder="찾아볼 말 더하기" value={wordInput} onChange={(e) => setWordInput(e.target.value)} />
          <button className="btn-ghost shrink-0 text-sm" type="submit">더하기</button>
        </form>
        <p className="text-xs text-stone-500">"소개글에 넣을 말"은 손님은 말하는데 소개글에 없는 말이에요. 실제 가능한 내용만 문장으로 넣어요. 네이버 리뷰만 셌어요{lastNaverReview ? ` (${lastNaverReview.slice(0, 10)}까지 수집)` : ""}.</p>
      </section>

      {/* 작업 기록 */}
      <section className="card space-y-3">
        <h2 className="text-base font-bold">
          플레이스 작업 기록과 전후 비교
          <SourceTag from="두더지" />
        </h2>
        <form className="grid gap-2 sm:grid-cols-[9rem_8rem_minmax(0,1fr)_auto]" onSubmit={(e) => { e.preventDefault(); addWork(); }}>
          <input type="date" aria-label="작업한 날" className="field" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} required />
          <select aria-label="작업 종류" className="field" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as WorkKind })}>
            {WORK_KINDS.map((k) => <option key={k}>{k}</option>)}
          </select>
          <input className="field min-w-0" placeholder="무엇을 바꿨나요" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          <button className="btn-primary" type="submit">기록</button>
        </form>
        {works.length === 0 ? (
          <p className="text-sm text-stone-500">아직 기록이 없어요. 소개글·사진·소식을 바꾼 날을 적으면 순위와 유입을 전후로 비교해 드려요.</p>
        ) : (
          <ul className="divide-y divide-stone-100 text-sm">
            {works.map((w) => {
              const e = workEffect(w, care.work, history ?? [], inflow);
              return (
                <li key={w.id} className="space-y-0.5 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <p><span className="num">{w.date}</span> · <b>{w.kind}</b>{w.note && ` — ${w.note}`}</p>
                    <button type="button" className="shrink-0 text-xs text-stone-400" onClick={() => save({ ...care, work: care.work.filter((x) => x.id !== w.id) })}>지우기</button>
                  </div>
                  {e.moves ? (
                    <p className="num text-xs text-stone-600">{e.days}일 뒤 순위: 오름 {e.moves.up + e.moves.gained} · 내림 {e.moves.down + e.moves.lost} · 그대로 {e.moves.same}{e.inflowBefore !== null && e.inflowAfter !== null ? ` · 유입 전 7일 ${e.inflowBefore}회 → 뒤 7일 ${e.inflowAfter}회` : ""}</p>
                  ) : <p className="text-xs text-stone-500">작업 뒤 순위 자료가 오면 비교해요.</p>}
                  {e.overlaps.length > 0 && <p className="text-xs text-amber-800">앞뒤 7일 안에 다른 작업이 있어 무엇 때문인지 가리기 어려워요: {e.overlaps.map((o) => `${o.date.slice(5)} ${o.kind}`).join(", ")}</p>}
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-stone-500">한 번에 하나씩 바꿔야 효과를 알 수 있어요. 대표 키워드는 상권 탭의 "오늘 바꿨어요"가 더 자세히 비교해요.</p>
      </section>

      {/* 세팅 · 루틴 */}
      <section className="card space-y-3">
        <h2 className="text-base font-bold">
          기본 세팅과 주기 루틴
          <SourceTag from="두더지" />
        </h2>
        <ul className="space-y-1.5 text-sm">
          {SETUP_ITEMS.map((s) => (
            <li key={s.id}>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" checked={!!care.setup[s.id]} onChange={(e) => save({ ...care, setup: { ...care.setup, [s.id]: e.target.checked } })} />
                <span><b>{s.label}</b> <span className="text-xs text-stone-500">{s.why}</span></span>
              </label>
            </li>
          ))}
        </ul>
        <ul className="divide-y divide-stone-100 text-sm">
          {ROUTINE_ITEMS.map((r) => {
            const last = care.routine[r.id];
            const due = routineDue(last, r.days, today);
            return (
              <li key={r.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="min-w-0"><b>{r.label}</b> <span className="num text-xs text-stone-500">{r.days}일마다 · {last ? `${last} 함` : "기록 없음"}</span><br /><span className="text-xs text-stone-500">{r.why}</span></span>
                <button type="button" className={`shrink-0 text-xs ${due ? "btn-primary" : "btn-ghost"}`} onClick={() => save({ ...care, routine: { ...care.routine, [r.id]: today } })}>{due ? "오늘 함" : "다시 함"}</button>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-stone-500">리워드 트래픽·리뷰 구매·같은 가게 중복 등록은 책에 나오지만 일부러 뺐어요. 네이버 정책 위반이고 제재 위험이 있어요. 리뷰에 대가를 걸면 표시·광고 문제가 될 수 있어요.</p>
      </section>
    </>
  );
}
