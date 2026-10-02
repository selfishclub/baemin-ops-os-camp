"use client";

import { useEffect, useState } from "react";
import { num } from "@/lib/format";
import { prevMonth } from "@/lib/month";
import { priceTrends, type PriceTrend } from "@/lib/costing/priceTrend";
import { PURCHASES_KEY_PREFIX, unitLabel, type Purchase } from "@/lib/costing/purchases";
import type { Item } from "@/lib/costing/types";
import { getStore } from "@/lib/storage";

const MONTHS = 6; // 고른 달 포함 최근 6개월 영수증

// 매입 단가 흐름 — 품목마다 언제 얼마에 샀나. 원가율이 오른 이유를 찾을 때 본다.
export function PriceTrendCard({ month, items }: { month: string; items: Item[] }) {
  const [trends, setTrends] = useState<PriceTrend[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);

  useEffect(() => {
    const months: string[] = [];
    for (let m = month, i = 0; i < MONTHS; i++, m = prevMonth(m)) months.push(m);
    Promise.all(months.map((m) => getStore().getSetting<Purchase[]>(PURCHASES_KEY_PREFIX + m)))
      .then((lists) => setTrends(priceTrends(lists.flatMap((l) => l ?? []), items)))
      .catch(() => setTrends([]));
  }, [month, items]);

  if (!trends) return null;
  const selected = trends.find((t) => t.item.id === pick) ?? trends.find((t) => t.points.length > 1) ?? trends[0];

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="text-base font-bold">매입 단가 흐름</h2>
        <p className="text-xs text-stone-500">최근 {MONTHS}개월 영수증 · 원가율 품목에 연결하고 수량을 적은 줄만 · 많이 산 품목부터</p>
      </div>
      {trends.length === 0 ? (
        <p className="rounded-lg bg-stone-50 px-2 py-2 text-sm text-stone-600">아직 볼 게 없어요. 영수증 줄을 품목에 연결하고 “품목 단위 수량”을 적으면 여기 단가 흐름이 생겨요.</p>
      ) : (
        <>
          {selected && <PriceLine trend={selected} />}
          <ul className="divide-y divide-stone-100">
            {trends.slice(0, 10).map((t) => {
              const up = (t.changePct ?? 0) > 0;
              return (
                <li key={t.item.id}>
                  <button className={`flex w-full items-baseline justify-between gap-2 py-2 text-left ${t.item.id === selected?.item.id ? "font-bold" : ""}`} onClick={() => setPick(t.item.id)}>
                    <span className="text-sm">
                      {t.item.name}
                      <span className="ml-1 text-[11px] font-normal text-stone-400">{t.points.length}번 삼</span>
                    </span>
                    <span className="num text-right text-xs">
                      {t.points.length > 1 ? `${num(t.first)} → ${num(t.last)}` : num(t.last)}원/{unitLabel(t.item.baseUnit)}
                      {t.changePct !== null && t.changePct !== 0 && (
                        <span className={`ml-1.5 font-bold ${up ? "text-red-600" : "text-emerald-700"}`}>
                          {up ? "▲" : "▼"}
                          {Math.abs(t.changePct).toFixed(1)}%
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-stone-400">줄을 누르면 위 그래프가 그 품목으로 바뀌어요. ▲는 처음 산 값보다 비싸진 것.</p>
        </>
      )}
    </section>
  );
}

// 한 품목의 매입 단가를 날짜 순서로 잇는 선. 점을 누르거나 마우스를 올리면 그날 거래처·단가.
function PriceLine({ trend }: { trend: PriceTrend }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 360;
  const H = 120;
  const padX = 18;
  const top = 18;
  const bottom = 20;
  const pts = trend.points;
  const t0 = Date.parse(pts[0].date);
  const t1 = Date.parse(pts[pts.length - 1].date);
  const lo = trend.min * 0.95;
  const hi = trend.max * 1.05 || 1;
  const x = (d: string) => (t1 === t0 ? W / 2 : padX + ((Date.parse(d) - t0) / (t1 - t0)) * (W - padX * 2));
  const y = (v: number) => top + ((hi - v) / (hi - lo || 1)) * (H - top - bottom);
  const unit = unitLabel(trend.item.baseUnit);
  const h = hover !== null ? pts[hover] : pts[pts.length - 1];
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

  return (
    <figure>
      <figcaption className="text-xs font-semibold text-stone-600">
        {trend.item.name} · {unit}당 단가
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${trend.item.name} 매입 단가 흐름`} onMouseLeave={() => setHover(null)}>
        <line x1={padX} x2={W - padX} y1={H - bottom} y2={H - bottom} stroke="#e7e5e4" strokeWidth={1} />
        <polyline points={pts.map((p) => `${x(p.date)},${y(p.unitCost)}`).join(" ")} fill="none" stroke="#ea580c" strokeWidth={2} strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} style={{ cursor: "pointer" }}>
            <circle cx={x(p.date)} cy={y(p.unitCost)} r={12} fill="transparent" />
            <circle cx={x(p.date)} cy={y(p.unitCost)} r={4} fill="#ea580c" stroke="#fff" strokeWidth={2} />
          </g>
        ))}
        {/* 처음·마지막 값만 직접 적는다 */}
        {[0, pts.length - 1].filter((i, k, a) => a.indexOf(i) === k).map((i) => (
          <text key={i} x={x(pts[i].date)} y={y(pts[i].unitCost) - 8} textAnchor={i === 0 && pts.length > 1 ? "start" : "end"} fontSize={9} fontWeight={700} fill="#44403c">
            {num(pts[i].unitCost)}
          </text>
        ))}
        <text x={padX} y={H - 5} fontSize={9} fill="#78716c">
          {md(pts[0].date)}
        </text>
        {pts.length > 1 && (
          <text x={W - padX} y={H - 5} textAnchor="end" fontSize={9} fill="#78716c">
            {md(pts[pts.length - 1].date)}
          </text>
        )}
      </svg>
      <p className="num rounded-lg bg-stone-50 px-2 py-1.5 text-xs text-stone-700">
        <b>{md(h.date)}</b> {h.vendor || "거래처 없음"} · {num(h.unitCost)}원/{unit} · {num(h.qty)}
        {unit} 삼
      </p>
    </figure>
  );
}
