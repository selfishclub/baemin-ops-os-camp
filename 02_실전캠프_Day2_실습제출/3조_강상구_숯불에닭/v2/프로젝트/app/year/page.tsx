"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMonth } from "@/components/AppShell";
import { Notice } from "@/components/ui";
import { num, pctText, signed, won } from "@/lib/format";
import { loadMonthPnls } from "@/lib/monthPnl";
import { getStore } from "@/lib/storage";
import { summarizeYear, yearMonths, type YearMonth, type YearSummary } from "@/lib/yearSummary";

// 1년 한눈에 — 월별 매출·영업이익 막대, 비용 구성, 월별 표 (김씨육면 연간 대시보드에서 따옴).
// 계산은 손익 탭과 똑같다 (lib/monthPnl.ts).
export default function YearPage() {
  const { month, setMonth } = useMonth();
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  const [data, setData] = useState<YearSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null); // 마우스(손가락)가 올라간 달

  useEffect(() => {
    setData(null);
    loadMonthPnls(getStore(), yearMonths(year))
      .then((rows) => setData(summarizeYear(rows)))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [year]);

  if (error) return <Notice tone="error">{error}</Notice>;

  return (
    <>
      <section className="card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold">📅 1년 한눈에</h2>
          <div className="flex items-center gap-1">
            <button aria-label="이전 해" className="btn-ghost px-2.5 py-1.5" onClick={() => setYear(year - 1)}>
              ◀
            </button>
            <span className="num min-w-[4rem] text-center text-sm font-bold">{year}년</span>
            <button aria-label="다음 해" className="btn-ghost px-2.5 py-1.5" onClick={() => setYear(year + 1)}>
              ▶
            </button>
          </div>
        </div>
        {!data ? (
          <p className="py-6 text-center text-sm text-stone-500">불러오는 중…</p>
        ) : data.months.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone-500">{year}년 자료가 아직 없어요.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="누적 매출" value={won(data.revenue)} />
              <Stat label="누적 영업이익" value={won(data.profit)} sub={`이익률 ${pctText(data.margin)}`} tone={data.profit >= 0 ? "good" : "bad"} />
              <Stat label="내가 가져간 돈" value={won(data.ownerDraw)} />
              <Stat label="자료 있는 달" value={`${data.months.length}개월`} sub={`마감 ${data.months.filter((m) => m.closed).length}개월`} />
            </div>
            {data.estimated > 0 && <p className="text-[11px] text-violet-900">어림값 {won(data.estimated)}이 섞여 있어요 (급여·외상·고정비가 아직 통장에서 안 나간 달).</p>}
          </>
        )}
      </section>

      {data && data.months.length > 0 && (
        <>
          <section className="card space-y-4">
            <h2 className="text-base font-bold">월별 매출 · 영업이익</h2>
            <MonthBars year={year} months={data.months} pick={(m) => m.revenue} title="매출" hover={hover} setHover={setHover} />
            <MonthBars year={year} months={data.months} pick={(m) => m.profit} title="영업이익" hover={hover} setHover={setHover} signedColor />
            <HoverDetail month={data.months.find((m) => m.month === hover) ?? data.months[data.months.length - 1]} />
          </section>

          <section className="card space-y-2">
            <h2 className="text-base font-bold">한 해 비용 구성</h2>
            <p className="text-xs text-stone-500">매출 {won(data.revenue)} 중 어디로 나갔나 · 매출 대비 %</p>
            <ul className="space-y-2">
              {data.costByMajor.map((c) => (
                <li key={c.label}>
                  <div className="num flex justify-between text-sm">
                    <span>{c.label}</span>
                    <span>
                      {num(c.amount)} <span className="ml-1 text-xs text-stone-500">{pctText(c.pct)}</span>
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-stone-100" aria-hidden>
                    <div className="h-2 rounded-full bg-orange-500" style={{ width: `${Math.min(100, c.pct ?? 0)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="card space-y-2">
            <h2 className="text-base font-bold">많이 쓴 세부 항목</h2>
            <ol className="space-y-1">
              {data.topMinors.map((m, i) => (
                <li key={m.major + m.label} className="num flex justify-between text-sm">
                  <span>
                    <span className="mr-1.5 text-xs text-stone-400">{i + 1}</span>
                    {m.label} <span className="text-xs text-stone-400">({m.major})</span>
                  </span>
                  <span>{num(m.amount)}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="card space-y-2">
            <h2 className="text-base font-bold">월별 표</h2>
            <div className="-mx-1 overflow-x-auto">
              <table className="num w-full min-w-[30rem] text-right text-xs">
                <thead className="text-stone-500">
                  <tr>
                    <th className="py-1 text-left font-semibold">월</th>
                    <th className="font-semibold">매출</th>
                    <th className="font-semibold">영업이익</th>
                    <th className="font-semibold">이익률</th>
                    <th className="font-semibold">원가율</th>
                    <th className="font-semibold">인건비율</th>
                    <th className="font-semibold">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {data.months.map((m, i) => {
                    const prev = data.months[i - 1];
                    return (
                      <tr key={m.month}>
                        <td className="py-1.5 text-left">
                          <Link
                            href="/"
                            className="font-bold text-orange-700 underline"
                            onClick={() => setMonth(m.month)} // 그 달 손익 탭으로
                          >
                            {Number(m.month.slice(5))}월
                          </Link>
                        </td>
                        <td>{num(m.revenue)}</td>
                        <td className={m.profit >= 0 ? "text-emerald-700" : "text-red-600"}>
                          {num(m.profit)}
                          {prev && <span className="block text-[10px] text-stone-400">{signed(m.profit - prev.profit)}</span>}
                        </td>
                        <td>{pctText(m.margin)}</td>
                        <td>{pctText(m.costRate)}</td>
                        <td>{pctText(m.laborRate)}</td>
                        <td className="whitespace-nowrap">
                          {m.closed ? "✅ 마감" : "마감 전"}
                          {m.estimated > 0 && <span className="ml-1 rounded bg-violet-100 px-1 text-[10px] font-bold text-violet-900">어림</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-stone-400">월을 누르면 그 달 손익 탭으로 가요.</p>
          </section>
        </>
      )}
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl bg-stone-50 px-2.5 py-2">
      <p className="text-[11px] font-semibold text-stone-500">{label}</p>
      <p className={`num text-sm font-bold ${tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-600" : ""}`}>{value}</p>
      {sub && <p className="num text-[11px] text-stone-500">{sub}</p>}
    </div>
  );
}

// 1~12월 막대 하나짜리 그래프. 막대 끝만 둥글게, 0선에 붙여서. 영업이익은 손해(음수)면 아래로, 빨강 + 숫자에 ▼.
function MonthBars({
  year,
  months,
  pick,
  title,
  hover,
  setHover,
  signedColor = false,
}: {
  year: number;
  months: YearMonth[];
  pick: (m: YearMonth) => number;
  title: string;
  hover: string | null;
  setHover: (m: string | null) => void;
  signedColor?: boolean;
}) {
  const W = 360;
  const H = 110;
  const top = 14;
  const bottom = 16; // 월 글자 자리
  const slot = W / 12;
  const barW = Math.min(14, slot * 0.5);
  const values = months.map(pick);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const y = (v: number) => top + ((max - v) / span) * (H - top - bottom);
  const zero = y(0);
  const latest = months[months.length - 1];

  return (
    <figure>
      <figcaption className="mb-1 text-xs font-semibold text-stone-600">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${year}년 월별 ${title}`} onMouseLeave={() => setHover(null)}>
        <line x1={0} x2={W} y1={zero} y2={zero} stroke="#d6d3d1" strokeWidth={1} />
        {yearMonths(year).map((key, i) => {
          const m = months.find((x) => x.month === key);
          const cx = slot * i + slot / 2;
          const v = m ? pick(m) : 0;
          const y0 = Math.min(y(v), zero);
          const h = Math.max(m && v !== 0 ? 2 : 0, Math.abs(y(v) - zero));
          const neg = v < 0;
          const fill = signedColor ? (neg ? "#ef4444" : "#059669") : "#a8a29e";
          const active = hover === key;
          const r = Math.min(4, h, barW / 2);
          // 둥근 쪽은 막대 끝(값 쪽)만
          const path = !m || h === 0 ? "" : neg
            ? `M${cx - barW / 2},${y0} h${barW} v${h - r} q0,${r} ${-r},${r} h${-(barW - 2 * r)} q${-r},0 ${-r},${-r} z`
            : `M${cx - barW / 2},${y0 + h} v${-(h - r)} q0,${-r} ${r},${-r} h${barW - 2 * r} q${r},0 ${r},${r} v${h - r} z`;
          return (
            <g key={key} onMouseEnter={() => m && setHover(key)} onClick={() => m && setHover(key)} style={{ cursor: m ? "pointer" : "default" }}>
              <rect x={slot * i} y={0} width={slot} height={H} fill={active ? "#f5f5f4" : "transparent"} />
              {path && <path d={path} fill={fill} opacity={hover && !active ? 0.45 : 1} />}
              <text x={cx} y={H - 3} textAnchor="middle" fontSize={9} fill={m ? "#57534e" : "#d6d3d1"}>
                {i + 1}
              </text>
              {m && (key === latest.month || active) && (
                <text x={cx} y={neg ? y0 + h + 9 : y0 - 3} textAnchor="middle" fontSize={8.5} fill="#44403c" fontWeight={700}>
                  {neg ? "▼" : ""}
                  {Math.round(Math.abs(v) / 10000).toLocaleString("ko-KR")}만
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

function HoverDetail({ month: m }: { month: YearMonth }) {
  return (
    <p className="num rounded-lg bg-stone-50 px-2 py-1.5 text-xs text-stone-700">
      <b>{Number(m.month.slice(5))}월</b> 매출 {num(m.revenue)} · 비용 {num(m.cost)} · 영업이익{" "}
      <b className={m.profit >= 0 ? "text-emerald-700" : "text-red-600"}>{num(m.profit)}</b> ({pctText(m.margin)}) · 원가율 {pctText(m.costRate)} · 인건비율 {pctText(m.laborRate)}
      <span className="block text-[11px] text-stone-400">막대를 누르거나 마우스를 올리면 그 달 숫자가 여기 나와요.</span>
    </p>
  );
}
