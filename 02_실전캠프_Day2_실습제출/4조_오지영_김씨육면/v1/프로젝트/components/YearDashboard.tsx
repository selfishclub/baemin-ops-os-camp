"use client";

import { won } from "@/lib/csv";
import type { YearView } from "@/lib/year";
import { BarChart, Donut, MonthlyChart, Sparkline } from "./charts";
import { Btn, Empty, Panel, pct, shortWon } from "./ui";

export function YearDashboard({
  view,
  years,
  onYear,
  onOpenMonth,
  onGoSettlement,
}: {
  view: YearView;
  years: number[];
  onYear: (y: number) => void;
  onOpenMonth: (month: string) => void;
  onGoSettlement: () => void;
}) {
  if (!view.filled.length) {
    return (
      <main className="work">
        <div className="greet">
          <h1>{view.year}년</h1>
          <p>아직 정산한 달이 없습니다.</p>
        </div>
        <Empty
          icon="◲"
          title="한 달이라도 정산하면 여기가 채워집니다"
          action={<Btn tone="primary" onClick={onGoSettlement}>월 정산으로 가기</Btn>}
        >
          달마다 카드 파일을 올리고 매출을 넣으면, 이 화면에서 연간 흐름과 계정과목 누적을 한눈에 봅니다.
        </Empty>
      </main>
    );
  }

  const last = view.filled[view.filled.length - 1];
  const prev = view.filled[view.filled.length - 2];
  const series = (k: keyof typeof last) => view.filled.map((r) => Number(r[k]));

  const costSlices = [
    { label: "식자재비", key: "식자재비", color: "var(--primary)" },
    { label: "인건비", key: "인건비", color: "var(--primary-600)" },
    { label: "수수료", key: "수수료", color: "var(--warn)" },
    { label: "임대료", key: "임대료", color: "var(--info)" },
    { label: "마케팅비", key: "마케팅비", color: "var(--violet)" },
  ]
    .map((c) => ({
      label: c.label,
      value: view.accounts.find((a) => a.account === c.key)?.amount ?? 0,
      color: c.color,
    }))
    .filter((c) => c.value > 0);
  const known = new Set(costSlices.map((c) => c.label));
  const rest = view.accounts.filter((a) => !known.has(a.account)).reduce((s, a) => s + a.amount, 0);
  if (rest > 0) costSlices.push({ label: "그 외", value: rest, color: "var(--slate)" });

  return (
    <main className="work">
      <div className="greet" style={{ display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h1>{view.year}년</h1>
          <p>
            {view.filled.length}개월 정산 · <span className="ok">{view.closedCount}개월 마감</span>
            {last && ` · 마지막 ${Number(last.month.slice(5))}월`}
          </p>
        </div>
        {years.length > 1 && (
          <select
            className="mselect"
            style={{ marginLeft: "auto" }}
            value={view.year}
            onChange={(e) => onYear(Number(e.target.value))}
            aria-label="연도"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
        )}
      </div>

      <section className="kpis">
        <Kpi label="누적 매출" icon="◎" tone="info" value={won(view.revenue)} series={series("revenue")} sub={`월평균 ${shortWon(view.revenue / view.filled.length)}`} />
        <Kpi label="누적 비용" icon="◱" tone="violet" value={won(view.expense)} series={series("expense")} sub={`월평균 ${shortWon(view.expense / view.filled.length)}`} />
        <Kpi label="누적 영업이익" icon="▲" tone="primary" value={won(view.profit)} series={series("profit")} sub={pct(view.margin)} />
        <Kpi label="프라임코스트" icon="◐" tone="warn" value={pct(view.primeRatio)} series={series("primeRatio")} sub={shortWon(view.prime)} />
        <Kpi label="누적 수수료" icon="◒" tone="danger" value={won(view.fee)} series={series("fee")} sub={view.revenue ? pct(view.fee / view.revenue) : "—"} />
      </section>

      <section className="grid">
        <Panel className="c8 chartbox" title="월별 매출 · 비용" sub={`${view.year}년`}
          right={
            <div className="legend" style={{ flexDirection: "row", gap: 14, marginTop: 0 }}>
              <span className="lg"><i style={{ background: "var(--info)" }} />매출</span>
              <span className="lg"><i style={{ background: "var(--violet)" }} />비용</span>
            </div>
          }>
          <MonthlyChart
            months={view.rows.map((r) => ({
              label: r.label,
              revenue: r.revenue,
              expense: r.expense,
              profit: r.profit,
              hasData: r.hasData,
            }))}
          />
        </Panel>

        <Panel className="c4 chartbox" title="연간 비용 구성" sub={`총 ${won(view.expense)}`}>
          {costSlices.length ? (
            <Donut slices={costSlices} centerTop={shortWon(view.expense)} centerBottom="누적 비용" />
          ) : (
            <p className="note-line">비용이 아직 없습니다.</p>
          )}
        </Panel>

        <Panel className="c7" title="월별 정산" sub="눌러서 그 달로 이동">
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>월</th>
                  <th>매출</th>
                  <th>비용</th>
                  <th>영업이익</th>
                  <th>이익률</th>
                  <th>프라임</th>
                  <th style={{ textAlign: "left" }}>상태</th>
                </tr>
              </thead>
              <tbody>
                {view.rows.filter((r) => r.hasData).map((r) => (
                  <tr key={r.month} style={{ cursor: "pointer" }} onClick={() => onOpenMonth(r.month)}>
                    <td><b>{r.label}</b></td>
                    <td className="num">{won(r.revenue)}</td>
                    <td className="num">{won(r.expense)}</td>
                    <td className="num" style={{ color: r.profit >= 0 ? "var(--primary)" : "var(--danger)" }}>
                      {won(r.profit)}
                    </td>
                    <td className="num" style={{ color: "var(--muted)" }}>{r.revenue ? pct(r.margin) : "—"}</td>
                    <td className="num" style={{ color: "var(--muted)" }}>{r.revenue ? pct(r.primeRatio) : "—"}</td>
                    <td style={{ textAlign: "left" }}>
                      <span className={`step-s${r.closed ? " ok" : r.reviewCount ? " warn" : ""}`}>
                        {r.closed ? "마감" : r.reviewCount ? `검수 ${r.reviewCount}` : "진행 중"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>합계</td>
                  <td className="num">{won(view.revenue)}</td>
                  <td className="num">{won(view.expense)}</td>
                  <td className="num" style={{ color: view.profit >= 0 ? "var(--primary)" : "var(--danger)" }}>
                    {won(view.profit)}
                  </td>
                  <td className="num">{pct(view.margin)}</td>
                  <td className="num">{pct(view.primeRatio)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>

        <Panel className="c5 chartbox" title="계정과목 연간 상위" sub={`${view.filled.length}개월 누적`}>
          <BarChart
            bars={view.accounts.slice(0, 6).map((a, i) => ({
              label: a.account,
              value: a.amount,
              ratio: a.ratio,
              color: ["var(--primary)", "var(--primary)", "var(--warn)", "var(--info)", "var(--violet)", "var(--danger)"][i],
            }))}
          />
          <table className="data" style={{ marginTop: 14 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>계정</th>
                <th>누적</th>
                <th>월평균</th>
                <th>매출 대비</th>
              </tr>
            </thead>
            <tbody>
              {view.accounts.slice(0, 8).map((a) => (
                <tr key={a.account}>
                  <td>{a.account}</td>
                  <td className="num">{won(a.amount)}</td>
                  <td className="num" style={{ color: "var(--muted)" }}>{won(Math.round(a.monthly))}</td>
                  <td className="num" style={{ color: "var(--muted)" }}>{pct(a.ratio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </section>

      <p className="note-line">
        개인지출 누적 {won(view.personal)}원은 손익에서 빠져 있습니다.
        {prev && last && ` 전월 대비 매출 ${last.revenue >= prev.revenue ? "+" : ""}${prev.revenue ? (((last.revenue - prev.revenue) / prev.revenue) * 100).toFixed(1) : "0"}%.`}
      </p>
    </main>
  );
}

function Kpi({
  label,
  icon,
  tone,
  value,
  sub,
  series,
}: {
  label: string;
  icon: string;
  tone: "info" | "violet" | "primary" | "warn" | "danger";
  value: string;
  sub?: string;
  series: number[];
}) {
  const color = `var(--${tone})`;
  const delta = series.length >= 2 ? series[series.length - 1] - series[series.length - 2] : null;
  const prev = series.length >= 2 ? series[series.length - 2] : 0;
  return (
    <article className="kpi">
      <div className="top">
        <div className="ic" style={{ background: `var(--${tone}-soft)`, color }}>{icon}</div>
        {delta !== null && prev ? (
          <span className={`delta ${delta >= 0 ? "up" : "down"}`}>
            {delta >= 0 ? "+" : ""}
            {((delta / Math.abs(prev)) * 100).toFixed(1)}%
          </span>
        ) : (
          <span className="delta flat">{series.length}개월</span>
        )}
      </div>
      <div className="lab">{label}</div>
      <div className="val num">{value}</div>
      {sub && <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginTop: 2 }}>{sub}</div>}
      <Sparkline values={series} color={color} />
    </article>
  );
}
