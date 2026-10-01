"use client";

import { won } from "@/lib/csv";
import type { YearView } from "@/lib/year";
import { BarChart, Donut, MonthlyChart, Sparkline } from "./charts";
import { Btn, Empty, pct, shortWon } from "./ui";

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
          <br />
          <b>처음 둘러보시는 거라면</b> 월 정산 → 1단계 불러오기에 <b>시연 자료 넣기</b>가 있습니다. 가짜 자료입니다.
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
      <div className="phead">
        <div>
          <h1>{view.year}년</h1>
          <div className="eyebrow sub">
            {view.filled.length}개월 정산 · {view.closedCount}개월 마감
            {last && ` · 마지막 ${Number(last.month.slice(5))}월`}
          </div>
        </div>
        <div className="sp">
          {years.length > 1 && (
            <select className="tb-pill" value={view.year} onChange={(e) => onYear(Number(e.target.value))} aria-label="연도">
              {years.map((y) => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
          )}
          <button className="cta" onClick={onGoSettlement}>월 정산 열기</button>
        </div>
      </div>

      <section className="bento">
        {/* 히어로 2×2 — 연간 흐름 */}
        <div className="tile big">
          <div className="th">
            <div style={{ minWidth: 0 }}>
              <div className="eyebrow">누적 매출</div>
              <div className="bignum" style={{ marginTop: 6 }}>{won(view.revenue)}</div>
              <div className="eyebrow" style={{ marginTop: 7, letterSpacing: ".06em" }}>
                월평균 {shortWon(view.revenue / view.filled.length)}
              </div>
            </div>
            <div className="sp" />
            <div className="legend" style={{ flexDirection: "row", gap: 14, marginTop: 0 }}>
              <span className="lg"><i style={{ background: "var(--info)" }} />매출</span>
              <span className="lg"><i style={{ background: "var(--violet)" }} />비용</span>
            </div>
          </div>
          <MonthlyChart
            months={view.rows.map((r) => ({
              label: r.label,
              revenue: r.revenue,
              expense: r.expense,
              profit: r.profit,
              hasData: r.hasData,
            }))}
          />
        </div>

        {/* 누적 영업이익 */}
        <div className="tile">
          <div className="eyebrow">누적 영업이익</div>
          <div className="midnum">{won(view.profit)}</div>
          <div><span className={`delta${view.profit >= 0 ? "" : " down"}`}>{pct(view.margin)}</span></div>
          <div style={{ marginTop: "auto" }}><Sparkline values={series("profit")} color="var(--primary)" /></div>
        </div>

        {/* 연간 비용 구성 1×2 */}
        <div className="tile tall">
          <div className="th">
            <h3>연간 비용 구성</h3>
            <div className="sp" />
            <span className="eyebrow" style={{ letterSpacing: ".06em" }}>총 {won(view.expense)}</span>
          </div>
          {costSlices.length ? (
            <Donut slices={costSlices} centerTop={shortWon(view.expense)} centerBottom="누적 비용" />
          ) : (
            <p className="note-line">비용이 아직 없습니다.</p>
          )}
        </div>

        {/* 프라임코스트 */}
        <div className="tile">
          <div className="eyebrow">프라임코스트</div>
          <div className="midnum">{pct(view.primeRatio)}</div>
          <div className="eyebrow" style={{ letterSpacing: ".06em" }}>{shortWon(view.prime)}</div>
          <div style={{ marginTop: "auto" }}><Sparkline values={series("primeRatio")} color="var(--warn)" /></div>
        </div>

        {/* 누적 비용 */}
        <div className="tile">
          <div className="eyebrow">누적 비용</div>
          <div className="midnum">{won(view.expense)}</div>
          <div className="eyebrow" style={{ letterSpacing: ".06em" }}>
            월평균 {shortWon(view.expense / view.filled.length)}
          </div>
          <div style={{ marginTop: "auto" }}><Sparkline values={series("expense")} color="var(--violet)" /></div>
        </div>

        {/* 누적 수수료 */}
        <div className="tile">
          <div className="eyebrow">누적 수수료</div>
          <div className="midnum">{won(view.fee)}</div>
          <div className="eyebrow" style={{ letterSpacing: ".06em" }}>
            {view.revenue ? `매출의 ${pct(view.fee / view.revenue)}` : "—"}
          </div>
          <div style={{ marginTop: "auto" }}><Sparkline values={series("fee")} color="var(--danger)" /></div>
        </div>

        <div className="tile w4">
          <div className="th">
            <h3>월별 정산</h3>
            <div className="sp" />
            <span className="eyebrow" style={{ letterSpacing: ".06em" }}>눌러서 그 달로 이동</span>
          </div>
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
        </div>

        <div className="tile w4">
          <div className="th">
            <h3>계정과목 연간 상위</h3>
            <div className="sp" />
            <span className="eyebrow" style={{ letterSpacing: ".06em" }}>{view.filled.length}개월 누적</span>
          </div>
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
        </div>
      </section>

      <p className="note-line">
        개인지출 누적 {won(view.personal)}원은 손익에서 빠져 있습니다.
        {prev && last && ` 전월 대비 매출 ${last.revenue >= prev.revenue ? "+" : ""}${prev.revenue ? (((last.revenue - prev.revenue) / prev.revenue) * 100).toFixed(1) : "0"}%.`}
      </p>
    </main>
  );
}
