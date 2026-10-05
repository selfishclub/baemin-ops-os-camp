"use client";

import { useEffect, useRef, useState } from "react";
import { useMonth } from "@/components/AppShell";
import { CategorySelect, MoneyInput, Notice } from "@/components/ui";
import { useLedger } from "@/components/useLedger";
import ExpenseSection from "@/components/ExpenseSection";
import { BankParseError, parseBankSheet } from "@/lib/bank/parse";
import { DEFAULT_CHANNELS, type ChannelId, type Major } from "@/lib/categories";
import { classifyRows, findRule, newId, ruleFromChoice, usualAmounts } from "@/lib/classify";
import { num, won } from "@/lib/format";
import { findOverlap, monthLabel, monthsBetween, newBankRowsOnly, prevMonth } from "@/lib/month";
import { getStore } from "@/lib/storage";
import type { BankRow, Transaction } from "@/lib/types";
import { missingRanges, nextFetch, type NextFetch } from "@/lib/uploadGap";
import { splitCheck, type TxSplit } from "@/lib/txSplit";
import { DEFAULT_PAY_DAYS, PAY_DAYS_KEY, isPrevMonthDefault } from "@/lib/paydays";
import { monthsToLoad, quickRange, searchTxs, shiftDays, txTotals, type TxOrder } from "@/lib/txSearch";
import { todayStr } from "@/lib/daily";

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
  const [popbill, setPopbill] = useState<{ ready: boolean; test?: boolean; account?: string } | null>(null);
  const [need, setNeed] = useState<{ next: NextFetch | null; missing: { from: string; to: string }[] } | null>(null);
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
  const [txOrder, setTxOrder] = useState<TxOrder>("최신순");
  // 기간으로 찾기 — 기본은 보고 있는 달 전체. 기간이 다른 달까지 걸치면 그 달 거래도 불러온다.
  const [range, setRange] = useState(() => quickRange("month", month, todayStr()));
  useEffect(() => setRange(quickRange("month", month, todayStr())), [month]);
  const [moreTxs, setMoreTxs] = useState<Transaction[]>([]);
  useEffect(() => {
    if (!showAll) return;
    // 지급일 규칙으로 달이 옮겨진 줄까지 잡으려고 앞뒤로 한 달씩 넉넉히 불러온다
    const want = monthsToLoad(shiftDays(range.from, -31), shiftDays(range.to, 31), [month]);
    if (!want.length) return setMoreTxs([]);
    let alive = true;
    void Promise.all(want.map((m) => getStore().listTransactions(m)))
      .then((lists) => alive && setMoreTxs(lists.flat()))
      .catch(() => alive && setMoreTxs([]));
    return () => {
      alive = false;
    };
  }, [showAll, range.from, range.to, month, ledger.txs]);
  const searched = searchTxs(
    [...ledger.txs, ...moreTxs.filter((t) => !ledger.txs.some((x) => x.id === t.id))],
    { from: range.from, to: range.to, text: filter, kind: txKind },
    txOrder,
  );
  const searchedTotals = txTotals(searched);

  // 팝빌 계좌조회로 통장을 바로 가져온다. 열쇠는 서버(.env.local)에만 있고, 설정이 없으면 단추가 안 보인다.
  useEffect(() => {
    let alive = true;
    void getStore().listUploads().then((ups) => {
      if (!alive) return;
      const today = todayStr();
      setNeed({ next: nextFetch(ups, today), missing: missingRanges(ups) });
    });
    return () => { alive = false; };
  }, [ledger.txs.length, month]);

  useEffect(() => {
    fetch("/api/popbill/status").then((r) => r.json()).then(setPopbill).catch(() => setPopbill({ ready: false }));
  }, []);

  async function fetchFromPopbill() {
    setBusy(true);
    setMessage(null);
    try {
      const to = new Date().toISOString().slice(0, 10);
      const last = (await getStore().listUploads()).map((u) => u.to).sort().at(-1);
      // 마지막으로 받은 날 다음부터. 처음이면 이번 달 1일부터
      const from = last && last < to ? new Date(new Date(last + "T00:00:00Z").getTime() + 864e5).toISOString().slice(0, 10) : to.slice(0, 8) + "01";
      const res = await fetch("/api/popbill/bank", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from, to }) });
      const data = await res.json();
      if (!res.ok) { setMessage({ tone: "error", text: data.error ?? "통장을 가져오지 못했어요." }); return; }
      if (!data.rows?.length) { setMessage({ tone: "info", text: `${from} ~ ${to}에 새 거래가 없어요.` }); return; }
      await ingest(data.rows, data.from, data.to, `통장 자동 가져오기 (팝빌`);
    } catch (e) {
      setMessage({ tone: "error", text: `통장을 가져오지 못했어요. (${e instanceof Error ? e.message : e})` });
    } finally {
      setBusy(false);
    }
  }

  // 통장 줄을 장부에 넣는 공통 길 — 엑셀로 올리든 팝빌로 가져오든 여기로 모인다.
  //  이미 있는 줄 빼기 → 자동 분류 → 저장 → 올린 기록 남기기
  async function ingest(all: BankRow[], from: string, to: string, label: string) {
    const store = getStore();
    let rows = all;
    let duplicates = 0;
    const overlap = findOverlap(await store.listUploads(), from, to);
    if (overlap) {
      const existing = (await Promise.all(monthsBetween(from, to).map((m) => store.listTransactions(m)))).flat().filter((t) => t.source === "bank" && t.date >= from && t.date <= to);
      ({ fresh: rows, duplicates } = newBankRowsOnly(all, existing));
      if (rows.length === 0) {
        setMessage({ tone: "info", text: `이미 다 들어 있는 거래예요 (${from} ~ ${to}, ${duplicates}줄). 새로 넣은 줄은 없어요.` });
        return;
      }
    }
    const rules = await store.listRules();
    const txs = classifyRows(rows, rules, usualAmounts(ledger.txs.concat(ledger.prevTxs), rules));
    await store.saveTransactions(txs);
    const fileMonth = from.slice(0, 7);
    await store.saveUpload({ id: newId(), month: fileMonth, from, to, rowCount: txs.length, uploadedAt: new Date().toISOString() });
    await ledger.recordEdit(`${label}, ${txs.length}줄)`);
    const auto = txs.filter((t) => t.major).length;
    setMessage({
      tone: "ok",
      text: `${txs.length}줄 중 ${auto}줄을 자동으로 분류했어요. 확인이 필요한 줄은 ${txs.filter((t) => t.review).length}줄이에요. (${from} ~ ${to})${duplicates ? ` 이미 있던 ${duplicates}줄은 빼고 넣었어요.` : ""}`,
    });
    if (fileMonth !== month) setMonth(fileMonth);
    else await ledger.reload();
  }

  async function handleFile(file: File | Blob, name: string) {
    setBusy(true);
    setMessage(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true }) as never[][];
      const parsed = parseBankSheet(grid);
      await ingest(parsed.rows, parsed.from, parsed.to, `거래내역 파일 올림 (${name}`);
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
        {need?.next && (
          <div className="rounded-xl bg-amber-50 p-3 text-sm">
            <p className="font-semibold text-amber-900">
              {need.next.lastTo
                ? `통장을 ${dayLabel(need.next.lastTo)}까지 받아 뒀어요.`
                : "아직 통장을 안 올렸어요."}
            </p>
            <p className="mt-1 text-amber-900">
              은행에서{" "}
              <b className="num">{need.next.days === 1 ? dayLabel(need.next.to) : `${dayLabel(need.next.from)} ~ ${dayLabel(need.next.to)}`}</b>
              {need.next.days > 1 ? ` (${need.next.days}일치)` : ""}를 받아서 올려 주세요.
            </p>
            <p className="mt-1 text-xs text-amber-800">
              은행 사이트에서 기간을 고를 때 이 날짜 그대로 넣으면 빠지는 날이 없어요. 겹쳐 받아도 괜찮아요 — 이미 있는 줄은 알아서 걸러요.
            </p>
          </div>
        )}
        {need && !need.next && (
          <Notice tone="ok">오늘까지 통장을 다 받아 뒀어요.</Notice>
        )}
        {need?.missing.length ? (
          <Notice tone="warn">
            가운데가 비어 있어요 — {need.missing.map((m) => `${dayLabel(m.from)} ~ ${dayLabel(m.to)}`).join(", ")}. 그 기간도 받아서 올려 주세요.
          </Notice>
        ) : null}
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
          {popbill?.ready && (
            <button className="btn-primary" disabled={busy} onClick={fetchFromPopbill}>
              통장 자동 가져오기
            </button>
          )}
          <a className="btn-ghost" href={SAMPLES[0].file} download>
            예시 파일 받기
          </a>
        </div>
        {popbill?.ready && (
          <p className="text-xs text-stone-500">
            팝빌 계좌조회가 연결돼 있어요{popbill.account ? ` (${popbill.account})` : ""}
            {popbill.test ? " · 테스트 서버" : ""} — “통장 자동 가져오기”를 누르면 마지막으로 받은 날 다음부터 가져와요.
          </p>
        )}
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
              <p className="text-xs text-stone-500">이미 확인한 줄을 바꾸려면 그 줄의 “고치기”를 누르세요. 규칙까지 바꿀지는 거기서 고를 수 있어요.</p>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <input aria-label="찾기 시작일" type="date" className="field num !w-36" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
                <span className="text-stone-400">~</span>
                <input aria-label="찾기 끝일" type="date" className="field num !w-36" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
                {(
                  [
                    ["month", "이 달 전체"],
                    ["week", "최근 7일"],
                    ["prev", "지난달"],
                  ] as const
                ).map(([k, label]) => (
                  <button key={k} className="rounded-full bg-stone-100 px-3 py-1 text-stone-600" onClick={() => setRange(quickRange(k, month, todayStr()))}>
                    {label}
                  </button>
                ))}
              </div>
              <input aria-label="거래 찾기" className="field" placeholder="거래처·분류로 찾기 (예: 마트, 임대료)" value={filter} onChange={(e) => setFilter(e.target.value)} />
              <div className="flex flex-wrap gap-1.5 text-xs">
                {(["전체", "입금", "출금", "미분류"] as const).map((k) => (
                  <button key={k} className={`rounded-full px-3 py-1 ${txKind === k ? "bg-orange-100 font-semibold text-orange-800" : "bg-stone-100 text-stone-600"}`} onClick={() => setTxKind(k)}>
                    {k}
                  </button>
                ))}
                <span className="mx-1 self-center text-stone-300">|</span>
                {(["최신순", "오래된 순"] as const).map((k) => (
                  <button key={k} className={`rounded-full px-3 py-1 ${txOrder === k ? "bg-stone-700 font-semibold text-white" : "bg-stone-100 text-stone-600"}`} onClick={() => setTxOrder(k)}>
                    {k}
                  </button>
                ))}
              </div>
              <div className="num flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600">
                <span>
                  <b className="text-stone-800">{searchedTotals.count}줄</b> · {range.from.slice(5).replace("-", "/")}~{range.to.slice(5).replace("-", "/")}
                </span>
                <span>
                  {searchedTotals.in > 0 && <span className="text-emerald-700">입금 +{num(searchedTotals.in)}</span>}
                  {searchedTotals.in > 0 && searchedTotals.out !== 0 && " · "}
                  {searchedTotals.out !== 0 && <span>출금 −{num(searchedTotals.out)}</span>}
                </span>
              </div>
              {searched.length === 0 && <p className="text-xs text-stone-500">찾는 거래가 없어요. 기간을 넓히거나 글자를 지워 보세요.</p>}
              <div className="space-y-3">
                {groupByDate(searched).map(({ date, txs }) => (
                  <div key={date}>
                    <div className="num flex items-baseline justify-between border-b border-stone-200 pb-1 text-xs text-stone-500">
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
                                  {tag && <span className="mr-1 text-[11px] font-normal text-stone-400">{tag}</span>}
                                  {name}
                                </p>
                                <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[11px] ${t.major ? (t.major === "제외" ? "bg-stone-100 text-stone-500" : "bg-stone-100 text-stone-700") : "bg-orange-100 font-semibold text-orange-700"}`}>
                                  {t.major ? `${t.major} · ${t.minor}` : "미분류"}
                                </span>
                              </div>
                              <span className={`num whitespace-nowrap text-right text-sm font-semibold ${t.in > 0 ? "text-emerald-700" : t.out < 0 ? "text-stone-400" : "text-stone-800"}`}>
                                {t.in > 0 ? `+${num(t.in)}` : t.out < 0 ? `취소 ${num(-t.out)}` : `−${num(t.out)}`}
                              </span>
                              <button className="whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-50" onClick={() => setEditingId(editingId === t.id ? null : t.id)}>
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
  const [err, setErr] = useState<string | null>(null);
  // 한 줄에 성격이 다른 돈이 섞였을 때 나눠 적기
  const [splits, setSplits] = useState<TxSplit[]>(tx.splits ?? []);
  const check = splitCheck(tx, splits);

  async function confirm() {
    if (!major) return;
    const chosen = major;
    setSaving(true);
    setErr(null);
    try {
      await save(chosen);
    } catch (e) {
      // 저장이 실패해도 단추가 눌린 채로 멈추지 않게 (시연 모드에서 표에 없는 열을 쓰면 여기로 온다)
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function save(major: Major) {
    const store = getStore();
    const ch = isIncome && channel ? channel : null;
    const monthOf = (t: Transaction) => (lastMonth ? prevMonth(t.date.slice(0, 7)) : t.date.slice(0, 7));
    const clean = splits.length && check.ok ? splits : undefined;
    const updated: Transaction[] = [{ ...tx, month: monthOf(tx), major, minor, channel: ch, review: null, splits: clean }];

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
          <span className="mt-0.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{tx.review}</span>
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
      {/* 한 줄에 성격이 다른 돈이 섞였을 때 (마트에서 재료비와 개인 물품, 관리비 고지서의 관리비·전기·수도) */}
      <div className="rounded-xl bg-stone-50 p-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-stone-600">
            나눠서 분류 {splits.length > 0 && <span className="num text-stone-500">{splits.length}개</span>}
          </p>
          {splits.length === 0 ? (
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setSplits([{ major: (major || "매출원가") as Major, minor: minor || "원재료비", amount: tx.out > 0 ? tx.out : tx.in }])}>
              + 이 줄을 나누기
            </button>
          ) : (
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setSplits([])}>
              나누기 그만두기
            </button>
          )}
        </div>
        {splits.length === 0 ? (
          <p className="mt-1 text-xs text-stone-500">한 번 결제에 재료비와 개인 물품이 섞였거나, 관리비 고지서에 전기·수도가 같이 있으면 나눠서 적어요. 통장 줄은 그대로 두고 손익만 나눠 셉니다.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {splits.map((sp, i) => (
              <div key={i} className="rounded-lg bg-white p-2 ring-1 ring-stone-200">
                <div className="flex items-center gap-2">
                  <MoneyInput label={`나눈 금액 ${i + 1}`} value={sp.amount} onChange={(v) => setSplits(splits.map((x, j) => (j === i ? { ...x, amount: v ?? 0 } : x)))} />
                  <button className="btn-ghost shrink-0 px-2 py-1 text-xs" onClick={() => setSplits(splits.filter((_, j) => j !== i))}>
                    빼기
                  </button>
                </div>
                <div className="mt-1">
                  <CategorySelect idPrefix={`${tx.id}-sp${i}`} major={sp.major} minor={sp.minor} includeIncome={isIncome} onChange={(m, n) => setSplits(splits.map((x, j) => (j === i ? { ...x, major: m as Major, minor: n } : x)))} />
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2">
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setSplits([...splits, { major: (major || "영업비") as Major, minor: "잡비", amount: Math.max(0, check.gap) }])}>
                + 줄 더하기
              </button>
              <p className={`num text-xs font-semibold ${check.ok ? "text-emerald-700" : "text-amber-700"}`}>
                {check.ok ? `합계 ${won(check.total)} — 딱 맞아요` : `${won(check.total)} / ${won(check.target)} · ${check.gap > 0 ? "모자라요" : "넘어요"} ${won(Math.abs(check.gap))}`}
              </p>
            </div>
            {!check.ok && <p className="text-xs text-amber-700">금액이 딱 맞아야 나눠서 저장돼요. 안 맞으면 위에서 고른 하나로만 들어가요.</p>}
          </div>
        )}
      </div>
      {err && <Notice tone="error">저장하지 못했어요 — {err}</Notice>}
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
          {saving ? "저장 중…" : editing ? "이렇게 바꾸기" : "확인"}
        </button>
      </div>
    </article>
  );
}

// 전체 거래 목록 — 날짜별로 묶기
// 이미 보고 싶은 차례로 정렬된 목록을 받아 날짜별로 묶는다 (차례는 그대로 둔다)
function groupByDate(txs: Transaction[]): { date: string; txs: Transaction[] }[] {
  const m = new Map<string, Transaction[]>();
  for (const t of txs) m.set(t.date, [...(m.get(t.date) ?? []), t]);
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
