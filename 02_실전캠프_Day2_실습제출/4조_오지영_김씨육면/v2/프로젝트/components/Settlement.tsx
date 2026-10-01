"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { UNCLASSIFIED, getAccount } from "@/lib/accounts";
import { won } from "@/lib/csv";
import type { MonthState } from "@/lib/store";
import type { Summary } from "@/lib/summary";
import { ClassifyStep } from "./steps/Classify";
import { DailyStep } from "./steps/Daily";
import { DepositsStep } from "./steps/Deposits";
import { PersonalStep } from "./steps/Personal";

import { UploadStep } from "./steps/Upload";
import { Btn, pct, shortWon } from "./ui";

type Update = (fn: (s: MonthState) => MonthState) => void;

type ViewMode = "daily" | "account";

/** 날짜로 볼지 계정으로 볼지 — 분류할 땐 날짜순, 다 하고 나선 계정별로 확인한다 */
function VariableStep({
  state,
  update,
  revenueGross,
  refreshKey,
}: {
  state: MonthState;
  update: (fn: (s: MonthState) => MonthState) => void;
  revenueGross: number;
  refreshKey?: number;
}) {
  const [mode, setMode] = useState<ViewMode>("daily");
  return (
    <>
      <div className="viewtabs">
        <button className={mode === "daily" ? "on" : ""} onClick={() => setMode("daily")}>
          일자별 상세
        </button>
        <button className={mode === "account" ? "on" : ""} onClick={() => setMode("account")}>
          계정별 묶음
        </button>
      </div>
      {mode === "daily" ? (
        <DailyStep state={state} update={update} refreshKey={refreshKey} />
      ) : (
        <ClassifyStep state={state} update={update} revenueGross={revenueGross} />
      )}
    </>
  );
}

export function Settlement({
  state,
  update,
  summary,
  openStep,
  refreshKey,
}: {
  state: MonthState;
  update: Update;
  summary: Summary;
  /** 대시보드에서 특정 단계로 보낼 때 */
  openStep?: number;
  /** 새로고침을 누르면 올라간다 — 아래 화면의 임시 상태를 되돌리는 열쇠 */
  refreshKey?: number;
}) {
  // 한 번에 한 단계만 열리면 월 정산이 느리다 — 훑으며 고치는 작업이라 동시에 열려 있어야 한다.
  // 거래가 들어와 있으면 분류 단계는 처음부터 펼쳐 둔다.
  const [open, setOpen] = useState<Set<number>>(() => new Set(state.transactions.length ? [2] : [1]));

  useEffect(() => {
    if (openStep) setOpen((o) => new Set(o).add(openStep));
  }, [openStep]);

  const variableCount = state.transactions.filter((t) => t.group !== "excluded").length;
  const personal = state.transactions.filter((t) => t.group === "personal");
  const personalCount = personal.length;
  const personalTotal = personal.reduce((a, b) => a + b.amount, 0);
  const deposits = state.bankDeposits ?? [];
  const depositCount = deposits.length;
  const depositTotal = deposits.reduce((a, b) => a + b.amount, 0);

  const toggle = (n: number) =>
    setOpen((o) => {
      const next = new Set(o);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  return (
    <main className="work">
      <div className="phead">
        <div>
          <h1>{`${state.month.split("-")[0]}년 ${Number(state.month.split("-")[1])}월 정산`}</h1>
          <div className="eyebrow sub">4단계 · 마감 뒤에도 고칠 수 있습니다</div>
        </div>
        <div className="sp">
          {summary.pending.count > 0 && <span className="delta down">확정 전 {summary.pending.count}건</span>}
          <span className="eyebrow" style={{ letterSpacing: ".06em" }}>
            {state.closed ? "마감됨" : "마감 전"}
          </span>
        </div>
      </div>

      <AccountTable state={state} summary={summary} />

      <div className="prog">
        <Cell label="불러오기" value={state.imports.length ? `${state.imports.length}개 · ${state.transactions.length}건` : "없음"} done={state.imports.length > 0} />
        <Cell
          label="지출 분류"
          value={summary.reviewCount ? `검수 ${summary.reviewCount}건` : variableCount ? `${variableCount}건 분류` : "없음"}
          warn={summary.reviewCount > 0}
          done={variableCount > 0 && !summary.reviewCount}
        />
        <Cell label="개인 지출" value={personalCount ? `${personalCount}건 · ${shortWon(personalTotal)}` : "없음"} done={personalCount > 0} />
        <Cell label="입금 내역" value={depositCount ? `${depositCount}건 · ${shortWon(depositTotal)}` : "없음"} done={depositCount > 0} />
        <Cell label="마감" value={state.closed ? "마감됨" : "마감 전"} done={state.closed} />
      </div>

      <div className="stepwrap">
        <Step n={1} title="불러오기" hint="카드 내역 · 기존 가계부 시트"
          status={state.imports.length ? { text: `${state.imports.length}개 파일`, tone: "ok" } : undefined}
          open={open.has(1)} onToggle={() => toggle(1)}>
          <UploadStep state={state} update={update} />
        </Step>

        <Step n={2} title="지출 분류 · 검수" hint="1일부터 말일까지 훑으며 확정합니다"
          status={
            summary.pending.count
              ? { text: `확정 전 ${summary.pending.count}건`, tone: "warn" }
              : variableCount
                ? { text: `${variableCount}건`, tone: "ok" }
                : undefined
          }
          open={open.has(2)} onToggle={() => toggle(2)}>
          <VariableStep state={state} update={update} revenueGross={summary.revenue.gross} refreshKey={refreshKey} />
        </Step>

        <Step n={3} title="개인 지출" hint="2단계에서 개인으로 뺀 것 — 여기서 소분류를 정합니다"
          status={
            personalCount
              ? { text: `${personalCount}건 · ${shortWon(personalTotal)}`, tone: "ok" }
              : undefined
          }
          open={open.has(3)} onToggle={() => toggle(3)}>
          <PersonalStep state={state} update={update} />
        </Step>

        <Step n={4} title="입금 내역" hint="들어온 돈을 매출 / 기타수입 / 제외로 가릅니다"
          status={
            depositCount
              ? { text: `${depositCount}건 · ${shortWon(depositTotal)}`, tone: "ok" }
              : undefined
          }
          open={open.has(4)} onToggle={() => toggle(4)}>
          <DepositsStep state={state} update={update} />
        </Step>
      </div>

      <div className="closebar">
        <div style={{ minWidth: 0 }}>
          <div className="lab">마감</div>
          <div style={{ fontSize: 13, fontWeight: 800, marginTop: 3 }}>
            {state.closed ? "마감됨 — 계속 고칠 수 있습니다" : "아직 마감 전입니다"}
          </div>
          {summary.pending.count > 0 && (
            <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--warn)", marginTop: 4 }}>
              확정 전 {summary.pending.count}건 · {won(summary.pending.total)}이 남아 있습니다.
              마감은 되지만 그만큼은 잠정입니다.
            </div>
          )}
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
