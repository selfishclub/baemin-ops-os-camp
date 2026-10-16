"use client";

import { useMemo, useState } from "react";
import type { MarketArea } from "@/lib/export/types";
import { num } from "@/lib/format";
import { categoryTree, distanceM, isFoodStore, type AreaSummary } from "@/lib/market/area";

// 우리 동네 상세보기 — 반경 안 점포를 업종별 · 음식점 전체 · 같은 종류 · 변화로 펼쳐 본다. 가게에서 가까운 순.
type Tab = "food" | "same" | "category" | "change";

export function AreaDetail({ area, summary, sameWords }: { area: MarketArea; summary: AreaSummary; sameWords: string[] }) {
  const [tab, setTab] = useState<Tab>("food");
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const withDist = useMemo(() => area.stores.map((s) => ({ s, d: distanceM(area.center, s) })), [area]);
  const sameIds = useMemo(() => new Set(summary.same.map((x) => x.id)), [summary]);
  const tree = useMemo(() => categoryTree(area), [area]);

  const rows = useMemo(() => {
    const base = tab === "food" ? withDist.filter((x) => isFoodStore(x.s)) : tab === "same" ? withDist.filter((x) => sameIds.has(x.s.id)) : [];
    const needle = q.replace(/\s/g, "");
    const filtered = needle ? base.filter((x) => `${x.s.name}${x.s.mid ?? ""}${x.s.small ?? ""}${x.s.addr ?? ""}`.replace(/\s/g, "").includes(needle)) : base;
    return filtered.sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9) || a.s.name.localeCompare(b.s.name, "ko"));
  }, [tab, withDist, sameIds, q]);
  const visible = showAll ? rows : rows.slice(0, 30);

  const TABS: { key: Tab; label: string }[] = [
    { key: "food", label: `음식점 ${num(withDist.filter((x) => isFoodStore(x.s)).length)}` },
    { key: "same", label: `같은 종류 ${num(summary.same.length)}` },
    { key: "category", label: "업종별" },
    ...(summary.prev ? [{ key: "change" as Tab, label: `변화 +${summary.prev.opened.length} −${summary.prev.closed.length}` }] : []),
  ];

  return (
    <div className="rounded-xl bg-stone-50 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => (
          <button key={t.key} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tab === t.key ? "bg-orange-600 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200"}`} onClick={() => { setTab(t.key); setShowAll(false); }}>
            {t.label}
          </button>
        ))}
        {(tab === "food" || tab === "same") && <input className="field ml-auto w-44 px-2 py-1 text-xs" placeholder="이름·종류·주소 찾기" value={q} onChange={(e) => setQ(e.target.value)} />}
      </div>

      {(tab === "food" || tab === "same") && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="py-1">가게</th>
                  <th>종류</th>
                  <th className="text-right">거리</th>
                  <th>주소</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {visible.map(({ s, d }) => (
                  <tr key={s.id} className={sameIds.has(s.id) ? "bg-orange-50" : ""}>
                    <td className="whitespace-nowrap py-1 font-semibold">{s.name}</td>
                    <td className="whitespace-nowrap text-xs text-stone-600">{s.small ?? s.mid ?? "–"}</td>
                    <td className="num whitespace-nowrap text-right text-xs">{d === null ? "–" : `${num(d)}m`}</td>
                    <td className="truncate text-xs text-stone-500">{s.addr ?? ""}</td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-2 text-center text-xs text-stone-400">없어요</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {rows.length > 30 && (
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "접기" : `${rows.length - 30}곳 더 보기`}
            </button>
          )}
          <p className="text-xs text-stone-500">거리는 가게에서 직선으로 잰 거예요. 주황 줄은 같은 종류({sameWords.join("·")}) 가게.</p>
        </>
      )}

      {tab === "category" && (
        <div className="grid gap-2 sm:grid-cols-2">
          {tree.map((L) => (
            <details key={L.name} className="rounded-lg bg-white px-3 py-2 ring-1 ring-stone-200" open={L.name === "음식"}>
              <summary className="cursor-pointer text-sm font-semibold">
                {L.name} <span className="num text-xs font-normal text-stone-500">{num(L.count)}곳</span>
              </summary>
              <ul className="mt-1 space-y-0.5 text-xs text-stone-600">
                {L.children.map((M) => (
                  <li key={M.name}>
                    <span className="font-semibold">{M.name}</span> <span className="num">{num(M.count)}</span>
                    {M.children.length > 0 && <span className="text-stone-400"> — {M.children.slice(0, 6).map((S) => `${S.name} ${S.count}`).join(" · ")}{M.children.length > 6 ? " …" : ""}</span>}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}

      {tab === "change" && summary.prev && (
        <div className="grid gap-2 sm:grid-cols-2 text-sm">
          <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-stone-200">
            <p className="text-xs font-semibold text-emerald-700">새로 생긴 가게 {summary.prev.opened.length}곳 ({summary.prev.surveyedAt} 이후)</p>
            <ul className="mt-1 space-y-0.5 text-xs">{summary.prev.opened.map((x, i) => <li key={i}>{x.name} <span className="text-stone-400">{x.small ?? ""}</span></li>)}</ul>
          </div>
          <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-stone-200">
            <p className="text-xs font-semibold text-red-700">사라진 가게 {summary.prev.closed.length}곳</p>
            <ul className="mt-1 space-y-0.5 text-xs">{summary.prev.closed.map((x, i) => <li key={i}>{x.name} <span className="text-stone-400">{x.small ?? ""}</span></li>)}</ul>
          </div>
        </div>
      )}
    </div>
  );
}
