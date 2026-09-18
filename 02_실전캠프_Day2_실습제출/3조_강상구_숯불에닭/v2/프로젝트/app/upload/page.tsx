"use client";

import { useRef, useState } from "react";
import { useMonth } from "@/components/AppShell";
import { CategorySelect, Notice } from "@/components/ui";
import { useLedger } from "@/components/useLedger";
import ExpenseSection from "@/components/ExpenseSection";
import { BankParseError, parseBankSheet } from "@/lib/bank/parse";
import { DEFAULT_CHANNELS, type ChannelId, type Major } from "@/lib/categories";
import { classifyRows, findRule, newId, ruleFromChoice, usualAmounts } from "@/lib/classify";
import { num, won } from "@/lib/format";
import { findOverlap, monthLabel } from "@/lib/month";
import { getStore } from "@/lib/storage";
import type { Transaction } from "@/lib/types";

const SAMPLE = "/sample/가짜_거래내역_2026-08.xlsx";

export default function UploadPage() {
  const { month, setMonth } = useMonth();
  const ledger = useLedger(month);
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "warn"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  async function handleFile(file: File | Blob, name: string) {
    setBusy(true);
    setMessage(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true }) as never[][];
      const parsed = parseBankSheet(grid);

      const store = getStore();
      const overlap = findOverlap(await store.listUploads(), parsed.from, parsed.to);
      if (overlap) {
        setMessage({
          tone: "error",
          text: `이미 올린 기간이에요 (${overlap.from} ~ ${overlap.to}, ${overlap.rowCount}줄). 중복 저장하지 않았어요.`,
        });
        return;
      }

      const rules = await store.listRules();
      const txs = classifyRows(parsed.rows, rules, usualAmounts(ledger.txs.concat(ledger.prevTxs), rules));
      await store.saveTransactions(txs);
      const fileMonth = parsed.from.slice(0, 7);
      await store.saveUpload({
        id: newId(),
        month: fileMonth,
        from: parsed.from,
        to: parsed.to,
        rowCount: txs.length,
        uploadedAt: new Date().toISOString(),
      });
      await ledger.recordEdit(`거래내역 파일 올림 (${name}, ${txs.length}줄)`);

      const auto = txs.filter((t) => t.major).length;
      setMessage({
        tone: "ok",
        text: `${txs.length}줄 중 ${auto}줄을 자동으로 분류했어요. 확인이 필요한 줄은 ${txs.filter((t) => t.review).length}줄이에요. (${parsed.from} ~ ${parsed.to})`,
      });
      if (fileMonth !== month) setMonth(fileMonth);
      else await ledger.reload();
    } catch (e) {
      setMessage({
        tone: "error",
        text: e instanceof BankParseError ? e.message : `파일을 읽지 못했어요. 엑셀 파일(.xlsx, .xls, .csv)이 맞나요? (${e instanceof Error ? e.message : e})`,
      });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function loadSample() {
    const res = await fetch(SAMPLE);
    await handleFile(await res.blob(), "가짜 예시 파일");
  }

  const review = ledger.txs.filter((t) => t.review);
  const bankTxs = ledger.txs.filter((t) => t.source === "bank");

  return (
    <>
      <section className="card space-y-3">
        <h2 className="text-base font-bold">은행 거래내역 올리기</h2>
        <p className="text-sm text-stone-600">
          은행 사이트에서 내려받은 거래내역 엑셀을 그대로 올려 주세요. 파일은 이 화면 안에서만 읽고, 어디에도 보내지 않아요.
        </p>
        <input
          ref={fileRef}
          type="file"
          aria-label="거래내역 엑셀 파일"
          accept=".xlsx,.xls,.csv"
          disabled={busy}
          className="block w-full text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-orange-600 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0], e.target.files[0].name)}
        />
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" disabled={busy} onClick={loadSample}>
            가짜 예시 파일로 해 보기
          </button>
          <a className="btn-ghost" href={SAMPLE} download>
            예시 파일 받기
          </a>
        </div>
        {busy && <Notice tone="info">읽는 중…</Notice>}
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold">확인이 필요한 줄 {review.length > 0 && <span className="text-orange-600">{review.length}</span>}</h2>
          <span className="text-xs text-stone-500">
            {monthLabel(month)} · 은행 {bankTxs.length}줄
          </span>
        </div>
        {ledger.error && <Notice tone="error">{ledger.error}</Notice>}
        {!ledger.loading && bankTxs.length === 0 && <Notice tone="info">이 달에 올린 거래내역이 아직 없어요.</Notice>}
        {bankTxs.length > 0 && review.length === 0 && <Notice tone="ok">확인할 줄이 없어요. 손익 탭에서 결과를 보세요.</Notice>}
        {review.map((t) => (
          <ReviewCard key={t.id} tx={t} ledger={ledger} />
        ))}
      </section>

      <ExpenseSection month={month} ledger={ledger} />

      {bankTxs.length > 0 && (
        <section className="card">
          <button className="flex w-full items-center justify-between text-sm font-semibold" onClick={() => setShowAll((v) => !v)}>
            전체 거래 보기 ({ledger.txs.length}줄)<span>{showAll ? "▲" : "▼"}</span>
          </button>
          {showAll && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-xs">
                <thead className="text-left text-stone-500">
                  <tr>
                    <th className="py-1">날짜</th>
                    <th>거래처</th>
                    <th>분류</th>
                    <th className="text-right">출금</th>
                    <th className="text-right">입금</th>
                  </tr>
                </thead>
                <tbody className="num divide-y divide-stone-100">
                  {ledger.txs.map((t) => (
                    <tr key={t.id}>
                      <td className="py-1">{t.date.slice(5)}</td>
                      <td>{t.payee}</td>
                      <td className={t.major ? "" : "text-orange-600"}>{t.major ? `${t.major} › ${t.minor}` : "미분류"}</td>
                      <td className="text-right">{t.out ? num(t.out) : ""}</td>
                      <td className="text-right">{t.in ? num(t.in) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}

function ReviewCard({ tx, ledger }: { tx: Transaction; ledger: ReturnType<typeof useLedger> }) {
  const isIncome = tx.in > 0;
  const [major, setMajor] = useState<Major | "">(tx.major ?? (isIncome ? "수입" : ""));
  const [minor, setMinor] = useState(tx.minor ?? (isIncome ? "매출액" : ""));
  const [channel, setChannel] = useState<ChannelId | "">(tx.channel ?? "");
  const hasRule = !!findRule(tx, ledger.rules);
  // 처음 보는 거래처는 기억하는 게 기본. 애매한 곳(마트)·큰 금액은 이번 줄만.
  const [remember, setRemember] = useState(!hasRule);
  const [saving, setSaving] = useState(false);

  async function confirm() {
    if (!major) return;
    setSaving(true);
    const store = getStore();
    const ch = isIncome && channel ? channel : null;
    const updated: Transaction[] = [{ ...tx, major, minor, channel: ch, review: null }];

    if (remember && !hasRule) {
      await store.saveRule(ruleFromChoice(tx, major, minor, ch));
      // 같은 거래처의 다른 "처음 보는" 줄도 함께 정리한다
      for (const other of ledger.txs) {
        if (other.id !== tx.id && other.review === "처음 보는 거래처" && other.payee === tx.payee && other.in > 0 === isIncome) {
          updated.push({ ...other, major, minor, channel: ch, review: null });
        }
      }
    }
    await store.saveTransactions(updated);
    await ledger.recordEdit(`${tx.payee} ${won(tx.out || tx.in)} → ${major} › ${minor}`);
    await ledger.reload();
  }

  return (
    <article className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold">{tx.payee}</p>
          <p className="text-xs text-stone-500">
            {tx.date} · {isIncome ? "입금" : "출금"}
          </p>
        </div>
        <div className="text-right">
          <p className={`num text-sm font-bold ${isIncome ? "text-sky-700" : ""}`}>{won(tx.out || tx.in)}</p>
          <span className="mt-0.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">{tx.review}</span>
        </div>
      </div>

      <CategorySelect
        idPrefix={tx.payee}
        major={major}
        minor={minor}
        includeIncome={isIncome}
        onChange={(m, n) => {
          setMajor(m);
          setMinor(n);
        }}
      />

      {isIncome && major === "수입" && (
        <select aria-label={`${tx.payee} 채널`} className="field" value={channel} onChange={(e) => setChannel(e.target.value as ChannelId | "")}>
          <option value="">어느 채널의 입금인가요? (없으면 그대로)</option>
          {DEFAULT_CHANNELS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      <div className="flex items-center justify-between gap-3">
        {hasRule ? (
          <span className="text-xs text-stone-500">규칙은 그대로 두고 이번 줄만 확인해요</span>
        ) : (
          <label className="flex items-center gap-2 text-xs text-stone-700">
            <input type="checkbox" className="h-4 w-4 accent-orange-600" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            다음부터 이 거래처는 이렇게 분류
          </label>
        )}
        <button className="btn-primary" disabled={!major || saving} onClick={confirm}>
          확인
        </button>
      </div>
    </article>
  );
}
