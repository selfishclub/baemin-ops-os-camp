"use client";

import Link from "next/link";
import { useState } from "react";
import { useMonth } from "@/components/AppShell";
import { ConfirmDialog, Notice } from "@/components/ui";
import { useLedger } from "@/components/useLedger";
import { num, pctText, signed, won } from "@/lib/format";
import { closeMonth, isClosed, monthLabel } from "@/lib/month";
import { compareLines, computePnl, type PnlLine } from "@/lib/pnl";
import { getStore } from "@/lib/storage";

export default function PnlPage() {
  const { month } = useMonth();
  const ledger = useLedger(month);
  const [open, setOpen] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  if (ledger.loading) return <p className="py-10 text-center text-sm text-stone-500">불러오는 중…</p>;
  if (ledger.error) return <Notice tone="error">{ledger.error}</Notice>;

  const pnl = computePnl(ledger.txs, ledger.sales);
  const hasPrev = ledger.prevTxs.length > 0 || ledger.prevSales.length > 0;
  const diff = compareLines(pnl, hasPrev ? computePnl(ledger.prevTxs, ledger.prevSales) : null);
  const closed = isClosed(ledger.closing);
  const empty = ledger.txs.length === 0 && ledger.sales.length === 0;

  async function close() {
    setAsking(false);
    await getStore().saveClosing(closeMonth(month, ledger.closing));
    await ledger.reload();
  }

  if (empty) {
    return (
      <section className="card space-y-3 text-center">
        <p className="text-4xl">📥</p>
        <h2 className="text-base font-bold">{monthLabel(month)} 데이터가 아직 없어요</h2>
        <p className="text-sm text-stone-600">은행 거래내역 엑셀을 올리면 자동으로 분류해서 손익을 보여 드려요.</p>
        <Link href="/upload" className="btn-primary">
          거래내역 올리러 가기
        </Link>
      </section>
    );
  }

  return (
    <>
      <section className="grid grid-cols-2 gap-3">
        <div className={`card col-span-2 ${pnl.operatingProfit >= 0 ? "" : "ring-red-300"}`}>
          <p className="text-xs font-semibold text-stone-500">이번 달 실제로 남은 돈 (영업이익)</p>
          <p className={`num mt-1 text-3xl font-extrabold ${pnl.operatingProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}>{won(pnl.operatingProfit)}</p>
          <p className="num mt-1 text-sm text-stone-600">
            이익률 {pctText(pnl.operatingMargin)}
            {diff["영업이익"] !== null && diff["영업이익"] !== undefined && <span className="ml-2 text-xs">지난달 대비 {signed(diff["영업이익"]!)}</span>}
          </p>
        </div>
        <div className="card">
          <p className="text-xs font-semibold text-stone-500">총매출</p>
          <p className="num mt-1 text-lg font-bold">{won(pnl.revenue)}</p>
          {pnl.revenueBasis === "실매출" && (
            <p className="num mt-1 text-[11px] text-stone-500">
              홀 {num(pnl.hallRevenue)} · 배달 {num(pnl.deliveryRevenue)}
            </p>
          )}
        </div>
        <div className="card">
          <p className="text-xs font-semibold text-stone-500">내가 가져간 돈 (생활비)</p>
          <p className="num mt-1 text-lg font-bold">{won(pnl.ownerDraw)}</p>
          <p className="mt-1 text-[11px] text-stone-500">가게 비용에는 안 넣었어요</p>
        </div>
      </section>

      {pnl.revenueBasis === "입금액" && (
        <Notice tone="warn">
          실매출 미입력 — 지금 매출은 <b>통장 입금액 기준</b>이라 배달앱 수수료가 안 보여요.{" "}
          <Link href="/channels" className="font-bold underline">
            배달앱 탭에서 입력
          </Link>
        </Notice>
      )}
      {pnl.needsReview > 0 && (
        <Notice tone="warn">
          확인이 필요한 줄이 <b>{pnl.needsReview}줄</b> 남았어요{pnl.unclassified > 0 && ` (그중 ${pnl.unclassified}줄은 아직 손익에 안 들어갔어요)`}.{" "}
          <Link href="/upload" className="font-bold underline">
            올리기 탭에서 확인
          </Link>
        </Notice>
      )}

      <section className="card">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-base font-bold">{monthLabel(month)} 손익</h2>
          <span className="text-[11px] text-stone-500">금액 · 매출 대비 %{hasPrev && " · 지난달 대비"}</span>
        </div>
        <ul className="divide-y divide-stone-100">
          {pnl.lines.map((line) => (
            <PnlRow key={line.label} line={line} diff={diff[line.label] ?? null} open={open === line.label} onToggle={() => setOpen(open === line.label ? null : line.label)} />
          ))}
        </ul>
      </section>

      <section className="card space-y-2">
        {closed ? (
          <>
            <p className="text-sm font-bold text-emerald-700">✅ 마감됨 · {ledger.closing!.closedAt!.slice(0, 10)}</p>
            <p className="text-xs text-stone-500">마감 뒤에 고치면 아래에 기록이 남아요. 이후 수정 {ledger.closing!.edits.length}건</p>
            {ledger.closing!.edits.length > 0 && (
              <ul className="space-y-1 text-xs text-stone-600">
                {ledger.closing!.edits.map((e) => (
                  <li key={e.at + e.what}>
                    · {e.at.slice(0, 10)} {e.what}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-stone-600">숫자를 다 확인했으면 마감해 주세요. 마감은 사장님이 직접 눌러야 확정돼요.</p>
            <button className="btn-primary w-full" onClick={() => (pnl.needsReview > 0 ? setAsking(true) : close())}>
              이번 달 마감
            </button>
          </>
        )}
      </section>

      {asking && (
        <ConfirmDialog title="확인이 필요한 줄이 남아 있어요" confirmLabel="그래도 마감" onConfirm={close} onCancel={() => setAsking(false)}>
          <p>
            아직 <b>{pnl.needsReview}줄</b>을 확인하지 않았어요. 분류 안 된 줄은 손익에 빠져 있어서 남은 돈이 실제보다 많아 보일 수 있어요.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}

function PnlRow({ line, diff, open, onToggle }: { line: PnlLine; diff: number | null; open: boolean; onToggle: () => void }) {
  const strong = line.kind !== "cost";
  const canOpen = line.kind === "cost" && (line.minors?.length ?? 0) > 0;
  return (
    <li>
      <button
        className={`flex w-full items-center justify-between gap-2 py-2.5 text-left ${line.kind === "result" ? "text-emerald-800" : ""}`}
        onClick={canOpen ? onToggle : undefined}
        aria-expanded={canOpen ? open : undefined}
      >
        <span className={`text-sm ${strong ? "font-bold" : "pl-3 text-stone-700"}`}>
          {line.kind === "cost" && "− "}
          {line.label}
          {line.label === "임대료" && <span className="ml-1 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">월세+관리비</span>}
          {canOpen && <span className="ml-1 text-[10px] text-stone-400">{open ? "▲" : "▼"}</span>}
        </span>
        <span className="num flex items-baseline gap-2 text-right">
          {diff !== null && diff !== 0 && <span className="hidden text-[11px] text-stone-400 sm:inline">{signed(diff)}</span>}
          <span className={`text-sm ${strong ? "font-bold" : ""}`}>{num(line.amount)}</span>
          <span className="w-12 text-[11px] text-stone-500">{pctText(line.pct)}</span>
        </span>
      </button>
      {open && (
        <ul className="mb-2 space-y-1 rounded-xl bg-stone-50 px-3 py-2">
          {line.minors!.map((m) => (
            <li key={m.label} className="num flex justify-between text-xs text-stone-600">
              <span>{m.label}</span>
              <span>{num(m.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
