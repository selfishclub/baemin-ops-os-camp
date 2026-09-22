"use client";

import { useState } from "react";
import { Notice } from "@/components/ui";
import type { useDaily } from "@/components/useDaily";
import type { useLedger } from "@/components/useLedger";
import type { SettlementState } from "@/components/useSettlement";
import { num, pctText, won } from "@/lib/format";
import { monthLabel } from "@/lib/month";
import { DEFAULT_RULES, RULE_NOTES, type SettlementRule } from "@/lib/settlement";
import { explainOverdue } from "@/lib/overdue";

const DOW = ["월", "화", "수", "목", "금", "토", "일"];

// 정산 탭 — 규칙 편집 + 통장 입금 짝 맞추기 + 채널별 수수료 집계
export default function SettlementSection({
  month,
  ledger,
  daily,
  settlement,
}: {
  month: string;
  ledger: ReturnType<typeof useLedger>;
  daily: ReturnType<typeof useDaily>;
  settlement: SettlementState;
}) {
  const { rules, results, loaded, saveRules, saveAdjustment } = settlement;
  // "차이" 줄에 환급 등 다른 돈이 섞였을 때: 얼마인지 물어 표시로 저장 (0이면 지움)
  async function markExtra(channel: string, date: string, current?: number) {
    const raw = window.prompt("이 입금 중 정산금이 아닌 돈(환급·지원금 등)은 얼마인가요? 지우려면 0", current ? String(current) : "");
    if (raw === null) return;
    const amount = Number(raw.replace(/[^\d]/g, "")) || 0;
    const note = amount > 0 ? window.prompt("무슨 돈인가요? (예: 상생 요금제 월 환급)", "환급") ?? "환급" : "";
    await saveAdjustment({ channel, date, amount, note });
  }
  const [holidayText, setHolidayText] = useState(settlement.holidays.join(", "));
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [overdueOpen, setOverdueOpen] = useState<string | null>(null); // "all" | "cards" | 채널 id
  const [help, setHelp] = useState(false);

  const settleable = daily.channels.filter((c) => c.active && c.kind !== "cash");
  const missingRule = settleable.filter((c) => !rules.some((r) => r.channel === c.id) && DEFAULT_RULES.some((r) => r.channel === c.id));
  const hasDaily = daily.sales.some((s) => s.date.startsWith(month));
  const name = (id: string) => daily.channels.find((c) => c.id === id)?.name ?? id;

  async function saveHolidays() {
    const list = holidayText
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
    setHolidayText(list.join(", "));
    await settlement.saveHolidays(list);
  }
  function ruleOf(id: string): SettlementRule {
    return rules.find((r) => r.channel === id) ?? { channel: id, mode: "days", days: 2, weekday: 0 };
  }
  const setRule = (id: string, next: SettlementRule | null) => saveRules([...rules.filter((x) => x.channel !== id), ...(next ? [next] : [])]);

  if (!loaded) return null;

  const totalFee = results.reduce((a, r) => a + r.fee, 0);
  const overdue = ledger.lastBankDate ? explainOverdue(results, rules, ledger.lastBankDate, name) : [];
  const overdueShown = overdue.filter((o) => overdueOpen === "all" || (overdueOpen === "cards" ? o.channel.startsWith("card_") : o.channel === overdueOpen));
  const totalPending = results.reduce((a, r) => a + r.pending, 0);
  const totalMissing = results.reduce((a, r) => a + r.missing, 0);
  const unmatched = results.flatMap((r) => r.unmatchedDeposits.map((d) => ({ ...d, channel: r.channel })));
  // 통장엔 입금이 있는데 오늘 탭에 그 채널 매출이 하나도 없는 채널 — 짝을 맞출 수가 없어 0으로 보인다
  const strayOf = (r: (typeof results)[number]) => r.unmatchedDeposits.reduce((a, d) => a + d.amount, 0);
  const noSales = results.filter((r) => r.sales === 0 && strayOf(r) > 0);
  const unmatchedShown = unmatched.filter((d) => !noSales.some((r) => r.channel === d.channel));
  // 카드사별로 나눴을 때 카드 합계 줄
  const cardRows = results.filter((r) => daily.channels.find((c) => c.id === r.channel)?.kind === "card");
  const cardSum = cardRows.reduce(
    (a, r) => ({
      sales: a.sales + r.sales,
      deposited: a.deposited + r.deposited,
      fee: a.fee + r.fee,
      pending: a.pending + r.pending,
      missing: a.missing + r.missing,
      salesDeposited: a.salesDeposited + r.settlements.filter((x) => x.deposit > 0).reduce((y, x) => y + x.sales, 0),
    }),
    { sales: 0, deposited: 0, fee: 0, pending: 0, missing: 0, salesDeposited: 0 },
  );

  return (
    <>
      <section className="card space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold">정산 규칙 — 언제 입금되나</h2>
          <button className="text-[11px] text-orange-700" onClick={() => setEditing((v) => !v)}>
            {editing ? "닫기" : rules.length ? "고치기" : "등록하기"}
          </button>
        </div>
        <button className="w-full text-left text-[12px] text-sky-800" onClick={() => setHelp((v) => !v)}>
          {help ? "▲" : "?"} 규칙을 등록하면 통장 입금을 매출과 자동으로 짝지어 수수료를 집계해요
        </button>
        {help && (
          <div className="rounded-xl bg-sky-50 px-3 py-2 text-[12px] text-sky-950 ring-1 ring-sky-200">
            <ul className="list-disc space-y-0.5 pl-4">
              <li>
                <b>매출일 + N영업일</b> — 카드사, 일 단위로 정산하는 앱. 예: BC카드 +2영업일
              </li>
              <li>
                <b>주 단위</b> — 매주 정해진 요일에 지난주(월~일) 매출분이 한 번에 들어오는 앱
              </li>
              <li>정확한 주기는 각 앱·카드사 정산 안내에 있어요. 처음엔 대략 넣고, 아래 “차이·미입금”이 계속 뜨는 채널의 규칙을 고치면 돼요.</li>
              <li>공휴일은 아래 칸에 날짜를 적어 두면 영업일 계산에서 빼요.</li>
            </ul>
          </div>
        )}
        {!editing && rules.length > 0 && missingRule.length > 0 && (
          <button className="btn-ghost w-full" onClick={() => saveRules([...rules, ...DEFAULT_RULES.filter((r) => missingRule.some((c) => c.id === r.channel))])}>
            규칙 없는 채널({missingRule.map((c) => c.name).join(", ")})에 기본 규칙 넣기
          </button>
        )}
        {!editing && rules.length === 0 && (
          <div className="space-y-2">
            <Notice tone="info">아직 규칙이 없어요. 각 사 공개 안내를 기준으로 한 기본 규칙(카드 +2영업일, 배민 +3영업일, 요기요 +5영업일, 땡겨요 +1영업일, 쿠팡이츠는 확인 필요)으로 시작해 보세요.</Notice>
            <button className="btn-ghost" onClick={() => saveRules(DEFAULT_RULES.filter((r) => settleable.some((c) => c.id === r.channel)))}>
              기본 규칙 넣기
            </button>
          </div>
        )}
        {!editing && rules.length > 0 && (
          <ul className="divide-y divide-stone-100 text-sm">
            {settleable.map((c) => {
              const r = rules.find((x) => x.channel === c.id);
              return (
                <li key={c.id} className="py-1.5">
                  <div className="flex justify-between">
                    <span className="font-semibold">{c.name}</span>
                    <span className="text-stone-600">
                      {!r ? <span className="text-stone-400">규칙 없음 (직접 입력)</span> : r.mode === "days" ? `매출일 + ${r.days}영업일` : r.mode === "calendar" ? `매출일 + ${r.days}일 (쉬는 날이면 다음 영업일)` : `매주 ${DOW[r.weekday]}요일에 지난주분`}
                      {r?.manual && <span className="ml-1 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-900">직접 출금</span>}
                    </span>
                  </div>
                  {RULE_NOTES[c.id] && (
                    <p className={`text-[11px] ${RULE_NOTES[c.id].source === "unknown" ? "text-amber-700" : "text-stone-400"}`}>
                      {RULE_NOTES[c.id].source === "official" ? "공식 안내 · " : RULE_NOTES[c.id].source === "unknown" ? "확인 필요 · " : "일반 관행 · "}
                      {RULE_NOTES[c.id].text}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {editing && (
          <div className="space-y-2">
            {settleable.map((c) => {
              const r = ruleOf(c.id);
              const has = rules.some((x) => x.channel === c.id);
              return (
                <div key={c.id} className="grid grid-cols-[1fr_6.5rem_5.5rem_3.5rem] items-center gap-2 text-sm">
                  <span className="font-semibold">{c.name}</span>
                  <select
                    aria-label={`${c.name} 정산 방식`}
                    className="field"
                    value={has ? r.mode : "none"}
                    onChange={(e) => {
                      const v = e.target.value;
                      void setRule(c.id, v === "none" ? null : { ...r, mode: v as SettlementRule["mode"] });
                    }}
                  >
                    <option value="none">규칙 없음</option>
                    <option value="days">+N영업일</option>
                    <option value="calendar">+N일(달력)</option>
                    <option value="weekly">주 단위</option>
                  </select>
                  {has && (r.mode === "days" || r.mode === "calendar") ? (
                    <input aria-label={`${c.name} 영업일 수`} inputMode="numeric" className="field num text-right" value={r.days} onChange={(e) => setRule(c.id, { ...r, days: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
                  ) : has ? (
                    <select aria-label={`${c.name} 입금 요일`} className="field" value={r.weekday} onChange={(e) => setRule(c.id, { ...r, weekday: Number(e.target.value) })}>
                      {DOW.map((d, i) => (
                        <option key={d} value={i}>
                          {d}요일
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span />
                  )}
                  <span className="text-[11px] text-stone-500">{has && r.mode === "days" ? "영업일" : has && r.mode === "calendar" ? "일 뒤" : ""}</span>
                  {has && c.kind === "delivery" && (
                    <label className="col-span-4 -mt-1 flex items-center gap-2 text-[11px] text-stone-600">
                      <input type="checkbox" className="h-3.5 w-3.5 accent-orange-600" checked={!!r.manual} onChange={(e) => setRule(c.id, { ...r, manual: e.target.checked })} />
                      직접 출금 신청하는 앱 — 늦게 들어오거나 며칠치가 한 번에 들어와도 순서대로 짝 맞춰요 (쿠팡이츠)
                    </label>
                  )}
                </div>
              );
            })}
            <label className="block text-[11px] text-stone-500">
              공휴일 (영업일에서 뺄 날짜, 쉼표로)
              <div className="mt-1 flex gap-2">
                <input aria-label="공휴일" className="field" placeholder="2026-10-03, 2026-10-09" value={holidayText} onChange={(e) => setHolidayText(e.target.value)} />
                <button className="btn-ghost" onClick={saveHolidays}>
                  저장
                </button>
              </div>
            </label>
          </div>
        )}
      </section>

      {rules.length > 0 && (
        <section className="card space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-bold">통장 입금 짝 맞추기 · 수수료 집계</h2>
            <span className="text-[11px] text-stone-500">{monthLabel(month)} 주문분</span>
          </div>
          {!hasDaily ? (
            <Notice tone="info">오늘 탭에 일별 매출을 넣으면 규칙대로 통장 입금과 짝을 맞춰 드려요. 이 달은 아직 일별 매출이 없어서 아래 직접 입력을 씁니다.</Notice>
          ) : !ledger.lastBankDate ? (
            <Notice tone="info">올리기 탭에서 은행 거래내역을 올리면 입금과 짝을 맞춰요.</Notice>
          ) : (
            <>
              <div className="num grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-xl bg-stone-50 p-2">
                  <p className="text-[11px] text-stone-500">확인된 수수료 합계</p>
                  <p className="font-bold">{won(totalFee)}</p>
                </div>
                <div className="rounded-xl bg-stone-50 p-2">
                  <p className="text-[11px] text-stone-500">아직 안 들어옴</p>
                  <p className="font-bold">{won(totalPending)}</p>
                </div>
                <button
                  className={`rounded-xl p-2 ${totalMissing > 0 ? "bg-red-50 ring-1 ring-red-200 hover:bg-red-100" : "bg-stone-50"}`}
                  disabled={totalMissing === 0}
                  onClick={() => setOverdueOpen(overdueOpen === "all" ? null : "all")}
                >
                  <p className="text-[11px] text-stone-500">입금일 지났는데 없음</p>
                  <p className={`font-bold ${totalMissing > 0 ? "text-red-600" : ""}`}>{won(totalMissing)}</p>
                  {totalMissing > 0 && <p className="text-[10px] text-red-500 underline">{overdueOpen === "all" ? "접기" : "눌러서 자세히"}</p>}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead className="text-left text-xs text-stone-500">
                    <tr>
                      <th className="py-1">채널</th>
                      <th className="text-right">주문금액</th>
                      <th className="text-right">확인된 입금</th>
                      <th className="text-right">수수료</th>
                      <th className="text-right">수수료율</th>
                      <th className="text-right">미입금(예정)</th>
                      <th className="text-right">미입금(지남)</th>
                    </tr>
                  </thead>
                  <tbody className="num divide-y divide-stone-100">
                    {cardRows.length > 1 && (
                      <tr className="bg-stone-50 font-semibold">
                        <td className="py-2">
                          카드 합계 <span className="text-[10px] font-normal text-stone-400">{cardRows.length}개 카드사</span>
                        </td>
                        <td className="text-right">{num(cardSum.sales)}</td>
                        <td className="text-right">{num(cardSum.deposited)}</td>
                        <td className="text-right">{num(cardSum.fee)}</td>
                        <td className="text-right font-bold">{pctText(cardSum.salesDeposited > 0 ? Math.round((cardSum.fee / cardSum.salesDeposited) * 1000) / 10 : null)}</td>
                        <td className="text-right text-stone-500">{num(cardSum.pending)}</td>
                        <td className={`text-right font-bold ${cardSum.missing > 0 ? "text-red-600" : "text-stone-400"}`}>
                          {cardSum.missing > 0 ? (
                            <button className="underline decoration-dotted" onClick={() => setOverdueOpen(overdueOpen === "cards" ? null : "cards")}>
                              {num(cardSum.missing)}
                            </button>
                          ) : (
                            num(cardSum.missing)
                          )}
                        </td>
                      </tr>
                    )}
                    {results.map((r) => (
                      <tr key={r.channel} className="cursor-pointer hover:bg-stone-50" onClick={() => setOpen(open === r.channel ? null : r.channel)}>
                        <td className="py-2 font-semibold">
                          {name(r.channel)} <span className="text-[10px] text-stone-400">{open === r.channel ? "▲" : "▼"}</span>
                        </td>
                        {r.sales === 0 && strayOf(r) > 0 ? (
                          <>
                            <td className="text-right text-xs font-semibold text-orange-600">매출 미입력</td>
                            <td className="text-right text-stone-500" title="오늘 탭에 매출이 없어 짝을 못 맞춘 입금">
                              {num(strayOf(r))}
                            </td>
                            <td className="text-right text-stone-400">–</td>
                            <td className="text-right text-stone-400">–</td>
                            <td className="text-right text-stone-400">–</td>
                            <td className="text-right text-stone-400">–</td>
                          </>
                        ) : (
                          <>
                            <td className="text-right">{num(r.sales)}</td>
                            <td className="text-right">{num(r.deposited)}</td>
                            <td className="text-right">{num(r.fee)}</td>
                            <td className="text-right font-bold">{pctText(r.feeRate)}</td>
                            <td className="text-right text-stone-500">{num(r.pending)}</td>
                            <td className={`text-right font-bold ${r.missing > 0 ? "text-red-600" : "text-stone-400"}`}>
                              {r.missing > 0 ? (
                                <button
                                  className="underline decoration-dotted"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOverdueOpen(overdueOpen === r.channel ? null : r.channel);
                                  }}
                                >
                                  {num(r.missing)}
                                </button>
                              ) : (
                                num(r.missing)
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {overdueOpen && (
                <div className="space-y-2 rounded-xl bg-red-50 p-3 ring-1 ring-red-100">
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm font-bold text-red-700">
                      입금일 지났는데 없는 돈 {overdueOpen === "all" ? "" : overdueOpen === "cards" ? "· 카드" : `· ${name(overdueOpen)}`} <span className="num">{overdueShown.length}건 · {won(overdueShown.reduce((a, o) => a + o.sales, 0))}</span>
                    </p>
                    <button className="text-xs text-stone-500 underline" onClick={() => setOverdueOpen(null)}>
                      닫기
                    </button>
                  </div>
                  <p className="text-[11px] text-stone-600">통장은 {ledger.lastBankDate?.slice(5).replace("-", "/")}까지 올라와 있어요. 그 날짜까지 들어왔어야 하는데 짝이 안 맞은 매출이에요.</p>
                  {overdueShown.length === 0 && <p className="text-xs text-stone-500">해당하는 줄이 없어요.</p>}
                  <ul className="space-y-2">
                    {overdueShown.map((o) => (
                      <li key={o.channel + o.payout} className="rounded-lg bg-white p-2 text-xs">
                        <div className="num flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-semibold">
                            {name(o.channel)} · {o.from === o.to ? `${o.from.slice(5).replace("-", "/")} 매출` : `${o.from.slice(5).replace("-", "/")}~${o.to.slice(5).replace("-", "/")} 매출`}
                          </p>
                          <p className="text-sm font-bold text-red-600">{won(o.sales)}</p>
                        </div>
                        <p className="num mt-0.5 text-stone-600">
                          들어왔어야 할 날 <b>{o.payout.slice(5).replace("-", "/")}</b>
                          {o.daysLate > 0 ? ` · 통장 기준 ${o.daysLate}일 지남` : " · 올린 통장의 마지막 날이 입금일"} · 규칙: {o.rule}
                        </p>
                        {o.nearby.length > 0 && (
                          <p className="num mt-1 text-stone-500">
                            근처의 짝 없는 입금: {o.nearby.map((n) => `${n.date.slice(5).replace("-", "/")} ${n.sameChannel ? "" : name(n.channel) + " "}${num(n.amount)}원`).join(" · ")}
                          </p>
                        )}
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-stone-700">
                          {o.hints.map((h, i) => (
                            <li key={i}>{h}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {open && results.some((r) => r.channel === open) && (
                <div className="overflow-x-auto rounded-xl bg-stone-50 p-2">
                  <table className="w-full min-w-[30rem] text-xs">
                    <thead className="text-left text-stone-500">
                      <tr>
                        <th className="py-1">매출 기간</th>
                        <th>{rules.find((x) => x.channel === open)?.manual ? "입금일(예정일)" : "입금 예정일"}</th>
                        <th className="text-right">매출</th>
                        <th className="text-right">통장 입금</th>
                        <th className="text-right">수수료</th>
                        <th className="text-right">율</th>
                        <th>상태</th>
                      </tr>
                    </thead>
                    <tbody className="num divide-y divide-stone-200">
                      {results
                        .find((r) => r.channel === open)!
                        .settlements.map((s) => (
                          <tr key={s.payout}>
                            <td className="py-1">{s.from === s.to ? s.from.slice(5) : `${s.from.slice(5)}~${s.to.slice(5)}`}</td>
                            <td>{s.payout.slice(5)}</td>
                            <td className="text-right">{num(s.sales)}</td>
                            <td className="text-right">{s.deposit ? num(s.deposit) : "–"}</td>
                            <td className="text-right">{s.deposit ? num(s.fee) : "–"}</td>
                            <td className="text-right">{pctText(s.feeRate)}</td>
                            <td className="whitespace-nowrap">
                              <StatusChip status={s.status} />
                              {s.extra ? (
                                <button className="ml-1 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-900" title="눌러서 고치기" onClick={() => markExtra(s.channel, s.payout, s.extra)}>
                                  {s.note || "환급"} +{num(s.extra)}
                                </button>
                              ) : s.status === "차이" && s.deposit > s.sales ? (
                                <button className="ml-1 text-[10px] font-semibold text-orange-700 underline" onClick={() => markExtra(s.channel, s.payout)}>
                                  환급 포함?
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
              {noSales.length > 0 && (
                <Notice tone="warn">
                  {noSales.map((r) => `${name(r.channel)} ${num(strayOf(r))}원`).join(" · ")} — 통장 입금은 있는데 <b>오늘 탭에 이 채널 주문금액이 하나도 없어요</b>. 각 앱 사장님 사이트의 날짜별 주문금액(수수료 빼기 전)을 오늘 탭에 넣으면 입금과 짝이 맞춰지고 수수료율이 나와요.
                </Notice>
              )}
              {unmatchedShown.length > 0 && (
                <Notice tone="warn">
                  매출 묶음과 짝이 안 맞는 입금 {unmatchedShown.length}건: {unmatchedShown.map((d) => `${d.date.slice(5)} ${name(d.channel)} ${num(d.amount)}`).join(" · ")} — 지난달 말 주문분이거나 정산 규칙이 실제와 다를 수 있어요.
                </Notice>
              )}
              <p className="text-xs text-stone-500">
                수수료 = 매출 − 그 매출분의 통장 입금. “차이”는 입금이 매출의 70%(배달앱은 50%) 미만이거나 매출보다 많을 때(추가 공제·누락·다른 돈이 섞임). “예정”은 입금일이 아직 안 온 것, “미입금”은 입금일이 지났는데 통장에 없는 것. 직접 출금 앱의 “미입금”은 아직 출금 신청을 안 한 것일 수 있어요. 입금이 매출보다 많은 “차이” 줄은 “환급 포함?”을 눌러 섞인 돈을 적어 두면 “일치”로 바뀌고, 그 환급은 그 달 수수료에서 빠져요. 하루 이틀 늦게 몰아 들어온 카드 입금은 앞 묶음과 자동으로 합쳐요.
              </p>
            </>
          )}
        </section>
      )}
    </>
  );
}

function StatusChip({ status }: { status: string }) {
  const style =
    { 일치: "bg-emerald-100 text-emerald-800", 차이: "bg-red-100 text-red-700", 미입금: "bg-red-100 text-red-700", 예정: "bg-stone-200 text-stone-600", 매출없음: "bg-stone-100 text-stone-400" }[status] ?? "";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${style}`}>{status}</span>;
}
