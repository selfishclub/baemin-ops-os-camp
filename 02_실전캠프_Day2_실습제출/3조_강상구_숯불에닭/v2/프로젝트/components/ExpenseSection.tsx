"use client";

import { useState } from "react";
import { CategorySelect, ConfirmDialog, MoneyInput, Notice } from "@/components/ui";
import { useLedger } from "@/components/useLedger";
import type { Major } from "@/lib/categories";
import { newId } from "@/lib/classify";
import { won } from "@/lib/format";
import { isClosed, monthLabel } from "@/lib/month";
import { getStore } from "@/lib/storage";
import type { Transaction } from "@/lib/types";
import { checkExpense, type Issue } from "@/lib/validate";

export default function ExpenseSection({ month, ledger }: { month: string; ledger: ReturnType<typeof useLedger> }) {
  const [date, setDate] = useState(`${month}-01`);
  const [major, setMajor] = useState<Major | "">("매출원가");
  const [minor, setMinor] = useState("기타재료비");
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<"현금" | "카드">("현금");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [asking, setAsking] = useState(false);

  const manual = ledger.txs.filter((t) => t.source === "manual");
  const dateInMonth = date.startsWith(month) ? date : `${month}-01`;

  function tryAdd() {
    const usualMax = Math.max(0, ...ledger.txs.map((t) => t.out));
    const found = checkExpense(amount, dateInMonth, usualMax || undefined);
    if (!major) found.push({ level: "error", message: "대분류를 골라 주세요." });
    if (!payee.trim()) found.push({ level: "error", message: "사용내역을 적어 주세요. (예: 시장 채소)" });
    setIssues(found);
    if (found.some((i) => i.level === "error")) return;
    if (found.length) setAsking(true);
    else void add();
  }

  async function add() {
    setAsking(false);
    const tx: Transaction = {
      id: newId(),
      month,
      date: dateInMonth,
      payee: payee.trim(),
      out: amount,
      in: 0,
      source: "manual",
      major: major as Major,
      minor,
      channel: null,
      review: null,
      payMethod,
    };
    await getStore().saveTransactions([tx]);
    await ledger.recordEdit(`지출 직접 추가: ${tx.payee} ${won(tx.out)}`);
    setPayee("");
    setAmount(0);
    setIssues([]);
    await ledger.reload();
  }

  async function remove(t: Transaction) {
    await getStore().deleteTransaction(t.id);
    await ledger.recordEdit(`직접 추가한 지출 지움: ${t.payee} ${won(t.out)}`);
    await ledger.reload();
  }

  return (
    <>
      <section className="card space-y-3">
        <h2 className="text-base font-bold">통장에 안 보이는 지출 추가</h2>
        <p className="text-sm text-stone-600">현금이나 다른 카드로 산 재료비처럼, 가게 통장 내역에 안 찍히는 돈을 적어 주세요. 날짜는 <b>그 비용이 속한 달</b>로 넣으면 돼요.</p>
        {isClosed(ledger.closing) && <Notice tone="warn">마감한 달이에요. 추가하면 수정 기록이 남아요.</Notice>}

        <div className="grid grid-cols-2 gap-2">
          <input aria-label="날짜" type="date" className="field" value={dateInMonth} min={`${month}-01`} max={`${month}-31`} onChange={(e) => setDate(e.target.value)} />
          <select aria-label="결제 방법" className="field" value={payMethod} onChange={(e) => setPayMethod(e.target.value as "현금" | "카드")}>
            <option>현금</option>
            <option>카드</option>
          </select>
        </div>
        <CategorySelect
          idPrefix="지출"
          major={major}
          minor={minor}
          onChange={(m, n) => {
            setMajor(m);
            setMinor(n);
          }}
        />
        <input aria-label="사용내역" className="field" placeholder="사용내역 (예: 시장 채소)" value={payee} onChange={(e) => setPayee(e.target.value)} />
        <MoneyInput label="금액" value={amount} onChange={(n) => setAmount(n ?? 0)} />

        {issues.filter((i) => i.level === "error").map((i) => (
          <Notice key={i.message} tone="error">
            {i.message}
          </Notice>
        ))}
        <button className="btn-primary w-full" onClick={tryAdd}>
          추가
        </button>
      </section>

      <section className="card space-y-2">
        <h2 className="text-base font-bold">
          {monthLabel(month)}에 직접 추가한 지출 <span className="text-stone-400">{manual.length}</span>
        </h2>
        {manual.length === 0 && <p className="text-sm text-stone-500">아직 없어요.</p>}
        <ul className="divide-y divide-stone-100">
          {manual.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div>
                <p className="font-semibold">{t.payee}</p>
                <p className="text-xs text-stone-500">
                  {t.date} · {t.major} › {t.minor} · {t.payMethod}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="num font-bold">{won(t.out)}</span>
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => remove(t)}>
                  지우기
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {asking && (
        <ConfirmDialog title="금액을 한 번 더 확인해 주세요" confirmLabel="맞아요, 추가" onConfirm={add} onCancel={() => setAsking(false)}>
          {issues.map((i) => (
            <p key={i.message}>• {i.message}</p>
          ))}
          <p className="num font-bold">{won(amount)}</p>
        </ConfirmDialog>
      )}
    </>
  );
}
