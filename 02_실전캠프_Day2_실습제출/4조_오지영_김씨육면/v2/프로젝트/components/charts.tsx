"use client";

import { shortWon } from "./ui";

/** KPI 스파크라인. 값이 2개 미만이면 그리지 않는다. */
export function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) {
    return (
      <div className="spark" style={{ display: "flex", alignItems: "center" }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)" }}>
          지난달 데이터가 쌓이면 추이가 보입니다
        </span>
      </div>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${(i * 100) / (values.length - 1)},${38 - ((v - min) / span) * 36}`)
    .join(" ");
  return (
    <div className="spark">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
        <polyline
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

export interface Slice {
  label: string;
  value: number;
  color: string;
}

export function Donut({
  slices,
  centerTop,
  centerBottom,
}: {
  slices: Slice[];
  centerTop: string;
  centerBottom: string;
}) {
  const total = slices.reduce((a, b) => a + b.value, 0) || 1;
  const C = 2 * Math.PI * 45;
  let acc = 0;
  return (
    <>
      <svg viewBox="0 0 120 120" role="img" aria-label={slices.map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`).join(", ")}>
        <g transform="rotate(-90 60 60)" fill="none" strokeWidth="13">
          <circle cx="60" cy="60" r="45" stroke="var(--line-2)" />
          {slices.map((s) => {
            const len = (s.value / total) * C;
            const off = -acc;
            acc += len;
            return (
              <circle
                key={s.label}
                cx="60"
                cy="60"
                r="45"
                stroke={s.color}
                strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`}
                strokeDashoffset={off.toFixed(2)}
              />
            );
          })}
        </g>
        <text x="60" y="58" textAnchor="middle" fontSize="17" fontWeight="900" fill="var(--ink)" letterSpacing="-.5">
          {centerTop}
        </text>
        <text x="60" y="72" textAnchor="middle" fontSize="8" fontWeight="800" fill="var(--muted)" letterSpacing="1">
          {centerBottom}
        </text>
      </svg>
      <div className="legend">
        {slices.map((s) => (
          <span className="lg" key={s.label}>
            <i style={{ background: s.color }} />
            {s.label}
            <span className="v num">{shortWon(s.value)}</span>
            <span className="p">{Math.round((s.value / total) * 100)}%</span>
          </span>
        ))}
      </div>
    </>
  );
}

export interface Bar {
  label: string;
  value: number;
  ratio: number;
  color: string;
}

export function BarChart({ bars }: { bars: Bar[] }) {
  if (!bars.length) return null;
  const max = Math.max(...bars.map((b) => b.value)) || 1;
  const n = bars.length;
  const slot = 440 / n;
  const w = Math.min(56, slot - 16);
  return (
    <svg viewBox="0 0 440 180" role="img" aria-label={bars.map((b) => `${b.label} ${shortWon(b.value)}`).join(", ")}>
      <line x1="0" y1="140" x2="440" y2="140" stroke="var(--line-2)" strokeWidth="1" />
      {bars.map((b, i) => {
        const h = Math.max(6, (b.value / max) * 122);
        const x = i * slot + (slot - w) / 2;
        const y = 140 - h;
        return (
          <g key={b.label}>
            <rect x={x} y={y} width={w} height={h} rx="9" fill={b.color} />
            <text x={x + w / 2} y={y - 6} fontSize="10" fontWeight="800" fill="var(--ink)" textAnchor="middle">
              {shortWon(b.value)}
            </text>
            <text x={x + w / 2} y="158" fontSize="10" fontWeight="700" fill="var(--muted)" textAnchor="middle">
              {b.label}
            </text>
            <text x={x + w / 2} y="172" fontSize="10" fontWeight="700" fill="var(--muted)" textAnchor="middle">
              {(b.ratio * 100).toFixed(1)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export interface TrendPoint {
  month: string;
  revenue: number;
  expense: number;
}

export function TrendChart({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) return null;
  const all = points.flatMap((p) => [p.revenue, p.expense]);
  const max = Math.max(...all, 1);
  const step = 440 / (points.length - 1);
  const x = (i: number) => 70 + i * step;
  const y = (v: number) => 172 - (v / max) * 150;
  const line = (k: "revenue" | "expense") => points.map((p, i) => `${x(i)},${y(p[k]).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ f, v: max * f }));

  return (
    <svg viewBox="0 0 530 210" role="img" aria-label="월별 매출·비용 추이">
      <g stroke="var(--line-2)" strokeWidth="1">
        {ticks.map((t) => (
          <line key={t.f} x1="64" y1={y(t.v)} x2="520" y2={y(t.v)} />
        ))}
      </g>
      <g fontSize="10" fontWeight="700" fill="var(--muted)" textAnchor="end">
        {ticks.map((t) => (
          <text key={t.f} x="58" y={y(t.v) + 4}>{shortWon(t.v)}</text>
        ))}
      </g>
      <polyline points={line("expense")} fill="none" stroke="var(--violet)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5 4" />
      <polyline points={line("revenue")} fill="none" stroke="var(--info)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) =>
        i === points.length - 1 ? (
          <circle key={p.month} cx={x(i)} cy={y(p.revenue)} r="6" fill="var(--info)" />
        ) : (
          <circle key={p.month} cx={x(i)} cy={y(p.revenue)} r="3.5" fill="var(--card)" stroke="var(--info)" strokeWidth="2.5" />
        )
      )}
      <g fontSize="10.5" fontWeight="700" fill="var(--muted)" textAnchor="middle">
        {points.map((p, i) => (
          <text key={p.month} x={x(i)} y="196" fill={i === points.length - 1 ? "var(--ink)" : undefined} fontWeight={i === points.length - 1 ? 800 : 700}>
            {Number(p.month.slice(5))}월
          </text>
        ))}
      </g>
    </svg>
  );
}

export interface MonthBar {
  label: string;
  revenue: number;
  expense: number;
  profit: number;
  hasData: boolean;
}

/** 연간 — 월별 매출·비용 막대. 둘 사이 간격이 곧 영업이익이다. */
export function MonthlyChart({ months }: { months: MonthBar[] }) {
  const max = Math.max(...months.map((m) => Math.max(m.revenue, m.expense)), 1);
  const W = 760;
  const H = 250;
  const base = 196;
  const slot = W / months.length;
  const bw = Math.min(16, slot / 3);
  const h = (v: number) => Math.max(v > 0 ? 3 : 0, (v / max) * 158);
  const ticks = [0, 0.5, 1].map((f) => ({ f, v: max * f }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="월별 매출과 비용">
      <g stroke="var(--line-2)" strokeWidth="1">
        {ticks.map((t) => (
          <line key={t.f} x1="58" y1={base - h(t.v)} x2={W} y2={base - h(t.v)} />
        ))}
      </g>
      <g fontSize="10" fontWeight="700" fill="var(--muted)" textAnchor="end">
        {ticks.map((t) => (
          <text key={t.f} x="52" y={base - h(t.v) + 4}>
            {shortWon(t.v)}
          </text>
        ))}
      </g>
      {months.map((m, i) => {
        const cx = 58 + i * ((W - 62) / months.length) + (W - 62) / months.length / 2;
        if (!m.hasData) {
          return (
            <text key={m.label} x={cx} y={base + 18} fontSize="10" fontWeight="700" fill="var(--line-2)" textAnchor="middle">
              {m.label}
            </text>
          );
        }
        const rh = h(m.revenue);
        const eh = h(m.expense);
        const up = m.profit >= 0;
        return (
          <g key={m.label}>
            <rect x={cx - bw - 2} y={base - rh} width={bw} height={rh} rx="4" fill="var(--info)" />
            <rect x={cx + 2} y={base - eh} width={bw} height={eh} rx="4" fill="var(--violet)" />
            <text
              x={cx}
              y={base - Math.max(rh, eh) - 7}
              fontSize="9.5"
              fontWeight="800"
              fill={up ? "var(--primary)" : "var(--danger)"}
              textAnchor="middle"
            >
              {shortWon(m.profit)}
            </text>
            <text x={cx} y={base + 18} fontSize="10" fontWeight="700" fill="var(--ink)" textAnchor="middle">
              {m.label}
            </text>
          </g>
        );
      })}
      <g fontSize="10" fontWeight="700" textAnchor="middle" fill="var(--muted)">
        <text x={W / 2} y={base + 40}>막대 위 숫자는 영업이익</text>
      </g>
    </svg>
  );
}
