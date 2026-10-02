"use client";

import { useEffect, useState } from "react";
import { num, won } from "@/lib/format";
import type { Pnl } from "@/lib/pnl";
import { computeRatios, DEFAULT_RATIO_LIMITS, normalizeLimits, RATIO_LIMITS_KEY, type RatioLimits } from "@/lib/ratios";
import { getStore } from "@/lib/storage";

// 원가율·인건비율·프라임코스트·임대료율 — 기준선을 넘은 것만 빨갛게. 기준은 사장님이 고친다.
export function RatioCard({ pnl }: { pnl: Pnl }) {
  const [limits, setLimits] = useState<RatioLimits>(DEFAULT_RATIO_LIMITS);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RatioLimits>(DEFAULT_RATIO_LIMITS);

  useEffect(() => {
    getStore()
      .getSetting<RatioLimits>(RATIO_LIMITS_KEY)
      .then((v) => setLimits(normalizeLimits(v)))
      .catch(() => {});
  }, []);

  async function save() {
    const next = normalizeLimits(draft);
    setLimits(next);
    setEditing(false);
    await getStore().saveSetting(RATIO_LIMITS_KEY, next);
  }

  if (pnl.revenue <= 0) return null;
  const ratios = computeRatios(pnl, limits);
  const overCount = ratios.filter((r) => r.over).length;

  return (
    <section className="card space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">매출 대비 비율</h2>
        <button
          className="text-xs font-semibold text-stone-500 underline"
          onClick={() => {
            setDraft(limits);
            setEditing(!editing);
          }}
        >
          {editing ? "닫기" : "기준 고치기"}
        </button>
      </div>
      <p className="text-xs text-stone-500">{overCount > 0 ? `기준을 넘은 것 ${overCount}개 — 빨간 줄부터 보세요.` : "모두 사장님이 정한 기준 안이에요."}</p>

      <ul className="space-y-2.5">
        {ratios.map((r) => {
          const scale = Math.max(r.limit * 1.5, r.pct ?? 0, 1); // 막대 끝 = 기준의 1.5배 (넘으면 그만큼 늘림)
          return (
            <li key={r.key}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className={r.key === "prime" ? "font-bold" : ""}>
                  {r.label}
                  {r.estimated && <span className="ml-1 rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-bold text-violet-900">어림 포함</span>}
                </span>
                <span className="num">
                  <span className={`font-bold ${r.over ? "text-red-600" : "text-emerald-700"}`}>{r.pct === null ? "–" : `${r.pct.toFixed(1)}%`}</span>
                  <span className="ml-1.5 text-xs text-stone-500">기준 {r.limit}%</span>
                </span>
              </div>
              <div className="relative mt-1 h-2 rounded-full bg-stone-100" aria-hidden>
                <div className={`h-2 rounded-full ${r.over ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, ((r.pct ?? 0) / scale) * 100)}%` }} />
                <div className="absolute -top-0.5 h-3 w-0.5 bg-stone-700" style={{ left: `${(r.limit / scale) * 100}%` }} />
              </div>
              <p className="num mt-0.5 text-[11px] text-stone-500">
                {num(r.amount)}원{r.over && r.pct !== null && ` · 기준보다 ${won(((r.pct - r.limit) / 100) * pnl.revenue)} 많아요`}
              </p>
            </li>
          );
        })}
      </ul>

      <p className="text-[11px] text-stone-400">손익표 금액 ÷ 총매출이에요. 원가율 탭의 통장 원가율은 포스 매출로 나눠서 조금 달라요.</p>

      {editing && (
        <div className="space-y-2 rounded-xl bg-stone-50 p-3">
          <p className="text-xs text-stone-600">매출의 몇 %까지 괜찮은지 정해 주세요. 넘으면 빨갛게 보여요.</p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["cost", "원가율"],
                ["labor", "인건비율"],
                ["prime", "원가 + 인건비"],
                ["rent", "임대료율"],
              ] as [keyof RatioLimits, string][]
            ).map(([k, label]) => (
              <label key={k} className="text-xs text-stone-600">
                {label}
                <span className="mt-0.5 flex items-center gap-1">
                  <input
                    aria-label={`${label} 기준`}
                    inputMode="decimal"
                    className="field num text-right"
                    value={draft[k]}
                    onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })}
                  />
                  %
                </span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1 text-sm" onClick={() => setDraft(DEFAULT_RATIO_LIMITS)}>
              처음 값으로
            </button>
            <button className="btn-primary flex-1 text-sm" onClick={() => void save()}>
              저장
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
