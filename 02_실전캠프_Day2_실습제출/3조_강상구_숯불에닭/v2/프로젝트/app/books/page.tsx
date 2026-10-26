"use client";

import { useEffect, useMemo, useState } from "react";
import { useMonth } from "@/components/AppShell";
import { MoneyInput, Notice } from "@/components/ui";
import { useMonthPnl } from "@/components/useMonthPnl";
import { PURCHASES_KEY_PREFIX, type Purchase } from "@/lib/costing/purchases";
import { num, won } from "@/lib/format";
import { BANK, SUSPENSE, buildJournal, entryBalanced, journalProfit, trialBalance, type JournalEntry } from "@/lib/journal";
import { monthLabel, nextMonth } from "@/lib/month";
import { getStore } from "@/lib/storage";
import type { Transaction } from "@/lib/types";

// 복식장부 1~2단계 — 장부 자료를 자동 분개해 시산표·점검을 보여 준다 (lib/journal.ts).
// 사장님이 따로 입력하는 건 통장 월초·월말 잔액(점검용)뿐이다.
const BANK_CHECK_KEY = "bank_balance_checks_v1";
type BankChecks = Record<string, { start?: number; end?: number }>;
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export default function BooksPage() {
  const { month } = useMonth();
  const cur = useMonthPnl(month);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [byDate, setByDate] = useState<Transaction[]>([]);
  const [checks, setChecks] = useState<BankChecks>({});
  const [filter, setFilter] = useState<JournalEntry["source"] | "전체">("전체");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const store = getStore();
    void Promise.all([
      store.getSetting<Purchase[]>(PURCHASES_KEY_PREFIX + month),
      store.listTransactions(month),
      store.listTransactions(nextMonth(month)),
      store.getSetting<BankChecks>(BANK_CHECK_KEY),
    ]).then(([ps, a, b, c]) => {
      setPurchases(ps ?? []);
      // 통장 잔액 점검은 귀속 달이 아니라 통장에 찍힌 날짜로 (지난달 비용으로 돌린 줄도 이 달 통장에서 나간 것)
      setByDate([...a, ...b].filter((t) => t.date.startsWith(month)));
      setChecks(c ?? {});
    });
  }, [month]);

  const entries = useMemo(
    () => (cur.loading ? [] : buildJournal({ month, txs: cur.ledger.txs, sales: cur.settlement.effectiveSales, channels: cur.daily.channels, purchases, pnl: cur.pnl, vat: cur.vat })),
    [cur.loading, cur.ledger.txs, cur.settlement.effectiveSales, cur.daily.channels, purchases, cur.pnl, cur.vat, month],
  );
  const tb = useMemo(() => trialBalance(entries), [entries]);
  const profit = journalProfit(tb.rows);
  const unbalanced = entries.filter((e) => !entryBalanced(e)).length;
  const suspense = tb.rows.find((r) => r.account === SUSPENSE)?.balance ?? 0;
  const bankIn = byDate.reduce((a, t) => a + t.in, 0);
  const bankOut = byDate.reduce((a, t) => a + t.out, 0);
  const chk = checks[month] ?? {};
  const bankGap = chk.start !== undefined && chk.end !== undefined ? chk.end - chk.start - (bankIn - bankOut) : null;
  const materialGap = (() => {
    const p = cur.pnl.lines.find((l) => l.label === "매출원가")?.amount ?? 0;
    const j = tb.rows.filter((r) => r.account === "원재료비").reduce((a, r) => a + r.balance, 0);
    return p - j;
  })();

  async function saveCheck(patch: { start?: number; end?: number }) {
    const all = (await getStore().getSetting<BankChecks>(BANK_CHECK_KEY)) ?? {};
    const next = { ...all, [month]: { ...all[month], ...patch } };
    await getStore().saveSetting(BANK_CHECK_KEY, next);
    setChecks(next);
  }

  if (cur.loading) return <p className="text-sm text-stone-500">불러오는 중…</p>;
  const shown = entries.filter((e) => filter === "전체" || e.source === filter);
  const visible = showAll ? shown : shown.slice(0, 40);

  return (
    <>
      <section className="card space-y-2">
        <h2 className="text-base font-bold">📒 복식장부 — {monthLabel(month)}</h2>
        <p className="text-xs text-stone-500">
          장부에 넣은 통장 거래·채널 매출·매입 영수증을 차변·대변으로 자동 분개했어요. 금액은 손익과 같이 부가세 뺀 공급가, 부가세는 부가세예수금·대급금에 따로 쌓아요. 시작 잔액(보증금·설비·대출)과 감가상각은 세무사 재무제표를 받으면 넣어요.
        </p>
      </section>

      <section className="card space-y-2">
        <h2 className="text-sm font-bold">점검</h2>
        <ul className="space-y-1.5 text-sm">
          <li className={unbalanced === 0 && tb.debit === tb.credit ? "text-emerald-700" : "text-rose-700"}>
            {unbalanced === 0 && tb.debit === tb.credit ? "✓" : "✗"} 차변 합계 <b className="num">{won(tb.debit)}</b> = 대변 합계 <b className="num">{won(tb.credit)}</b>
            {unbalanced > 0 && ` — 맞지 않는 분개 ${unbalanced}건`}
          </li>
          <li className={Math.abs(profit - cur.pnl.operatingProfit) <= Math.abs(materialGap) + 1 ? "text-stone-700" : "text-amber-700"}>
            분개로 본 이익 <b className="num">{won(profit)}</b> · 손익표 영업이익 <b className="num">{won(cur.pnl.operatingProfit)}</b>
            {profit !== cur.pnl.operatingProfit && (
              <span className="block text-xs text-stone-500">
                차이 {won(profit - cur.pnl.operatingProfit)} — 재료비를 분개는 매입 영수증 기준({won(cur.pnl.lines.find((l) => l.label === "매출원가")!.amount - materialGap)}), 손익표는 통장과 영수증 중 큰 쪽({won(cur.pnl.lines.find((l) => l.label === "매출원가")!.amount)})으로 봐서 생겨요.
                {Math.abs(profit - cur.pnl.operatingProfit - materialGap) > 1 && ` 그 밖의 차이 ${won(profit - cur.pnl.operatingProfit - materialGap)}는 확인 필요예요.`}
              </span>
            )}
          </li>
          <li className={suspense ? "text-amber-700" : "text-emerald-700"}>{suspense ? `⚠ 분류 안 한 통장 줄 ${won(suspense)} — 올리기 탭에서 분류해 주세요 (지금은 미분류(가지급금)에 있어요)` : "✓ 분류 안 한 통장 줄 없음"}</li>
        </ul>

        <div className="space-y-1 rounded-lg bg-stone-50 p-2 text-xs">
          <p className="font-semibold text-stone-700">통장 잔액 대조 ({monthLabel(month).slice(6)} 통장에 찍힌 날짜 기준)</p>
          <p className="num text-stone-600">
            들어온 돈 {num(bankIn)} − 나간 돈 {num(bankOut)} = 늘어난 돈 <b>{num(bankIn - bankOut)}</b>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-stone-500">
              월초 잔액 (지난달 말일 마감)
              <MoneyInput label="월초 통장 잔액" allowEmpty placeholder="통장 앱에서" value={chk.start ?? null} onChange={(n) => void saveCheck({ start: n ?? undefined })} />
            </label>
            <label className="space-y-1 text-stone-500">
              월말 잔액
              <MoneyInput label="월말 통장 잔액" allowEmpty placeholder="통장 앱에서" value={chk.end ?? null} onChange={(n) => void saveCheck({ end: n ?? undefined })} />
            </label>
          </div>
          {bankGap === null ? (
            <p className="text-stone-500">통장 앱의 월초·월말 잔액을 적으면, 장부에 빠진 통장 줄이 있는지 봐요. 이 컴퓨터 장부에만 저장돼요.</p>
          ) : bankGap === 0 ? (
            <p className="text-emerald-700">✓ 통장 잔액 변화와 장부가 딱 맞아요.</p>
          ) : (
            <p className="text-amber-700">⚠ {won(Math.abs(bankGap))} 차이 — 장부에 {bankGap > 0 ? "안 올린 입금" : "안 올린 출금"}이 있거나, 월말 이후 통장 자료를 아직 안 올렸을 수 있어요.</p>
          )}
        </div>
      </section>

      <section className="card space-y-2">
        <h2 className="text-sm font-bold">시산표 <span className="text-xs font-normal text-stone-500">이 달 움직임 · 시작 잔액 없음</span></h2>
        <div className="overflow-x-auto">
          <table className="num w-full min-w-[30rem] text-xs">
            <thead>
              <tr className="text-stone-500">
                <th className="py-1 text-left">계정</th>
                <th className="text-left">구분</th>
                <th className="text-right">차변</th>
                <th className="text-right">대변</th>
                <th className="text-right">잔액</th>
              </tr>
            </thead>
            <tbody>
              {tb.rows.map((r) => (
                <tr key={r.account} className={`border-t border-stone-100 ${r.account === BANK ? "font-semibold" : ""}`}>
                  <td className="py-1">{r.account}</td>
                  <td className="text-stone-500">{r.type}</td>
                  <td className="text-right">{r.debit ? num(r.debit) : ""}</td>
                  <td className="text-right">{r.credit ? num(r.credit) : ""}</td>
                  <td className={`text-right ${r.balance < 0 ? "text-rose-700" : ""}`}>{num(r.balance)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-stone-300 font-bold">
                <td className="py-1" colSpan={2}>
                  합계
                </td>
                <td className="text-right">{num(tb.debit)}</td>
                <td className="text-right">{num(tb.credit)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-stone-500">
          잔액이 빨간(음수) 미수금은 정산이 이 달 매출보다 많이 들어온 것(지난달 매출분 입금), 외상매입금이 음수면 영수증 없이 낸 재료 대금이 있다는 뜻이에요. 인출금은 생활비·개인 결제로 가져간 돈이에요.
        </p>
      </section>

      <section className="card space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold">분개장 <span className="text-xs font-normal text-stone-500">{shown.length}건</span></h2>
          <div className="flex flex-wrap gap-1">
            {(["전체", "매출", "수수료", "통장", "매입", "부가세", "어림"] as const).map((f) => (
              <button key={f} className={`rounded-lg px-2 py-1 text-xs ${filter === f ? "bg-stone-800 text-white" : "bg-stone-100 text-stone-600"}`} onClick={() => setFilter(f)}>
                {f}
              </button>
            ))}
          </div>
        </div>
        <ul className="divide-y divide-stone-100 text-xs">
          {visible.map((e, i) => (
            <li key={i} className="py-1.5">
              <p className="text-stone-500">
                {md(e.date)} · {e.source} · {e.memo}
              </p>
              {e.lines.map((l, j) => (
                <p key={j} className="num grid grid-cols-[1fr_6rem_6rem] gap-2">
                  <span className={l.credit ? "pl-4" : ""}>{l.account}</span>
                  <span className="text-right">{l.debit ? num(l.debit) : ""}</span>
                  <span className="text-right">{l.credit ? num(l.credit) : ""}</span>
                </p>
              ))}
            </li>
          ))}
        </ul>
        {shown.length > 40 && (
          <button className="text-xs text-stone-500 underline" onClick={() => setShowAll(!showAll)}>
            {showAll ? "40건만 보기" : `전체 ${shown.length}건 보기`}
          </button>
        )}
        {entries.length === 0 && <Notice tone="info">이 달 장부 자료가 없어요.</Notice>}
      </section>
    </>
  );
}
