"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { UNCLASSIFIED, getAccount } from "@/lib/accounts";
import { won } from "@/lib/csv";
import type { MonthState } from "@/lib/store";
import type { Summary } from "@/lib/summary";
import { ClassifyStep } from "./steps/Classify";
import { FixedCostStep } from "./steps/FixedCost";
import { RevenueStep } from "./steps/Revenue";
import { UploadStep } from "./steps/Upload";
import { Btn, pct, shortWon } from "./ui";

type Update = (fn: (s: MonthState) => MonthState) => void;

export function Settlement({
  state,
  update,
  summary,
  openStep,
}: {
  state: MonthState;
  update: Update;
  summary: Summary;
  /** 대시보드에서 특정 단계로 보낼 때 */
  openStep?: number;
}) {
  const [open, setOpen] = useState<number | null>(state.transactions.length ? 3 : 1);

  useEffect(() => {
    if (openStep) setOpen(openStep);
  }, [openStep]);

  const fixed = state.transactions.filter(
    (t) => t.source === "ledger-fixed" || t.source === "fixed-copy"
  );
  const fixedTotal = fixed.reduce((a, b) => a + b.amount, 0);
  const variableCount = state.transactions.filter(
    (t) => t.source !== "ledger-fixed" && t.source !== "fixed-copy" && t.group !== "excluded"
  ).length;

  const toggle = (n: number) => setOpen((o) => (o === n ? null : n));

  return (
    <main className="work">
      <div className="greet">
        <h1>{`${state.month.split("-")[0]}년 ${Number(state.month.split("-")[1])}월 정산`}</h1>
        <p>4단계입니다. 마감 뒤에도 고칠 수 있고, 고치면 대시보드 숫자가 다시 움직입니다.</p>
      </div>

      <AccountTable state={state} summary={summary} />

      <div className="prog">
        <Cell label="불러오기" value={state.imports.length ? `${state.imports.length}개 · ${state.transactions.length}건` : "없음"} done={state.imports.length > 0} />
        <Cell label="고정비" value={fixed.length ? `${fixed.length}건 · ${shortWon(fixedTotal)}` : "없음"} done={fixed.length > 0} />
        <Cell
          label="변동지출"
          value={summary.reviewCount ? `검수 ${summary.reviewCount}건` : variableCount ? `${variableCount}건 분류` : "없음"}
          warn={summary.reviewCount > 0}
          done={variableCount > 0 && !summary.reviewCount}
        />
        <Cell label="매출" value={summary.revenue.gross ? shortWon(summary.revenue.gross) : "미입력"} done={summary.revenue.gross > 0} />
        <Cell label="마감" value={state.closed ? "마감됨" : "마감 전"} done={state.closed} />
      </div>

      <div className="stepwrap">
        <Step n={1} title="불러오기" hint="카드 내역 · 기존 가계부 시트"
          status={state.imports.length ? { text: `${state.imports.length}개 파일`, tone: "ok" } : undefined}
          open={open === 1} onToggle={() => toggle(1)}>
          <UploadStep state={state} update={update} />
        </Step>

        <Step n={2} title="고정비" hint="전월 복사 → 금액 수정"
          status={fixed.length ? { text: `${fixed.length}건 · ${won(fixedTotal)}`, tone: "ok" } : undefined}
          open={open === 2} onToggle={() => toggle(2)}>
          <FixedCostStep state={state} update={update} />
        </Step>

        <Step n={3} title="변동지출 분류·검수" hint="분류 결과를 보면서 바로 고칩니다"
          status={
            summary.reviewCount
              ? { text: `검수 ${summary.reviewCount}건`, tone: "warn" }
              : variableCount
                ? { text: `${variableCount}건`, tone: "ok" }
                : undefined
          }
          open={open === 3} onToggle={() => toggle(3)}>
          <ClassifyStep state={state} update={update} revenueGross={summary.revenue.gross} />
        </Step>

        <Step n={4} title="매출" hint="채널별 매출액 / 입금액 — 수수료는 자동 계산"
          status={summary.revenue.gross ? { text: won(summary.revenue.gross), tone: "ok" } : undefined}
          open={open === 4} onToggle={() => toggle(4)}>
          <RevenueStep state={state} update={update} summary={summary} />
        </Step>
      </div>

      <div className="closebar">
        <div style={{ minWidth: 0 }}>
          <div className="lab">마감</div>
          <div style={{ fontSize: 13, fontWeight: 800, marginTop: 3 }}>
            {state.closed ? "마감됨 — 계속 고칠 수 있습니다" : "아직 마감 전입니다"}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 9 }}>
          {state.closed ? (
            <Btn onClick={() => update((s) => ({ ...s, closed: false }))}>마감 해제</Btn>
          ) : (
            <Btn tone="primary" onClick={() => update((s) => ({ ...s, closed: true }))}>마감하기</Btn>
          )}
        </div>
      </div>
    </main>
  );
}

/**
 * 분류하면서 금액이 움직이는 걸 바로 봐야 한다.
 * 매출이 아직 없으면 '매출 대비' 대신 불러온 총액 대비 구성비를 보여준다.
 */
function AccountTable({ state, summary }: { state: MonthState; summary: Summary }) {
  const rows = useMemo(() => {
    const by = new Map<string, { amount: number; count: number; group: string }>();
    for (const t of state.transactions) {
      const cur = by.get(t.account) ?? { amount: 0, count: 0, group: t.group };
      cur.amount += t.amount;
      cur.count += 1;
      by.set(t.account, cur);
    }
    return [...by.entries()].map(([account, v]) => ({
      account,
      ...v,
      group: getAccount(account)?.group ?? v.group,
    }));
  }, [state.transactions]);

  if (!rows.length) return null;

  const unclassified = rows.find((r) => r.account === UNCLASSIFIED);
  const business = rows.filter((r) => r.group === "expense").sort((a, b) => b.amount - a.amount);
  const personal = rows.filter((r) => r.group === "personal").sort((a, b) => b.amount - a.amount);
  const income = rows.filter((r) => r.group === "excluded" || r.group === "revenue");

  const bizTotal = business.reduce((a, b) => a + b.amount, 0);
  const bizCount = business.reduce((a, b) => a + b.count, 0);
  const perTotal = personal.reduce((a, b) => a + b.amount, 0);
  const perCount = personal.reduce((a, b) => a + b.count, 0);
  const loaded = rows.reduce((a, b) => a + b.amount, 0);

  const gross = summary.revenue.gross;
  const ratio = (v: number) => (gross > 0 ? v / gross : loaded > 0 ? v / loaded : 0);
  const ratioLabel = gross > 0 ? "매출 대비" : "구성비";

  return (
    <section className="panel" style={{ padding: "18px 22px" }}>
      <div className="scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>계정</th>
              <th>금액</th>
              <th>건수</th>
              <th>{ratioLabel}</th>
            </tr>
          </thead>
          <tbody>
            {unclassified && (
              <tr style={{ background: "var(--warn-soft)" }}>
                <td style={{ fontWeight: 800, color: "var(--warn)" }}>
                  미분류 <span style={{ fontWeight: 600, fontSize: 11 }}>아직 손익에 안 들어갑니다</span>
                </td>
                <td className="num" style={{ fontWeight: 800, color: "var(--warn)" }}>
                  {won(unclassified.amount)}
                </td>
                <td className="num" style={{ color: "var(--warn)" }}>{unclassified.count}건</td>
                <td className="num" style={{ color: "var(--warn)" }}>{pct(ratio(unclassified.amount))}</td>
              </tr>
            )}

            {business.map((r) => (
              <tr key={r.account}>
                <td>{r.account}</td>
                <td className="num">{won(r.amount)}</td>
                <td className="num" style={{ color: "var(--muted)" }}>{r.count}건</td>
                <td className="num" style={{ color: "var(--muted)" }}>{pct(ratio(r.amount))}</td>
              </tr>
            ))}

            {business.length > 0 && (
              <tr style={{ borderTop: "1px solid var(--line-2)" }}>
                <td style={{ fontWeight: 800 }}>사업 지출 계</td>
                <td className="num" style={{ fontWeight: 800 }}>{won(bizTotal)}</td>
                <td className="num" style={{ color: "var(--muted)" }}>{bizCount}건</td>
                <td className="num" style={{ color: "var(--muted)" }}>{pct(ratio(bizTotal))}</td>
              </tr>
            )}

            {personal.length > 0 && (
              <tr>
                <td style={{ color: "var(--muted)" }}>
                  개인지출 <span style={{ fontSize: 11 }}>손익 제외</span>
                </td>
                <td className="num" style={{ color: "var(--muted)" }}>{won(perTotal)}</td>
                <td className="num" style={{ color: "var(--muted)" }}>{perCount}건</td>
                <td className="num" style={{ color: "var(--muted)" }}>{pct(ratio(perTotal))}</td>
              </tr>
            )}

            {income.map((r) => (
              <tr key={r.account}>
                <td style={{ color: "var(--muted)" }}>
                  {r.account} <span style={{ fontSize: 11 }}>손익 제외</span>
                </td>
                <td className="num" style={{ color: "var(--muted)" }}>{won(r.amount)}</td>
                <td className="num" style={{ color: "var(--muted)" }}>{r.count}건</td>
                <td className="num" style={{ color: "var(--muted)" }}>{pct(ratio(r.amount))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>불러온 합계</td>
              <td className="num">{won(loaded)}</td>
              <td className="num">{state.transactions.length}건</td>
              <td className="num" style={{ color: "var(--muted)" }}>
                {gross > 0 ? pct(ratio(loaded)) : "100.0%"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {gross === 0 && (
        <p className="note-line" style={{ marginTop: 10 }}>
          매출이 아직 없어 <b>구성비</b>(불러온 합계 대비)로 보여줍니다. 매출을 넣으면 매출 대비로 바뀝니다.
        </p>
      )}
    </section>
  );
}

function Cell({ label, value, done, warn }: { label: string; value: string; done?: boolean; warn?: boolean }) {
  return (
    <div>
      <div className="lab">{label}</div>
      <div className={`pv${warn ? " warn" : done ? " done" : ""}`}>{value}</div>
    </div>
  );
}

function Step({
  n,
  title,
  hint,
  status,
  open,
  onToggle,
  children,
}: {
  n: number;
  title: string;
  hint: string;
  status?: { text: string; tone: "ok" | "warn" };
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="step">
      <button className="step-h" onClick={onToggle} aria-expanded={open}>
        <span className="step-n">{n}</span>
        <span className="step-t">{title}</span>
        <span className="step-hint">{hint}</span>
        {status && <span className={`step-s ${status.tone}`}>{status.text}</span>}
      </button>
      {open && <div className="step-b">{children}</div>}
    </section>
  );
}
