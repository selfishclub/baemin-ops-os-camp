"use client";

import { won } from "@/lib/csv";
import { findings, missingFixedCosts, type Finding } from "@/lib/findings";
import { costGroups, keyRatios, type Summary } from "@/lib/summary";
import type { Transaction } from "@/lib/types";
import { BarChart, Donut, Sparkline, TrendChart, type TrendPoint } from "./charts";
import { Btn, Empty, Money, Panel, pct, shortWon } from "./ui";

export interface History {
  month: string;
  revenue: number;
  expense: number;
  profit: number;
  primeRatio: number;
  feeRatio: number;
}

export interface PrevMonth {
  month: string;
  summary: Summary;
  transactions: Transaction[];
  hasData: boolean;
}

export function Dashboard({
  summary,
  transactions,
  history,
  prev,
  onGoSettlement,
}: {
  summary: Summary;
  transactions: Transaction[];
  history: History[];
  prev: PrevMonth;
  onGoSettlement: (step?: number) => void;
}) {
  const empty = !transactions.length && !summary.revenue.gross;
  const [y, m] = summary.month.split("-");

  if (empty) {
    return (
      <main className="work">
        <div className="greet">
          <h1>{`${y}년 ${Number(m)}월 정산`}</h1>
          <p>아직 이 달에 들어온 자료가 없습니다.</p>
        </div>
        <Empty
          icon="↑"
          title="카드 파일부터 올려 주세요"
          action={<Btn tone="primary" onClick={() => onGoSettlement(1)}>월 정산으로 가기</Btn>}
        >
          카드사에서 거래일 기준으로 내려받은 CSV를 올리면 자동으로 분류됩니다. 그 다음 고정비를 복사하고 매출을
          넣으면 이 화면이 채워집니다.
        </Empty>
      </main>
    );
  }

  const groups = costGroups(summary);
  const ratios = keyRatios(summary);
  // 두 달 모두 매출이 있어야 %p 비교가 뜻이 있다
  const comparable = summary.revenue.gross > 0 && prev.summary.revenue.gross > 0;
  const prevRatios = comparable ? keyRatios(prev.summary) : null;
  const missing = prev.hasData ? missingFixedCosts(prev.transactions, transactions) : [];
  const prevLabel = `${Number(prev.month.slice(5))}월`;

  const found = findings(summary, transactions);
  if (missing.length) {
    found.unshift({
      id: "missing-fixed",
      severity: "warn",
      title: `${prevLabel}에 있던 고정비 ${missing.length}건이 이번 달에 없습니다`,
      detail: missing.slice(0, 3).map((m) => `${m.sub} ${won(m.amount)}`).join(", ") + (missing.length > 3 ? " 외" : ""),
      amount: missing.reduce((a, b) => a + b.amount, 0),
      step: 2,
    });
  }
  const top = found[0];
  const trend: TrendPoint[] = history.map((h) => ({ month: h.month, revenue: h.revenue, expense: h.expense }));
  const classified = transactions.filter((t) => !t.needsReview).length;

  const bars = summary.expense.byAccount
    .filter((a) => a.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6)
    .map((a, i) => ({
      label: a.account,
      value: a.amount,
      ratio: a.ratio,
      color: ["var(--primary)", "var(--primary)", "var(--warn)", "var(--info)", "var(--violet)", "var(--danger)"][i],
    }));

  return (
    <main className="work">
      <div className="greet">
        <h1>{`${y}년 ${Number(m)}월 정산`}</h1>
        <p>
          {transactions.length}건을 불러왔고 <span className="ok">{classified}건이 분류됐습니다.</span>
          {summary.reviewCount > 0 && ` 검수 ${summary.reviewCount}건이 남아 있습니다.`}
        </p>
      </div>

      <section className="kpis">
        <Kpi label="매출" icon="◎" tone="info" value={won(summary.revenue.gross)} series={history.map((h) => h.revenue)} />
        <Kpi label="비용" icon="◱" tone="violet" value={won(summary.expense.total)} series={history.map((h) => h.expense)} />
        <Kpi
          label="영업이익"
          icon="▲"
          tone="primary"
          value={won(summary.operatingProfit)}
          badge={{ text: pct(summary.operatingMargin), up: summary.operatingProfit >= 0 }}
          series={history.map((h) => h.profit)}
        />
        <Kpi label="프라임코스트" icon="◐" tone="warn" value={`${(summary.primeCostRatio * 100).toFixed(1)}%`} sub={won(summary.primeCost)} series={history.map((h) => h.primeRatio)} />
        <Kpi label="수수료" icon="◒" tone="danger" value={won(summary.revenue.fee)} sub={pct(summary.revenue.feeRate)} series={history.map((h) => h.feeRatio)} />
      </section>

      <section className="grid">
        <Panel className="c6 chartbox" title="매출 · 비용 추이" sub={`최근 ${history.length}개월`}
          right={history.length < 2 ? <span className="pill">데이터 모으는 중</span> : undefined}>
          {history.length < 2 ? (
            <p className="note-line">
              달이 하나뿐이라 아직 선을 그릴 수 없습니다. 다른 달을 정산하면 여기에 흐름이 쌓입니다.
            </p>
          ) : (
            <>
              <TrendChart points={trend} />
              <div className="legend" style={{ flexDirection: "row", gap: 20 }}>
                <span className="lg"><i style={{ background: "var(--info)" }} />매출</span>
                <span className="lg"><i style={{ background: "var(--violet)" }} />비용</span>
              </div>
            </>
          )}
        </Panel>

        <Panel
          className="c4"
          title="지표"
          sub={comparable ? `${prevLabel} 대비` : summary.revenue.gross ? "전월 비교 불가 — 매출 자료 없음" : "매출을 넣으면 비율이 나옵니다"}
        >
          {ratios.map((r, i) => {
            const p = prevRatios?.[i];
            const diff = p ? r.ratio - p.ratio : null;
            const over = r.ceiling !== undefined && r.ratio > r.ceiling;
            return (
              <div className="kv" key={r.label}>
                <span className="k">
                  {r.label}
                  {r.ceiling !== undefined && (
                    <span style={{ marginLeft: 6, fontSize: 10.5, color: "var(--muted)" }}>
                      ~{pct(r.ceiling, 0)}
                    </span>
                  )}
                </span>
                <span className="v num" style={{ color: over ? "var(--warn)" : undefined }}>
                  {summary.revenue.gross ? pct(r.ratio) : "—"}
                  {diff !== null && Math.abs(diff) >= 0.0005 && (
                    <span
                      style={{
                        marginLeft: 7,
                        fontSize: 11,
                        fontWeight: 700,
                        color: diff > 0 ? "var(--danger)" : "var(--primary)",
                      }}
                    >
                      {diff > 0 ? "+" : ""}
                      {(diff * 100).toFixed(1)}%p
                    </span>
                  )}
                </span>
              </div>
            );
          })}
          <p className="note-line" style={{ marginTop: 12 }}>
            비율이 오르면 빨강입니다. 오른쪽 숫자는 매출 대비 상한 눈금입니다.
          </p>
        </Panel>

        <Panel
          className="c8"
          title="계정과목 전월 대비"
          sub={prev.hasData ? `${prevLabel}과 나란히` : "전월 자료가 없어 이번 달만 보입니다"}
        >
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>계정</th>
                  <th>이번 달</th>
                  <th>매출 대비</th>
                  {prev.hasData && <th>{prevLabel}</th>}
                  {prev.hasData && <th>증감</th>}
                </tr>
              </thead>
              <tbody>
                {summary.expense.byAccount
                  .filter((a) => a.amount !== 0)
                  .sort((a, b) => b.amount - a.amount)
                  .slice(0, 9)
                  .map((a) => {
                    const before = prev.summary.expense.byAccount.find((x) => x.account === a.account)?.amount ?? 0;
                    const diff = a.amount - before;
                    return (
                      <tr key={a.account}>
                        <td>{a.account}</td>
                        <td className="num">{won(a.amount)}</td>
                        <td className="num" style={{ color: "var(--muted)" }}>{pct(a.ratio)}</td>
                        {prev.hasData && (
                          <td className="num" style={{ color: "var(--muted)" }}>{before ? won(before) : "—"}</td>
                        )}
                        {prev.hasData && (
                          <td
                            className="num"
                            style={{ color: diff === 0 ? "var(--muted)" : diff > 0 ? "var(--danger)" : "var(--primary)" }}
                          >
                            {before === 0 ? "신규" : `${diff > 0 ? "+" : ""}${won(diff)}`}
                          </td>
                        )}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel className="c3 chartbox" title="비용 구성" sub={`매출의 ${pct(summary.revenue.gross ? summary.expense.total / summary.revenue.gross : 0)}`}>
          {groups.length ? (
            <Donut
              slices={groups.map((g) => ({ label: g.name, value: g.amount, color: g.tone }))}
              centerTop={shortWon(summary.expense.total)}
              centerBottom="총 비용"
            />
          ) : (
            <p className="note-line">비용이 아직 없습니다.</p>
          )}
        </Panel>

        <Panel
          className="c3"
          title="채널별 매출"
          sub={summary.revenue.gross ? hallDeliveryLabel(summary) : "매출 미입력"}
        >
          {summary.revenue.byChannel.length ? (
            <div className="rowlist">
              {summary.revenue.byChannel.map((c) => (
                <div className="rl" key={c.channel}>
                  <div className="av" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}>
                    {c.channel.slice(0, 2)}
                  </div>
                  <div>
                    <div className="nm">{c.channel}</div>
                    <div className="sub">입금 {won(c.deposit)}</div>
                  </div>
                  <div className="rt">
                    <div className="amt num">{won(c.gross)}</div>
                    <div className={`rate${outOfBand(c.account, c.feeRate) ? " bad" : ""}`}>
                      수수료 {pct(c.feeRate)}
                      {outOfBand(c.account, c.feeRate) && " ⚠"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="note-line">
              <Btn onClick={() => onGoSettlement(4)}>매출 입력하기</Btn>
            </p>
          )}
        </Panel>

        <Panel className="c4" title="확인 필요" sub="마감 전에 볼 것"
          right={<span className="pill" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>{found.length}건</span>}>
          {found.length ? (
            <div className="tl">
              {found.slice(0, 5).map((f) => (
                <FindingRow key={f.id} f={f} onGo={onGoSettlement} />
              ))}
            </div>
          ) : (
            <p className="note-line">짚을 게 없습니다. 마감해도 됩니다.</p>
          )}
        </Panel>

        <Panel
          className="c5 chartbox"
          title="계정과목 상위"
          sub={`사업 지출 ${summary.expense.byAccount.length}개 계정`}
          right={
            <>
              <div className="lab">총 비용</div>
              <div className="num" style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-.03em" }}>
                {won(summary.expense.total)}
              </div>
            </>
          }
        >
          <BarChart bars={bars} />
        </Panel>

        <Panel className="c3 chartbox" title="고정 · 변동" sub="손익분기점 계산용">
          <Donut
            slices={[
              { label: "고정비", value: summary.fixedTotal, color: "var(--primary)" },
              { label: "변동비", value: summary.variableTotal, color: "var(--info)" },
              ...(summary.unflaggedTotal ? [{ label: "플래그 없음", value: summary.unflaggedTotal, color: "var(--slate)" }] : []),
            ]}
            centerTop={pct(summary.revenue.gross ? summary.expense.total / summary.revenue.gross : 0)}
            centerBottom="매출 대비"
          />
          <p className="note-line" style={{ marginTop: 14 }}>
            위 &lsquo;비용 구성&rsquo;과 같은 돈을 다르게 자른 것입니다. 인건비는 소분류별로 갈립니다.
          </p>
        </Panel>

        {top && (
          <article className="hero">
            <div className="txt">
              <div className="lab">이번 달 짚을 것</div>
              <h2>{top.title}</h2>
              <p>{top.detail}</p>
              {top.step && (
                <button className="cta" onClick={() => onGoSettlement(top.step)}>
                  월 정산에서 확인하기
                </button>
              )}
            </div>
            <div className="glass">
              <div className="gl">지금 손익</div>
              <div className="gv num">{won(summary.operatingProfit)}</div>
              <div className="gs">영업이익 · {pct(summary.operatingMargin)}</div>
              <hr />
              <div className="gr"><span>매출</span><span className="num">{won(summary.revenue.gross)}</span></div>
              <div className="gr"><span>비용</span><span className="num">{won(summary.expense.total)}</span></div>
              <div className="gr"><span>프라임코스트</span><span className="num">{pct(summary.primeCostRatio)}</span></div>
            </div>
          </article>
        )}

        <div className="quick">
          <button className="qa" onClick={() => onGoSettlement(1)}>
            <span className="ic" style={{ background: "var(--info-soft)", color: "var(--info)" }}>↑</span>
            <span className="t">파일 올리기</span><span className="s">카드 · 시트</span>
          </button>
          <button className="qa" onClick={() => onGoSettlement(3)}>
            <span className="ic" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>◷</span>
            <span className="t">검수</span>
            <span className="s">{summary.reviewCount ? `${summary.reviewCount}건 남음` : "완료"}</span>
          </button>
          <button className="qa" onClick={() => onGoSettlement(2)}>
            <span className="ic" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}>⧉</span>
            <span className="t">고정비</span><span className="s">전월 복사</span>
          </button>
          <button className="qa" onClick={() => onGoSettlement(4)}>
            <span className="ic" style={{ background: "var(--violet-soft)", color: "var(--violet)" }}>₩</span>
            <span className="t">매출 입력</span>
            <span className="s">{summary.revenue.gross ? shortWon(summary.revenue.gross) : "미입력"}</span>
          </button>
        </div>
      </section>

      <p className="note-line">
        개인지출 <Money v={summary.personal.total} />원과 기타수입 <Money v={summary.otherIncome.total} />원은
        손익에서 빠져 있습니다.
      </p>
    </main>
  );
}

function hallDeliveryLabel(s: Summary): string {
  const g = s.revenue.gross || 1;
  const hall = s.revenue.byChannel.filter((c) => c.account === "매출-홀").reduce((a, b) => a + b.gross, 0);
  const deli = s.revenue.byChannel.filter((c) => c.account === "매출-배달").reduce((a, b) => a + b.gross, 0);
  return `홀 ${((hall / g) * 100).toFixed(1)}% · 배달 ${((deli / g) * 100).toFixed(1)}%`;
}

const outOfBand = (account: string, rate: number) => {
  const [lo, hi] = account === "매출-배달" ? [0.2, 0.35] : [0.01, 0.04];
  return rate < lo || rate > hi;
};

function FindingRow({ f, onGo }: { f: Finding; onGo: (step?: number) => void }) {
  const tone =
    f.severity === "danger"
      ? { bg: "var(--danger-soft)", fg: "var(--danger)", mark: "₩" }
      : f.severity === "warn"
        ? { bg: "var(--warn-soft)", fg: "var(--warn)", mark: "!" }
        : { bg: "var(--slate-soft)", fg: "var(--slate)", mark: "·" };
  return (
    <div className="ti">
      <div className="dot" style={{ background: tone.bg, color: tone.fg }}>{tone.mark}</div>
      <div className="tx">
        <h4>{f.title}</h4>
        <p>{f.detail}</p>
        {f.amount !== undefined && f.amount !== 0 && <div className="amt num">{won(f.amount)}</div>}
      </div>
      {f.step && (
        <button className="tool" style={{ marginLeft: "auto" }} onClick={() => onGo(f.step)}>
          가기
        </button>
      )}
    </div>
  );
}

function Kpi({
  label,
  icon,
  tone,
  value,
  sub,
  badge,
  series,
}: {
  label: string;
  icon: string;
  tone: "info" | "violet" | "primary" | "warn" | "danger";
  value: string;
  sub?: string;
  badge?: { text: string; up: boolean };
  series: number[];
}) {
  const color = `var(--${tone})`;
  const soft = `var(--${tone}-soft)`;
  const delta = series.length >= 2 ? series[series.length - 1] - series[series.length - 2] : null;
  const prev = series.length >= 2 ? series[series.length - 2] : 0;
  return (
    <article className="kpi">
      <div className="top">
        <div className="ic" style={{ background: soft, color }}>{icon}</div>
        {badge ? (
          <span className={`delta ${badge.up ? "up" : "down"}`}>{badge.text}</span>
        ) : delta !== null && prev ? (
          <span className={`delta ${delta >= 0 ? "up" : "down"}`}>
            {delta >= 0 ? "+" : ""}
            {((delta / Math.abs(prev)) * 100).toFixed(1)}%
          </span>
        ) : (
          <span className="delta flat">전월 없음</span>
        )}
      </div>
      <div className="lab">{label}</div>
      <div className="val num">{value}{sub && <span className="u">{sub}</span>}</div>
      <Sparkline values={series} color={color} />
    </article>
  );
}
