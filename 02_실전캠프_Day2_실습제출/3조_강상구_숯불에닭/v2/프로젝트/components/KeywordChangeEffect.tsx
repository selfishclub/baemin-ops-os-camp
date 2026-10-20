"use client";

import { useMemo, useState } from "react";
import type { RankExport } from "@/lib/export/types";
import { changeEffect, type ChangeEffectRow, type PlaceKeywords } from "@/lib/market/rank";

// 상권 탭 — 대표 키워드를 바꾼 뒤 효과. 바꾼 날까지의 마지막 순위와 그 뒤 가장 최근 순위를 비교한다.
//  넣은 말이 들어간 키워드는 올라야 하고, 뺀 말이 들어간 키워드는 내려갈 수 있다.
//  "그대로"인 키워드(대조군)가 같이 움직였으면 키워드 때문이 아니라 다른 이유(리뷰·계절)일 수 있다.
const md = (d: string | null) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "–");
const rk = (r: number | null, has: boolean) => (!has ? "–" : r === null ? "50위 밖" : `${r}위`);

function Delta({ d }: { d: number | null }) {
  if (d === null) return <span className="text-stone-400">–</span>;
  if (d === 0) return <span className="text-stone-500">그대로</span>;
  return <span className={d > 0 ? "font-bold text-emerald-700" : "font-bold text-red-700"}>{d > 0 ? `▲${d}` : `▼${-d}`}</span>;
}

export function KeywordChangeEffect({ rank, pk }: { rank: RankExport | null; pk: PlaceKeywords }) {
  const changes = pk.changes ?? [];
  const [idx, setIdx] = useState(changes.length - 1);
  const change = changes[idx] ?? null;
  const eff = useMemo(() => (rank && change ? changeEffect(rank.history, change, rank.keywords) : null), [rank, change]);
  if (!change) return null;

  const watched = eff ? eff.rows.filter((r) => r.kind !== "그대로") : [];
  const control = eff ? eff.rows.filter((r) => r.kind === "그대로" && r.delta !== null) : [];
  const up = control.filter((r) => (r.delta ?? 0) > 0).length;
  const down = control.filter((r) => (r.delta ?? 0) < 0).length;
  const order = (r: ChangeEffectRow) => (r.kind === "넣은 말" ? 0 : 1);

  return (
    <div className="space-y-2 rounded-xl bg-stone-50 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">
          바꾼 뒤 효과 <span className="num text-xs font-normal text-stone-500">{md(change.date)} 바꿈{eff?.days != null ? ` · ${eff.days}일째` : " · 아직 바꾼 뒤 측정 전"}</span>
        </p>
        {changes.length > 1 && (
          <select className="field w-auto py-1 text-xs" value={idx} onChange={(e) => setIdx(Number(e.target.value))} aria-label="바꾼 기록 고르기">
            {changes.map((c, i) => (
              <option key={i} value={i}>
                {c.date} 바꿈
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="text-xs text-stone-600">
        뺀 말 <b>{change.removed.join(" · ") || "없음"}</b> → 넣은 말 <b className="text-emerald-800">{change.added.join(" · ") || "없음"}</b>
        {change.note && <span className="text-stone-500"> — {change.note}</span>}
      </p>
      {!rank ? (
        <p className="text-xs text-stone-500">순위 측정 자료가 오면 보여 드려요.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="py-1">키워드</th>
                  <th>관계</th>
                  <th className="text-right">바꾸기 전</th>
                  <th className="text-right">지금</th>
                  <th className="text-right">변화</th>
                </tr>
              </thead>
              <tbody className="num divide-y divide-stone-100">
                {[...watched].sort((a, b) => order(a) - order(b)).map((r) => (
                  <tr key={r.keyword}>
                    <td className="py-1 font-semibold">{r.keyword}</td>
                    <td className={`text-xs ${r.kind === "넣은 말" ? "text-emerald-800" : "text-stone-500"}`}>{r.kind}</td>
                    <td className="text-right" title={r.beforeDate ?? ""}>{rk(r.before, !!r.beforeDate)}</td>
                    <td className="text-right" title={r.nowDate ?? ""}>{rk(r.now, !!r.nowDate)}</td>
                    <td className="text-right"><Delta d={r.delta} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {watched.length === 0 && <p className="text-xs text-stone-500">바꾼 말이 들어간 추적 키워드가 없어요. 넣은 말로 찾는 키워드(예: 동네이름+맛집)를 순위 카드에서 추가해 주세요.</p>}
          {control.length > 0 && (
            <p className="text-xs text-stone-600">
              대조군 — 안 바꾼 말 키워드 {control.length}개 중 <b className="text-emerald-700">{up}개 오름</b> · <b className="text-red-700">{down}개 내림</b>. 대조군도 같이 움직였으면 키워드보다 리뷰·계절 영향일 수 있어요.
            </p>
          )}
          {(eff?.days ?? 0) < 7 && <p className="text-xs text-amber-800">네이버에 반영되기까지 1~2주 걸려요. 그 전 숫자는 참고만 하세요.</p>}
        </>
      )}
    </div>
  );
}
