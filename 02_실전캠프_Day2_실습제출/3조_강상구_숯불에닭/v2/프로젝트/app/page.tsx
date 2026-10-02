"use client";

import Link from "next/link";
import { useState } from "react";
import { useMonth } from "@/components/AppShell";
import { ConfirmDialog, Notice } from "@/components/ui";
import { BreakevenCard } from "@/components/BreakevenCard";
import { WeekdayCard } from "@/components/WeekdayCard";
import { FindingsCard } from "@/components/FindingsCard";
import { RatioCard } from "@/components/RatioCard";
import { useMonthPnl } from "@/components/useMonthPnl";
import { num, pctText, signed, won } from "@/lib/format";
import { closeMonth, isClosed, monthLabel, prevMonth } from "@/lib/month";
import { compareLines, type Pnl, type PnlLine } from "@/lib/pnl";
import { getStore } from "@/lib/storage";
import { monthFindings, monthSources, type FindingsInput } from "@/lib/findings";
import { missingFixedCosts } from "@/lib/missingFixed";
import { dayTotals } from "@/lib/weekday";
import { PURCHASES_KEY_PREFIX, type Purchase } from "@/lib/costing/purchases";
import { buildTaxSheets, taxFileName } from "@/lib/taxExport";
import type { Transaction } from "@/lib/types";

export default function PnlPage() {
  const { month } = useMonth();
  const cur = useMonthPnl(month);
  const prev = useMonthPnl(prevMonth(month)); // 지난달도 같은 잣대로 계산해서 비교한다
  const { ledger, daily, settlement, summary, pnl, purchaseCount, today } = cur;
  const [open, setOpen] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  if (cur.loading || prev.loading) return <p className="py-10 text-center text-sm text-stone-500">불러오는 중…</p>;
  if (ledger.error) return <Notice tone="error">{ledger.error}</Notice>;

  const openDays = dayTotals(daily.sales, daily.channels).length; // 매출이 있었던 날 = 영업일
  const hasPrev = !prev.empty;
  const diff = compareLines(pnl, hasPrev ? prev.pnl : null);
  const closed = isClosed(ledger.closing);
  const empty = cur.empty;
  const estimateTotal = pnl.estimates.reduce((a, e) => a + e.amount, 0); // 확정 아닌 몫 (어림·청구서 금액)
  const missingSales = pnl.revenueBasis === "실매출" ? summary.missingDays.length : 0; // 빈 날은 0원이 아니라 "미입력"
  const missingFixed = missingFixedCosts(ledger.prevTxs, ledger.txs, ledger.rules, ledger.lastBankDate, cur.fixedCosts);
  const findingsInput: FindingsInput = {
    month,
    today,
    lastBankDate: ledger.lastBankDate,
    needsReview: pnl.needsReview,
    unclassified: pnl.unclassified,
    revenueBasis: pnl.revenueBasis,
    missingDays: summary.missingDays,
    enteredDays: summary.enteredDays,
    settlements: settlement.results,
    nameOf: (id) => daily.channels.find((c) => c.id === id)?.name ?? id,
    purchaseCount,
    laborEstimated: pnl.laborEstimated,
    extra: missingFixed.length
      ? [
          {
            level: "warn",
            text: `지난달엔 나갔는데 이번 달 통장엔 없는 고정비 ${missingFixed.length}건: ${missingFixed
              .slice(0, 3)
              .map((m) => `${m.label} ${num(m.prevAmount)}원`)
              .join(", ")}${missingFixed.length > 3 ? " …" : ""} — 빠진 건 아닌지 보세요`,
            href: "/upload",
            action: "올리기 탭",
          },
        ]
      : [],
  };

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
          <p className="num mt-1 text-sm text-stone-600">이익률 {pctText(pnl.operatingMargin)}</p>
          {hasPrev && (
            <p className="num mt-0.5 text-xs text-stone-500">
              {monthLabel(prevMonth(month)).slice(6)} {won(prev.pnl.operatingProfit)} → {monthLabel(month).slice(6)} {won(pnl.operatingProfit)}{" "}
              <span className={diff["영업이익"]! >= 0 ? "text-emerald-700" : "text-red-600"}>({signed(diff["영업이익"] ?? 0)})</span>
            </p>
          )}
          <Formula pnl={pnl} />
          {(estimateTotal > 0 || missingSales > 0) && (
            <p className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
              {estimateTotal > 0 && <span className="rounded bg-violet-100 px-1.5 py-0.5 font-bold text-violet-900">어림 {won(estimateTotal)} 섞임 — 확정 아님</span>}
              {missingSales > 0 && <span className="rounded bg-stone-100 px-1.5 py-0.5 font-bold text-stone-700">매출 미입력 {missingSales}일 — 넣으면 이익이 바뀌어요</span>}
            </p>
          )}
        </div>
        <div className="card">
          <p className="text-xs font-semibold text-stone-500">총매출</p>
          <p className="num mt-1 text-lg font-bold">{won(pnl.revenue)}</p>
          {pnl.revenueBasis === "실매출" && (
            <p className="num mt-1 text-xs text-stone-500">
              홀 {num(pnl.hallRevenue)} · 배달 {num(pnl.deliveryRevenue)}
            </p>
          )}
        </div>
        <div className="card">
          <p className="text-xs font-semibold text-stone-500">내가 가져간 돈 (생활비)</p>
          <p className="num mt-1 text-lg font-bold">{won(pnl.ownerDraw)}</p>
          <p className="mt-1 text-xs text-stone-500">가게 비용에는 안 넣었어요</p>
          {(pnl.excluded.in > 0 || pnl.excluded.out > 0) && (
            <p className="num mt-1 text-xs text-stone-500">
              손익에서 뺀 이체(제외): 나간 돈 {num(pnl.excluded.out)} · 들어온 돈 {num(pnl.excluded.in)}
            </p>
          )}
        </div>
      </section>

      <FindingsCard sources={monthSources(findingsInput)} findings={monthFindings(findingsInput)} />

      <section className="card">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-base font-bold">{monthLabel(month)} 손익</h2>
          <span className="text-xs text-stone-500">금액 · 매출 대비 %{hasPrev && " · 지난달 대비"}</span>
        </div>
        <p className="mb-1 rounded-lg bg-stone-50 px-2 py-1.5 text-xs text-stone-600">
          기준 — <b>매출·배달앱 수수료</b>: 주문이 발생한 달 · <b>비용</b>: 통장에서 돈이 나간 날. 다른 달에 결제한 비용은 지출추가 탭에서 날짜를 맞춰 넣을 수 있어요.
        </p>
        {pnl.estimates.length > 0 && (
          <details className="mb-1 rounded-lg bg-violet-50 px-2 py-1.5 text-xs text-violet-900">
            <summary className="cursor-pointer">
              <b>어림값 {won(estimateTotal)}</b>이 들어 있어요 — 통장에서 아직 안 나간 돈이라 미리 채웠어요. 나가면 실제 금액으로 바뀌어요. <span className="underline">자세히</span>
            </summary>
            <ul className="mt-1.5 space-y-1.5">
              {pnl.laborUnpaid > 0 && (
                <li>
                  <b>인건비 {won(pnl.laborUnpaid)}</b> — 급여가 아직 안 나가서 오늘 탭 근무(시간 × 시급)와 월 고정 인건비(월급·4대보험, 오늘 탭 “직원·채널 설정”)로 채웠어요.
                </li>
              )}
              {pnl.materialUnpaid > 0 && (
                <li>
                  <b>외상 재료비 {won(pnl.materialUnpaid)}</b> — 매입 영수증에는 있는데 통장에서 아직 안 나간 돈이에요(주류 월말 결제, 거래처 외상, 다음 달 10일 대금). {monthLabel(month).slice(6)}에 받은 재료는 {monthLabel(month).slice(6)} 원가라서 미리 넣어 둬요.
                </li>
              )}
              {pnl.fixedUnpaid > 0 && (
                <li>
                  <b>고정비 {won(pnl.fixedUnpaid)}</b> ({pnl.estimates.filter((e) => e.kind === "fixed").map((e) => e.what).join(", ")}) — 청구서는 왔는데 다음 달 초에 나가는 돈이에요. 금액은{" "}
                  <Link href="/rules" className="font-bold underline">
                    규칙 탭
                  </Link>
                  에서 매달 고쳐요.
                </li>
              )}
            </ul>
          </details>
        )}
        <ul className="divide-y divide-stone-100">
          {pnl.lines.map((line) => (
            <PnlRow
              key={line.label}
              line={line}
              diff={diff[line.label] ?? null}
              open={open === line.label}
              onToggle={() => setOpen(open === line.label ? null : line.label)}
              estimated={pnl.estimates.some((e) => e.major === line.label)}
            />
          ))}
        </ul>
      </section>

      <RatioCard pnl={pnl} />

      <WeekdayCard month={month} sales={daily.sales} channels={daily.channels} />

      <BreakevenCard month={month} pnl={pnl} openDays={openDays} />

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

      <TaxExportCard month={month} txs={ledger.txs} needsReview={pnl.needsReview} closed={closed} />

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

// 영업이익이 어떻게 나왔는지 금액으로 풀어 쓴 식 (해모닉에서 따옴) — 숫자를 믿고 볼 수 있게
function Formula({ pnl }: { pnl: Pnl }) {
  const costs = pnl.lines.filter((l) => l.kind === "cost" && l.amount !== 0);
  return (
    <p className="num mt-2 rounded-lg bg-stone-50 px-2 py-1.5 text-[11px] leading-5 text-stone-600">
      총매출 {num(pnl.revenue)}
      {costs.map((l) => (
        <span key={l.label}>
          {" "}
          {l.amount > 0 ? "−" : "+"} {l.label} {num(Math.abs(l.amount))}
        </span>
      ))}{" "}
      = <b className="text-stone-800">영업이익 {num(pnl.operatingProfit)}</b>
    </p>
  );
}

function PnlRow({ line, diff, open, onToggle, estimated = false }: { line: PnlLine; diff: number | null; open: boolean; onToggle: () => void; estimated?: boolean }) {
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
          {line.label === "임대료" && <span className="ml-1 rounded bg-orange-100 px-1.5 py-0.5 text-[11px] font-bold text-orange-700">월세+관리비</span>}
          {estimated && <span className="ml-1 rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-bold text-violet-900">어림</span>}
          {canOpen && <span className="ml-1 text-[11px] text-stone-400">{open ? "▲" : "▼"}</span>}
        </span>
        <span className="num flex flex-col items-end text-right sm:flex-row sm:items-baseline sm:gap-2">
          {/* 지난달 대비 — 폰에서는 금액 밑에, 넓은 화면에서는 금액 앞에 */}
          <span className="order-2 text-[11px] text-stone-400 sm:order-1 sm:text-xs">{diff !== null && diff !== 0 ? `지난달 ${signed(diff)}` : ""}</span>
          <span className="order-1 flex items-baseline gap-2 sm:order-2">
            <span className={`text-sm ${strong ? "font-bold" : ""}`}>{num(line.amount)}</span>
            <span className="w-12 text-xs text-stone-500">{pctText(line.pct)}</span>
          </span>
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

// 세무사용 엑셀 — 파일만 만든다. 보내는 건 사장님이 직접 (자동 전송 없음)
function TaxExportCard({ month, txs, needsReview, closed }: { month: string; txs: Transaction[]; needsReview: number; closed: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function download() {
    setBusy(true);
    setMsg(null);
    try {
      const store = getStore();
      const [sales, purchases] = await Promise.all([store.listDailySales(month), store.getSetting<Purchase[]>(PURCHASES_KEY_PREFIX + month)]);
      const sheets = buildTaxSheets(month, txs, sales, purchases ?? []);
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      for (const sh of sheets) {
        const ws = XLSX.utils.aoa_to_sheet(sh.rows);
        ws["!cols"] = sh.rows[0].map((h, i) => ({ wch: Math.max(8, String(h).length * 2, ...sh.rows.slice(1, 200).map((r) => String(r[i] ?? "").length + 2)) }));
        XLSX.utils.book_append_sheet(wb, ws, sh.name);
      }
      XLSX.writeFile(wb, taxFileName(month));
      setMsg(`${taxFileName(month)} 파일을 저장했어요 (다운로드 폴더). 세무사님께는 사장님이 직접 보내 주세요.`);
    } catch (e) {
      setMsg(`파일을 만들지 못했어요 (${e instanceof Error ? e.message : e})`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold">세무사용 엑셀</p>
          <p className="text-xs text-stone-500">{monthLabel(month)} · 거래내역 · 분류별 합계 · 매출(일별 카드·현금·배달) · 매입 영수증</p>
        </div>
        <button className="btn-ghost whitespace-nowrap text-sm" disabled={busy} onClick={() => void download()}>
          {busy ? "만드는 중…" : "엑셀 받기"}
        </button>
      </div>
      {needsReview > 0 && <Notice tone="warn">확인이 필요한 줄 {needsReview}줄이 “미분류”로 들어가요. 올리기 탭에서 먼저 분류하면 깔끔해요.</Notice>}
      {!closed && needsReview === 0 && <p className="text-xs text-stone-500">마감 전에도 받을 수 있어요. 보통은 마감한 뒤에 받아서 보내요.</p>}
      {msg && <Notice tone="ok">{msg}</Notice>}
    </section>
  );
}
