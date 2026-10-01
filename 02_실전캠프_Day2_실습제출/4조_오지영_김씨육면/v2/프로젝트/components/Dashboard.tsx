"use client";

import { won } from "@/lib/csv";
import { findings, missingFixedCosts, type Finding } from "@/lib/findings";
import { costGroups, keyRatios, type Summary } from "@/lib/summary";
import type { Transaction } from "@/lib/types";
import { BarChart, Donut, Sparkline, TrendChart, type TrendPoint } from "./charts";
import { Btn, Delta, Empty, Gauge, Money, pct, shortWon } from "./ui";
import { isConfirmed, isUnclassified, needsConfirm } from "@/lib/confirm";
import { contentOf } from "@/lib/alias";
import { aliasesOf } from "@/lib/learned";
import { useLearned } from "@/lib/useLearned";

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
  // 입금만 넣은 달도 자료가 있는 달이다. 빠뜨리면 '자료 없음'으로 보인다.
  const empty = !transactions.length && !summary.revenue.gross && !summary.revenue.deposit;
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
          카드 내역이나 통장 파일을 올리면 1일부터 말일까지 쭉 펼쳐집니다. 지출을 분류하고 입금 내역을
          가려내면 이 화면이 채워집니다.
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

  // 최근 거래 — 날짜 내림차순. 확정 여부를 점 색으로 보여준다
  const aliases = aliasesOf(useLearned());
  const recent = [...transactions]
    .filter((t) => t.group !== "revenue")
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.amount - a.amount)
    .slice(0, 8);

  const confirmTargets = transactions.filter(needsConfirm);
  const confirmedCount = confirmTargets.length - summary.pending.count;
  const confirmRatio = confirmTargets.length ? confirmedCount / confirmTargets.length : 1;

  const profitDelta = prev.hasData && prev.summary.operatingProfit
    ? ((summary.operatingProfit - prev.summary.operatingProfit) / Math.abs(prev.summary.operatingProfit)) * 100
    : null;
  const primeDelta = comparable ? (summary.primeCostRatio - prev.summary.primeCostRatio) * 100 : null;
  const revenueDelta = prev.summary.revenue.gross
    ? ((summary.revenue.gross - prev.summary.revenue.gross) / prev.summary.revenue.gross) * 100
    : null;

  return (
    <main className="work">
      <div className="phead">
        <div>
          <h1>{`${y}년 ${Number(m)}월 정산`}</h1>
          <div className="eyebrow sub">
            손익 요약 · {transactions.length}건 중 {classified}건 분류
          </div>
        </div>
        <div className="sp">
          {summary.pending.count > 0 && (
            <span className="delta down">확정 전 {summary.pending.count}건</span>
          )}
          <button className="ghost" onClick={() => onGoSettlement(1)}>파일 올리기</button>
          <button className="cta" onClick={() => onGoSettlement(3)}>
            {summary.pending.count ? "확정하러 가기" : "월 정산 열기"}
          </button>
        </div>
      </div>

      {summary.pending.count > 0 && (
        <p className="provisional" style={{ marginBottom: 18 }}>
          아직 확정하지 않은 {summary.pending.count}건 · {won(summary.pending.total)}이 들어 있습니다.
          쓴 금액은 카드사가 준 사실이라 총액은 맞지만,{" "}
          <b>어느 계정에 놓일지는 아직 잠정</b>입니다.
        </p>
      )}

      <section className="bento">
        {/* 히어로 2×2 — 매출·비용 추이 */}
        <div className="tile big">
          <div className="th">
            <div style={{ minWidth: 0 }}>
              <div className="eyebrow">매출 · 비용 추이</div>
              <div className="bignum" style={{ marginTop: 6 }}>{won(summary.revenue.gross)}</div>
              <div style={{ marginTop: 7, display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                <Delta value={revenueDelta} />
                <span className="eyebrow" style={{ letterSpacing: ".06em" }}>
                  {prev.hasData ? `${prevLabel} 대비` : "전월 자료 없음"}
                </span>
              </div>
            </div>
            <div className="sp" />
            <span className="eyebrow" style={{ letterSpacing: ".06em" }}>최근 {history.length}개월</span>
          </div>
          {history.length < 2 ? (
            <p className="note-line">
              달이 하나뿐이라 아직 선을 그릴 수 없습니다. 다른 달을 정산하면 여기에 흐름이 쌓입니다.
            </p>
          ) : (
            <>
              <TrendChart points={trend} />
              <div className="legend" style={{ flexDirection: "row", gap: 20, marginTop: 4 }}>
                <span className="lg"><i style={{ background: "var(--info)" }} />매출</span>
                <span className="lg"><i style={{ background: "var(--violet)" }} />비용</span>
              </div>
            </>
          )}
        </div>

        {/* 영업이익 — 가게가 번 돈 */}
        <div className="tile">
          <div className="eyebrow">영업이익</div>
          <div className="midnum">{won(summary.operatingProfit)}</div>
          <div><Delta value={profitDelta} /></div>
          <div className="eyebrow" style={{ letterSpacing: ".06em", marginTop: 6 }}>
            매출 − 사업비용 · 개인지출은 안 들어갑니다
          </div>
          <div style={{ marginTop: "auto" }}>
            <Sparkline values={history.map((h) => h.profit)} color="var(--olive,var(--violet))" />
          </div>
        </div>

        {/* 실제로 남은 돈 — 개인적으로 쓴 것까지 빼고 나면 */}
        <div className="tile">
          <div className="eyebrow">실제로 남은 돈</div>
          <div className="midnum">{won(summary.operatingProfit - summary.personal.total)}</div>
          <div>
            {summary.personal.total > 0 ? (
              <span className="delta down">개인지출 −{won(summary.personal.total)}</span>
            ) : (
              <span className="delta flat">개인지출 없음</span>
            )}
          </div>
          <div className="eyebrow" style={{ letterSpacing: ".06em", marginTop: 6 }}>
            영업이익에서 개인적으로 쓴 것까지 뺀 금액
          </div>
        </div>

        {/* 최근 거래 1×2 */}
        <div className="tile tall">
          <div className="th">
            <h3>최근 거래</h3>
            <div className="sp" />
            <span className="eyebrow" style={{ letterSpacing: ".06em" }}>{transactions.length}건</span>
          </div>
          {recent.length ? (
            <div className="evfeed">
              {recent.map((t) => (
                <div className="ev" key={t.id}>
                  <div className={`chip${isUnclassified(t) ? " c" : isConfirmed(t) ? "" : " b"}`}>
                    {contentOf(t, aliases).text.slice(0, 1)}
                  </div>
                  <div className="t">
                    <b title={`원문: ${t.merchant}`}>{contentOf(t, aliases).text}</b>
                    <span>{(t.date ?? "날짜 없음").slice(5)} · {t.tags?.[0] ?? "직접 입력"}</span>
                  </div>
                  <span className="amt">{won(t.amount)}</span>
                  <i
                    className="sdot"
                    style={{
                      background: isUnclassified(t)
                        ? "var(--danger)"
                        : isConfirmed(t)
                          ? "var(--primary)"
                          : "var(--warn)",
                    }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="note-line">아직 거래가 없습니다.</p>
          )}
          <div className="eyebrow" style={{ marginTop: "auto", paddingTop: 10, letterSpacing: ".06em" }}>
            <span style={{ color: "var(--primary)" }}>●</span> 확정{" "}
            <span style={{ color: "var(--warn)" }}>●</span> 제안{" "}
            <span style={{ color: "var(--danger)" }}>●</span> 미분류
          </div>
        </div>

        {/* 프라임코스트 */}
        <div className="tile">
          <div className="eyebrow">프라임코스트</div>
          <div className="midnum">
            {summary.revenue.gross ? pct(summary.primeCostRatio) : "—"}
          </div>
          <div><Delta value={primeDelta} unit="%p" goodWhenUp={false} /></div>
          <div style={{ marginTop: "auto" }}>
            <Sparkline values={history.map((h) => h.primeRatio)} color="var(--warn)" />
          </div>
        </div>

        {/* 비용 구성 1×2 */}
        <div className="tile tall">
          <div className="th">
            <h3>비용 구성</h3>
            <div className="sp" />
            <span className="eyebrow" style={{ letterSpacing: ".06em" }}>
              매출의 {pct(summary.revenue.gross ? summary.expense.total / summary.revenue.gross : 0)}
            </span>
          </div>
          {groups.length ? (
            <Donut
              slices={groups.map((g) => ({ label: g.name, value: g.amount, color: g.tone }))}
              centerTop={shortWon(summary.expense.total)}
              centerBottom="총 비용"
            />
          ) : (
            <p className="note-line">비용이 아직 없습니다.</p>
          )}
        </div>

        {/* 분류 확정률 게이지 */}
        <div className="tile">
          <div className="eyebrow">분류 확정률</div>
          <Gauge
            ratio={confirmRatio}
            center={`${Math.round(confirmRatio * 100)}%`}
            note={confirmTargets.length ? `${confirmTargets.length}건 중 ${confirmedCount}건 확정` : "확정할 건이 없습니다"}
          />
        </div>

        {/* 확인 필요 */}
        <div className="tile w2">
          <div className="th">
            <h3>확인 필요</h3>
            <div className="sp" />
            <span className="delta down">{found.length}건</span>
          </div>
          {found.length ? (
            <div className="tl">
              {found.slice(0, 5).map((f) => (
                <FindingRow key={f.id} f={f} onGo={onGoSettlement} />
              ))}
            </div>
          ) : (
            <p className="note-line">짚을 게 없습니다. 마감해도 됩니다.</p>
          )}
        </div>

        {/* 지표 */}
        <div className="tile w3">
          <div className="th">
            <h3>지표</h3>
            <div className="sp" />
            <span className="eyebrow" style={{ letterSpacing: ".06em" }}>
              {comparable ? `${prevLabel} 대비` : summary.revenue.gross ? "전월 비교 불가" : "매출을 넣으면 비율이 나옵니다"}
            </span>
          </div>
          {ratios.map((r, i) => {
            const pr = prevRatios?.[i];
            const diff = pr ? r.ratio - pr.ratio : null;
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
        </div>

        {/* 계정과목 전월 대비 */}
        <div className="tile w4">
          <div className="th">
            <h3>계정과목 전월 대비</h3>
            <div className="sp" />
            <span className="eyebrow" style={{ letterSpacing: ".06em" }}>
              {prev.hasData ? `${prevLabel}과 나란히` : "전월 자료가 없어 이번 달만"}
            </span>
          </div>
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
                {summary.expense.byAccount.map((a) => {
                  const before = prev.summary.expense.byAccount.find((x) => x.account === a.account)?.amount ?? 0;
                  const gap = a.amount - before;
                  return (
                    <tr key={a.account}>
                      <td style={{ textAlign: "left", fontWeight: 700 }}>{a.account}</td>
                      <td className="num">{won(a.amount)}</td>
                      <td className="num" style={{ color: "var(--muted)" }}>{pct(a.ratio)}</td>
                      {prev.hasData && (
                        <td className="num" style={{ color: "var(--muted)" }}>{before ? won(before) : "—"}</td>
                      )}
                      {prev.hasData && (
                        <td
                          className="num"
                          style={{ color: gap > 0 ? "var(--danger)" : gap < 0 ? "var(--primary)" : "var(--muted)" }}
                        >
                          {before ? `${gap > 0 ? "+" : ""}${won(gap)}` : "신규"}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 계정과목 상위 */}
        <div className="tile w2">
          <div className="th">
            <h3>계정과목 상위</h3>
            <div className="sp" />
            <span className="num" style={{ fontSize: 15, fontWeight: 600 }}>{won(summary.expense.total)}</span>
          </div>
          <BarChart bars={bars} />
        </div>

        {/* 고정 · 변동 */}
        <div className="tile w2">
          <div className="th">
            <h3>고정 · 변동</h3>
            <div className="sp" />
            <span className="eyebrow" style={{ letterSpacing: ".06em" }}>손익분기점 계산용</span>
          </div>
          <Donut
            slices={[
              { label: "고정비", value: summary.fixedTotal, color: "var(--primary)" },
              { label: "변동비", value: summary.variableTotal, color: "var(--info)" },
              ...(summary.unflaggedTotal
                ? [{ label: "플래그 없음", value: summary.unflaggedTotal, color: "var(--slate)" }]
                : []),
            ]}
            centerTop={pct(summary.revenue.gross ? summary.expense.total / summary.revenue.gross : 0)}
            centerBottom="매출 대비"
          />
          <p className="note-line" style={{ marginTop: 14 }}>
            위 &lsquo;비용 구성&rsquo;과 같은 돈을 다르게 자른 것입니다. 인건비는 소분류별로 갈립니다.
          </p>
        </div>

        {/* 채널별 매출 */}
        <div className="tile w4">
          <div className="th">
            <h3>채널별 매출</h3>
            <div className="sp" />
            <span className="eyebrow" style={{ letterSpacing: ".06em" }}>
              {summary.revenue.gross ? hallDeliveryLabel(summary) : "매출 미입력"}
            </span>
          </div>
          {summary.revenue.byChannel.length ? (
            <div className="tscroll">
              <table className="ttable">
                <thead>
                  <tr>
                    <th>채널</th>
                    <th className="r">매출액</th>
                    <th className="r">수수료율</th>
                    <th className="r">입금액</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.revenue.byChannel.map((c) => (
                    <tr key={c.channel}>
                      <td>{c.channel}</td>
                      <td className="r m">{won(c.gross)}</td>
                      {/* 매출액보다 입금액이 크면 아직 덜 적은 것이다.
                          그대로 나누면 -638% 같은 숫자가 나와 사람을 헷갈리게 한다. */}
                      {c.gross < c.deposit ? (
                        <td
                          className="r m"
                          style={{ color: "var(--muted)" }}
                          title="매출 캘린더에 덜 적혀 있습니다. 판 날 매출을 채우면 수수료가 나옵니다"
                        >
                          덜 적음
                        </td>
                      ) : (
                        <td className="r m" style={{ color: outOfBand(c.account, c.feeRate) ? "var(--warn)" : "var(--muted)" }}>
                          {c.fee ? pct(c.feeRate) : "—"}
                          {outOfBand(c.account, c.feeRate) && c.fee ? " ⚠" : ""}
                        </td>
                      )}
                      <td className="r m">{won(c.deposit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="note-line">
              <Btn onClick={() => onGoSettlement(4)}>매출 입력하기</Btn>
            </p>
          )}
        </div>
      </section>

      <div className="quick" style={{ marginTop: 18 }}>
        <button className="qa" onClick={() => onGoSettlement(1)}>
          <span className="ic" style={{ background: "var(--info-soft)", color: "var(--info)" }}>↑</span>
          <span className="t">파일 올리기</span><span className="s">카드 · 시트</span>
        </button>
        <button className="qa" onClick={() => onGoSettlement(3)}>
          <span className="ic" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>◷</span>
          <span className="t">분류 · 확정</span>
          <span className="s">{summary.pending.count ? `${summary.pending.count}건 남음` : "완료"}</span>
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

