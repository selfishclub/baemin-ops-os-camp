"use client";

import { useState } from "react";
import { won } from "@/lib/csv";
import { fixedTemplate, prevMonthOf } from "@/lib/fixedTemplate";
import { loadMonth, makeManualTx, removeTx, patchTx, type MonthState } from "@/lib/store";
import { merchantKey } from "@/lib/tree";
import type { Transaction } from "@/lib/types";
import { Btn, Money } from "../ui";

const isFixedRow = (t: Transaction) => t.source === "ledger-fixed" || t.source === "fixed-copy";

/** 카드 파일에 이미 들어온 건과 겹치는지 — 출처가 달라도 같은 건으로 본다 */
function findDuplicate(existing: Transaction[], sub: string, amount: number) {
  const key = merchantKey(sub);
  return existing.find(
    (t) =>
      !isFixedRow(t) &&
      amount > 0 &&
      t.amount === amount &&
      (merchantKey(t.merchant).includes(key) || key.includes(merchantKey(t.merchant)))
  );
}

export function FixedCostStep({
  state,
  update,
}: {
  state: MonthState;
  update: (fn: (s: MonthState) => MonthState) => void;
}) {
  const rows = state.transactions.filter(isFixedRow);
  const prev = prevMonthOf(state.month);
  const [note, setNote] = useState<string | null>(null);
  const [dups, setDups] = useState<string[]>([]);

  function seed(items: { account: string; sub: string; amount: number }[], label: string) {
    const skipped: string[] = [];
    const added = items.filter((f) => {
      const dup = findDuplicate(state.transactions, f.sub, f.amount);
      if (dup) {
        skipped.push(`${f.sub} ${won(f.amount)}`);
        return false;
      }
      return true;
    });
    update((s) => ({
      ...s,
      transactions: [
        ...s.transactions,
        ...added.map((f) =>
          makeManualTx({
            month: s.month,
            date: null,
            account: f.account,
            sub: f.sub,
            merchant: f.sub,
            amount: f.amount,
            source: "fixed-copy",
          })
        ),
      ],
    }));
    setNote(`${label} — ${added.length}건 넣었습니다.`);
    setDups(skipped);
  }

  function copyPrev() {
    const src = loadMonth(prev).transactions.filter(isFixedRow);
    if (!src.length) {
      setNote(`${prev} 고정비가 없습니다. 템플릿에서 시작하세요.`);
      setDups([]);
      return;
    }
    seed(
      src.map((t) => ({ account: t.account, sub: t.sub ?? t.merchant, amount: t.amount })),
      `${prev}에서 복사`
    );
  }

  const total = rows.reduce((a, b) => a + b.amount, 0);
  const rangeOf = (sub: string | null) => fixedTemplate().find((f) => f.sub === sub)?.range;

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 9, alignItems: "center" }}>
        <Btn onClick={copyPrev}>{prev} 복사</Btn>
        <Btn
          onClick={() =>
            seed(
              fixedTemplate().map((f) => ({ account: f.account, sub: f.sub, amount: f.amount })),
              "템플릿"
            )
          }
        >
          템플릿에서 시작
        </Btn>
        {note && <span className="note-line">{note}</span>}
      </div>

      {dups.length > 0 && (
        <div className="dupnote">
          카드 파일에 이미 같은 건이 있어 건너뛰었습니다 — <b>{dups.join(" · ")}</b>. 금액이 다르면 아래에서 고쳐 주세요.
        </div>
      )}

      {rows.length > 0 && (
        <div className="scroll-x">
          <table className="data" style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>계정</th>
                <th style={{ textAlign: "left" }}>항목</th>
                <th>금액</th>
                <th style={{ textAlign: "left" }}>6개월 범위</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const range = rangeOf(t.sub);
                const out = range && t.amount > 0 && (t.amount < range[0] || t.amount > range[1]);
                return (
                  <tr key={t.id}>
                    <td style={{ color: "var(--muted)" }}>{t.account}</td>
                    <td>{t.sub ?? t.merchant}</td>
                    <td>
                      <input
                        type="number"
                        value={t.amount}
                        onChange={(e) => update((s) => patchTx(s, t.id, { amount: Number(e.target.value) || 0 }))}
                        className="inp rt"
                        style={{ width: 118, borderColor: out ? "var(--warn)" : undefined }}
                      />
                    </td>
                    <td style={{ textAlign: "left", color: "var(--muted)", fontSize: 11.5 }}>
                      {range ? `${won(range[0])} ~ ${won(range[1])}` : "매월 동일"}
                      {out && <b style={{ color: "var(--warn)" }}> · 범위 밖</b>}
                    </td>
                    <td>
                      <Btn onClick={() => update((s) => removeTx(s, t.id))}>삭제</Btn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>합계 {rows.length}건</td>
                <td><Money v={total} /></td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="note-line" style={{ marginTop: 10 }}>
        범위를 벗어난 금액은 표시만 합니다. 입력은 막지 않습니다.
      </p>
    </div>
  );
}
