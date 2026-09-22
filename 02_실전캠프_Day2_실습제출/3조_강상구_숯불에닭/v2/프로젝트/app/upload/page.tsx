"use client";

import { useEffect, useRef, useState } from "react";
import { useMonth } from "@/components/AppShell";
import { CategorySelect, Notice } from "@/components/ui";
import { useLedger } from "@/components/useLedger";
import ExpenseSection from "@/components/ExpenseSection";
import { BankParseError, parseBankSheet } from "@/lib/bank/parse";
import { DEFAULT_CHANNELS, type ChannelId, type Major } from "@/lib/categories";
import { classifyRows, findRule, newId, ruleFromChoice, usualAmounts } from "@/lib/classify";
import { num, won } from "@/lib/format";
import { findOverlap, monthLabel, monthsBetween, newBankRowsOnly, prevMonth } from "@/lib/month";
import { getStore } from "@/lib/storage";
import type { Transaction } from "@/lib/types";
import { DEFAULT_PAY_DAYS, PAY_DAYS_KEY, isPrevMonthDefault } from "@/lib/paydays";

const SAMPLES = [
  { label: "8월", file: "/sample/가짜_거래내역_2026-08.xlsx" },
  { label: "9월 (일별 자료와 짝)", file: "/sample/가짜_거래내역_2026-09.xlsx" },
];

export default function UploadPage() {
  const { month, setMonth } = useMonth();
  const ledger = useLedger(month);
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "warn" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [payDays, setPayDays] = useState<number[]>(DEFAULT_PAY_DAYS);
  useEffect(() => {
    getStore()
      .getSetting<number[]>(PAY_DAYS_KEY)
      .then((v) => v && setPayDays(v))
      .catch(() => {});
  }, []);
  const [filter, setFilter] = useState("");
  const [txKind, setTxKind] = useState<"전체" | "입금" | "출금" | "미분류">("전체");

  async function handleFile(file: File | Blob, name: string) {
    setBusy(true);
    setMessage(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true }) as never[][];
      const parsed = parseBankSheet(grid);

      const store = getStore();
      // 이미 올린 기간과 겹치면: 있는 줄은 빼고 새 줄만 넣는다 (은행에서 기간을 겹쳐 내려받는 일이 많다)
      let rows = parsed.rows;
      let duplicates = 0;
      const overlap = findOverlap(await store.listUploads(), parsed.from, parsed.to);
      if (overlap) {
        const existing = (await Promise.all(monthsBetween(parsed.from, parsed.to).map((m) => store.listTransactions(m)))).flat().filter((t) => t.source === "bank" && t.date >= parsed.from && t.date <= parsed.to);
        ({ fresh: rows, duplicates } = newBankRowsOnly(parsed.rows, existing));
        if (rows.length === 0) {
          setMessage({ tone: "info", text: `이미 다 들어 있는 거래예요 (${parsed.from} ~ ${parsed.to}, ${duplicates}줄). 새로 넣은 줄은 없어요.` });
          return;
        }
      }

      const rules = await store.listRules();
      const txs = classifyRows(rows, rules, usualAmounts(ledger.txs.concat(ledger.prevTxs), rules));
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
        text: `${txs.length}줄 중 ${auto}줄을 자동으로 분류했어요. 확인이 필요한 줄은 ${txs.filter((t) => t.review).length}줄이에요. (${parsed.from} ~ ${parsed.to})${duplicates ? ` 이미 있던 ${duplicates}줄은 빼고 넣었어요.` : ""}`,
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

  async function loadSample(file: string) {
    const res = await fetch(file);
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
          {SAMPLES.map((s) => (
            <button key={s.file} className="btn-ghost" disabled={busy} onClick={() => loadSample(s.file)}>
              가짜 {s.label} 파일로 해 보기
            </button>
          ))}
          <a className="btn-ghost" href={SAMPLES[0].file} download>
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
          <ReviewCard key={t.id} tx={t} ledger={ledger} payDays={payDays} />
        ))}
      </section>

      <ExpenseSection month={month} ledger={ledger} />

      {bankTxs.length > 0 && (
        <section className="card">
          <button className="flex w-full items-center justify-between text-sm font-semibold" onClick={() => setShowAll((v) => !v)}>
            전체 거래 보기 ({ledger.txs.length}줄)<span>{showAll ? "▲" : "▼"}</span>
          </button>
          {showAll && (
            <div className="mt-3 space-y-2">
              <p className="text-[11px] text-stone-500">이미 확인한 줄을 바꾸려면 그 줄의 “고치기”를 누르세요. 규칙까지 바꿀지는 거기서 고를 수 있어요.</p>
              <input aria-label="거래 찾기" className="field" placeholder="거래처·분류로 찾기 (예: 마트, 임대료)" value={filter} onChange={(e) => setFilter(e.target.value)} />
              <div className="flex flex-wrap gap-1.5 text-xs">
                {(["전체", "입금", "출금", "미분류"] as const).map((k) => (
                  <button key={k} className={`rounded-full px-3 py-1 ${txKind === k ? "bg-orange-100 font-semibold text-orange-800" : "bg-stone-100 text-stone-600"}`} onClick={() => setTxKind(k)}>
                    {k}
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                {groupByDate(
                  ledger.txs
                    .filter((t) => !filter.trim() || `${t.payee} ${t.major ?? ""} ${t.minor ?? ""}`.replace(/\s/g, "").includes(filter.replace(/\s/g, "")))
                    .filter((t) => (txKind === "입금" ? t.in > 0 : txKind === "출금" ? t.out !== 0 : txKind === "미분류" ? !t.major : true)),
                ).map(({ date, txs }) => (
                  <div key={date}>
                    <div className="num flex items-baseline justify-between border-b border-stone-200 pb-1 text-[11px] text-stone-500">
                      <span className="font-semibold text-stone-700">{dayLabel(date)}</span>
                      <span>
                        {txs.some((t) => t.in > 0) && <span className="text-emerald-700">입금 +{num(txs.reduce((a, t) => a + t.in, 0))}</span>}
                        {txs.some((t) => t.in > 0) && txs.some((t) => t.out !== 0) && " · "}
                        {txs.some((t) => t.out !== 0) && <span>출금 −{num(txs.reduce((a, t) => a + t.out, 0))}</span>}
                      </span>
                    </div>
                    <ul className="divide-y divide-stone-100">
                      {txs.map((t) => {
                        const { tag, name } = splitPayee(t.payee);
                        return (
                          <li key={t.id} className={editingId === t.id ? "rounded-lg bg-orange-50" : ""}>
                            <div className="flex items-center gap-2 py-1.5">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-stone-800">
                                  {tag && <span className="mr-1 text-[10px] font-normal text-stone-400">{tag}</span>}
                                  {name}
                                </p>
                                <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] ${t.major ? (t.major === "제외" ? "bg-stone-100 text-stone-500" : "bg-stone-100 text-stone-700") : "bg-orange-100 font-semibold text-orange-700"}`}>
                                  {t.major ? `${t.major} · ${t.minor}` : "미분류"}
                                </span>
                              </div>
                              <span className={`num whitespace-nowrap text-right text-sm font-semibold ${t.in > 0 ? "text-emerald-700" : t.out < 0 ? "text-stone-400" : "text-stone-800"}`}>
                                {t.in > 0 ? `+${num(t.in)}` : t.out < 0 ? `취소 ${num(-t.out)}` : `−${num(t.out)}`}
                              </span>
                              <button className="whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold text-orange-700 hover:bg-orange-50" onClick={() => setEditingId(editingId === t.id ? null : t.id)}>
                                {editingId === t.id ? "닫기" : "고치기"}
                              </button>
                            </div>
                            {editingId === t.id && (
                              <div className="pb-2">
                                <ReviewCard tx={t} ledger={ledger} payDays={payDays} editing onDone={() => setEditingId(null)} />
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}

function ReviewCard({ tx, ledger, payDays, editing = false, onDone }: { tx: Transaction; ledger: ReturnType<typeof useLedger>; payDays: number[]; editing?: boolean; onDone?: () => void }) {
  const isIncome = tx.in > 0;
  const [major, setMajor] = useState<Major | "">(tx.major ?? (isIncome ? "수입" : ""));
  const [minor, setMinor] = useState(tx.minor ?? (isIncome ? "매출액" : ""));
  const [channel, setChannel] = useState<ChannelId | "">(tx.channel ?? "");
  const rule = findRule(tx, ledger.rules);
  const hasRule = !!rule;
  // 처음 보는 거래처는 기억하는 게 기본. 애매한 곳(마트)·큰 금액은 이번 줄만. 고치기 모드에서는 "규칙도 바꾸기"가 기본 꺼짐.
  const [remember, setRemember] = useState(!hasRule && !editing);
  // 급여·거래처 대금처럼 다음 달 10일에 내는 돈 → 지난달 비용. 이미 옮겨진 줄이면 체크된 채로 시작.
  const [lastMonth, setLastMonthState] = useState(tx.month !== tx.date.slice(0, 7));
  const [lastMonthTouched, setLastMonthTouched] = useState(tx.month !== tx.date.slice(0, 7));
  const setLastMonth = (v: boolean) => {
    setLastMonthTouched(true);
    setLastMonthState(v);
  };
  // 지급일(규칙 탭 설정)에 나간 인건비·재료비는 지난달 비용이 기본. 사장님이 직접 건드렸으면 그대로 둔다.
  useEffect(() => {
    if (!lastMonthTouched && !isIncome) setLastMonthState(isPrevMonthDefault(tx.date, major, payDays));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [major, payDays]);
  const [saving, setSaving] = useState(false);

  async function confirm() {
    if (!major) return;
    setSaving(true);
    const store = getStore();
    const ch = isIncome && channel ? channel : null;
    const monthOf = (t: Transaction) => (lastMonth ? prevMonth(t.date.slice(0, 7)) : t.date.slice(0, 7));
    const updated: Transaction[] = [{ ...tx, month: monthOf(tx), major, minor, channel: ch, review: null }];

    if (remember && !hasRule) {
      await store.saveRule(ruleFromChoice(tx, major, minor, ch, false, lastMonth));
      // 같은 거래처의 다른 "처음 보는" 줄도 함께 정리한다
      for (const other of ledger.txs) {
        if (other.id !== tx.id && other.review === "처음 보는 거래처" && other.payee === tx.payee && other.in > 0 === isIncome) {
          updated.push({ ...other, month: monthOf(other), major, minor, channel: ch, review: null });
        }
      }
    } else if (remember && rule) {
      // 고치기: 규칙도 바꾸고, 그 규칙으로 분류됐던 이 달의 다른 줄도 같이 바꾼다
      await store.saveRule({ ...rule, major, minor, channel: ch, prev_month: lastMonth });
      for (const other of ledger.txs) {
        if (other.id !== tx.id && other.in > 0 === isIncome && other.major === rule.major && other.minor === rule.minor && findRule(other, ledger.rules)?.id === rule.id) {
          updated.push({ ...other, month: monthOf(other), major, minor, channel: ch, review: null });
        }
      }
    }
    await store.saveTransactions(updated);
    await ledger.recordEdit(`${tx.payee} ${won(tx.out || tx.in)} → ${major} › ${minor}${lastMonth ? " (지난달 비용)" : ""}`);
    await ledger.reload();
    setSaving(false);
    onDone?.();
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

      {major === "제외" && <Notice tone="info">손익에 넣지 않아요. 내 통장끼리 옮긴 돈, 대출·상환, 보증금처럼 수입도 비용도 아닌 돈에 써요.</Notice>}
      {isIncome && major && major !== "수입" && major !== "제외" && (
        <Notice tone="info">
          환급·결제 취소로 처리해요. 매출에 더하지 않고 <b>{major} › {minor}</b> 비용에서 빼요. 원래 결제와 같은 항목을 고르면 돼요.
        </Notice>
      )}
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

      {!isIncome && (
        <label className="flex items-center gap-2 text-xs text-stone-700">
          <input type="checkbox" className="h-4 w-4 accent-orange-600" checked={lastMonth} onChange={(e) => setLastMonth(e.target.checked)} />
          <span>
            <b>지난달 비용으로</b> — 급여·거래처 대금처럼 다음 달 10일에 내는 돈. {monthLabel(prevMonth(tx.date.slice(0, 7)))} 손익으로 옮겨요{remember ? ", 규칙에도 남겨요" : ""}
          </span>
        </label>
      )}
      <div className="flex items-center justify-between gap-3">
        {hasRule && editing ? (
          <label className="flex items-center gap-2 text-xs text-stone-700">
            <input type="checkbox" className="h-4 w-4 accent-orange-600" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            “{rule.keyword}” 규칙도 이렇게 바꾸기 (같은 규칙으로 분류된 이 달 줄도 함께)
          </label>
        ) : hasRule ? (
          <span className="text-xs text-stone-500">규칙은 그대로 두고 이번 줄만 확인해요</span>
        ) : (
          <label className="flex items-center gap-2 text-xs text-stone-700">
            <input type="checkbox" className="h-4 w-4 accent-orange-600" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            다음부터 이 거래처는 이렇게 분류
          </label>
        )}
        <button className="btn-primary" disabled={!major || saving} onClick={confirm}>
          {editing ? "이렇게 바꾸기" : "확인"}
        </button>
      </div>
    </article>
  );
}

// 전체 거래 목록 — 날짜별로 묶기
function groupByDate(txs: Transaction[]): { date: string; txs: Transaction[] }[] {
  const m = new Map<string, Transaction[]>();
  for (const t of [...txs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) m.set(t.date, [...(m.get(t.date) ?? []), t]);
  return [...m].map(([date, list]) => ({ date, txs: list }));
}

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
function dayLabel(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${DAY_NAMES[d.getUTCDay()]})`;
}

// "NH체크 홈마트" → { tag: "NH체크", name: "홈마트" } — 거래 방식 앞말을 떼어 거래처 이름이 잘 보이게
function splitPayee(payee: string): { tag: string; name: string } {
  const m = payee.match(/^(NH\S*|PC\S*은행|폰\S*은행|자동이체|자동납부|CD현금|카드대금|타행이체|인터넷)\s+(.+)$/);
  return m ? { tag: m[1], name: m[2] } : { tag: "", name: payee };
}
