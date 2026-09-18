"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMonth } from "@/components/AppShell";
import { ConfirmDialog, MoneyInput, Notice } from "@/components/ui";
import { CHANNELS_KEY, useDaily } from "@/components/useDaily";
import { CARD_PRESETS, groupChannels, type Channel, type ChannelKind } from "@/lib/categories";
import { CARD_RULE_DAYS, DEFAULT_CARD_DAYS, SETTLEMENT_RULES_KEY, type SettlementRule } from "@/lib/settlement";
import { newId } from "@/lib/classify";
import { CardApprovalError, parseCardApproval, type ParsedCardApproval } from "@/lib/cardApproval";
import { checkDay, dayTotals, daysInMonth, hoursBetween, monthSummary, normalizeTime, shiftDate, todayStr, weekHoursByStaff, type DailyIssue } from "@/lib/daily";
import { num, pctText, won } from "@/lib/format";
import { monthLabel } from "@/lib/month";
import { getStore } from "@/lib/storage";
import type { DailySale, Shift, Staff } from "@/lib/types";
import sample from "@/lib/sampleDaily.json";
import { useWeather } from "@/components/useWeather";
import { KIND_ICON, expectedSales } from "@/lib/weather";

const DOW = ["월", "화", "수", "목", "금", "토", "일"];

// 출근·퇴근 시각 칸 — 브라우저 기본 시각 칸은 한국어에서 "오전/오후"만 보여 글자 칸으로 받고, 칸을 떠날 때 HH:MM으로 정리한다.
function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    const n = normalizeTime(text);
    setText(n);
    if (n !== value) onChange(n);
  };
  return (
    <input
      aria-label={label}
      inputMode="numeric"
      placeholder="18:00"
      className={`field num px-1 text-center ${text && !normalizeTime(text) ? "border-red-400" : ""}`}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export default function TodayPage() {
  const { month, setMonth } = useMonth();
  const daily = useDaily(month);
  const today = todayStr();
  const [date, setDate] = useState(() => (today.startsWith(month) ? today : `${month}-01`));
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [cardRows, setCardRows] = useState<{ channel: string; amount: number }[]>([]);
  const [rows, setRows] = useState<{ staffId: string; start: string; end: string; hours: number }[]>([]);
  const [issues, setIssues] = useState<DailyIssue[]>([]);
  const [asking, setAsking] = useState<"check" | "overwrite" | null>(null);
  const [saved, setSaved] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [help, setHelp] = useState(false);
  const [cardFile, setCardFile] = useState<{ parsed: ParsedCardApproval; name: string } | null>(null);
  const [cardFileMsg, setCardFileMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const cardFileRef = useRef<HTMLInputElement>(null);
  const weather = useWeather();
  const todayWeather = weather.weather.find((w) => w.date === date) ?? weather.forecast.find((w) => w.date === date);

  // 저장한 날 중 날씨가 빠진 날은 조용히 채운다 (실패해도 그냥 둔다)
  useEffect(() => {
    if (weather.loading || weather.fetching) return;
    weather.fillMissing().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weather.loading, weather.sales.length]);

  // 날짜가 다른 달로 넘어가면 달 선택도 따라간다
  useEffect(() => {
    if (!date.startsWith(month)) setMonth(date.slice(0, 7));
  }, [date, month, setMonth]);

  const active = daily.channels.filter((c) => c.active);
  const activeStaff = daily.staff.filter((s) => s.active);
  const existing = useMemo(() => dayTotals(date, daily.sales, daily.shifts, daily.staff), [date, daily.sales, daily.shifts, daily.staff]);

  // 그날 저장된 값을 입력 칸에 채운다
  useEffect(() => {
    if (daily.loading) return;
    setAmounts(Object.fromEntries(active.map((c) => [c.id, existing.byChannel[c.id] ?? 0])));
    const isCard = (id: string) => id === "hall_card" || id === "hall" || CARD_PRESETS.some((p) => p.id === id);
    const todayCards = Object.entries(existing.byChannel).filter(([id, amt]) => isCard(id) && amt > 0);
    if (todayCards.length) {
      setCardRows(todayCards.map(([channel, amount]) => ({ channel, amount })));
    } else {
      const lastDay = [...new Set(daily.sales.filter((x) => isCard(x.channel) && x.date < date).map((x) => x.date))].sort().pop();
      const lastCards = lastDay ? daily.sales.filter((x) => x.date === lastDay && isCard(x.channel)).map((x) => x.channel) : [];
      setCardRows((lastCards.length ? lastCards : ["hall_card"]).map((channel) => ({ channel, amount: 0 })));
    }
    setRows(daily.shifts.filter((s) => s.date === date).map((s) => ({ staffId: s.staffId, start: s.start ?? "", end: s.end ?? "", hours: s.hours })));
    setIssues([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily.loading, date, daily.sales, daily.shifts, daily.channels]);

  // 날짜를 옮기면 "저장했어요" 표시를 지운다 (저장 뒤 다시 불러올 때는 남긴다)
  useEffect(() => {
    setSaved(false);
  }, [date]);

  const summary = useMemo(() => monthSummary(month, daily.sales, daily.shifts, daily.staff, today), [month, daily.sales, daily.shifts, daily.staff, today]);
  const week = useMemo(() => weekHoursByStaff(date, daily.shifts, daily.staff), [date, daily.shifts, daily.staff]);

  const cardTotal = cardRows.reduce((a, r) => a + r.amount, 0);
  const groups = groupChannels(daily.channels, amounts);
  const dayTotal = cardTotal + groups.cashTotal + groups.deliveryTotal;
  const cardLabel = (id: string) => (id === "hall_card" || id === "hall" ? "카드 전체 / 기타" : CARD_PRESETS.find((p) => p.id === id)?.name ?? daily.channels.find((c) => c.id === id)?.name ?? id);
  const dayLabor = rows.reduce((a, r) => a + r.hours * (daily.staff.find((s) => s.id === r.staffId)?.wage ?? 0), 0);

  function trySave() {
    const found = checkDay(
      active.map((c) => ({ channelName: c.name, amount: amounts[c.id] ?? 0 })),
      rows.map((r) => ({ alias: daily.staff.find((s) => s.id === r.staffId)?.alias ?? "?", hours: r.hours })),
      summary.avgDailySales,
    );
    setIssues(found);
    if (found.some((i) => i.level === "error")) return;
    if (found.length) return setAsking("check");
    if (existing.entered && existing.sales !== dayTotal) return setAsking("overwrite");
    void save();
  }

  async function save() {
    setAsking(null);
    const store = getStore();
    const others: DailySale[] = active.filter((c) => c.kind !== "card" && (amounts[c.id] ?? 0) > 0).map((c) => ({ date, channel: c.id, amount: amounts[c.id] }));
    const cardSales: DailySale[] = [];
    for (const r of cardRows) {
      if (r.amount <= 0 || !r.channel) continue;
      const found = cardSales.find((x) => x.channel === r.channel);
      if (found) found.amount += r.amount;
      else cardSales.push({ date, channel: r.channel, amount: r.amount });
      const preset = CARD_PRESETS.find((p) => p.id === r.channel);
      if (preset) await ensureCardChannel(preset);
    }
    const sales = [...cardSales, ...others];
    const shifts: Shift[] = rows.filter((r) => r.staffId && r.hours > 0).map((r) => ({ date, staffId: r.staffId, hours: r.hours, start: r.start || undefined, end: r.end || undefined }));
    await store.saveDailySales(date, sales);
    await store.saveShifts(date, shifts);
    await daily.reload();
    setSaved(true);
    weather.fillMissing().catch(() => {});
  }

  const dow = DOW[(new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7];

  // 포스 "승인현황 (카드승인현황)" 엑셀 → 날짜별 카드사 매출. 파일은 이 화면 안에서만 읽는다.
  async function readCardFile(file: File) {
    setCardFileMsg(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true }) as never[][];
      setCardFile({ parsed: parseCardApproval(grid), name: file.name });
    } catch (e) {
      setCardFileMsg({ tone: "error", text: e instanceof CardApprovalError ? e.message : `파일을 읽지 못했어요. 포스 승인현황 엑셀(.xls, .xlsx)이 맞나요? (${e instanceof Error ? e.message : e})` });
    } finally {
      if (cardFileRef.current) cardFileRef.current.value = "";
    }
  }

  // 파일의 날짜마다: 그날 카드 줄은 파일 값으로 바꾸고, 현금·배달앱은 그대로 둔다
  async function applyCardFile() {
    if (!cardFile) return;
    const { parsed } = cardFile;
    const store = getStore();
    const isCard = (id: string) => id === "hall_card" || id === "hall" || CARD_PRESETS.some((p) => p.id === id);
    const used = new Set<string>();
    for (const d of parsed.days) {
      const keep = daily.sales.filter((s) => s.date === d.date && !isCard(s.channel));
      const cards: DailySale[] = Object.entries(d.byCard)
        .filter(([, amt]) => amt > 0)
        .map(([channel, amount]) => ({ date: d.date, channel, amount }));
      for (const c of cards) used.add(c.channel);
      await store.saveDailySales(d.date, [...keep, ...cards]);
    }
    for (const id of used) {
      const preset = CARD_PRESETS.find((p) => p.id === id);
      if (preset) await ensureCardChannel(preset);
    }
    setCardFile(null);
    await daily.reload();
    if (!date.startsWith(parsed.from.slice(0, 7))) setDate(parsed.to);
    setCardFileMsg({ tone: "ok", text: `${parsed.from.slice(5).replace("-", "/")}~${parsed.to.slice(5).replace("-", "/")} ${parsed.days.length}일치 카드 매출을 넣었어요. 현금·배달앱은 날마다 따로 넣어 주세요.` });
    weather.fillMissing().catch(() => {});
  }

  // 카드사를 처음 쓰면 채널(카드) + 정산 규칙(+2영업일) + 통장 입금 분류 규칙을 같이 만든다
  async function ensureCardChannel(preset: (typeof CARD_PRESETS)[number]) {
    const store = getStore();
    // 화면 상태가 아니라 저장소에서 읽는다 — 같은 저장에서 카드사를 여러 개 만들 때 앞의 것을 덮어쓰지 않도록
    const channels = (await store.getSetting<Channel[]>(CHANNELS_KEY)) ?? daily.channels;
    if (!channels.some((c) => c.id === preset.id && c.active)) {
      const next = channels.some((c) => c.id === preset.id)
        ? channels.map((c) => (c.id === preset.id ? { ...c, active: true } : c))
        : [...channels, { id: preset.id, name: preset.name, kind: "card" as const, active: true }];
      await store.saveSetting(CHANNELS_KEY, next.map((c) => (c.id === "hall_card" ? { ...c, name: "기타 카드" } : c)));
    }
    const rules = (await store.getSetting<SettlementRule[]>(SETTLEMENT_RULES_KEY)) ?? [];
    if (!rules.some((r) => r.channel === preset.id)) await store.saveSetting(SETTLEMENT_RULES_KEY, [...rules, { channel: preset.id, mode: "days", days: CARD_RULE_DAYS[preset.id] ?? DEFAULT_CARD_DAYS, weekday: 0 }]);
    const bankRules = await store.listRules();
    for (const k of preset.keywords) {
      if (!bankRules.some((r) => r.keyword === k && r.direction === "in")) {
        await store.saveRule({ id: newId(), keyword: k, direction: "in", major: "수입", minor: "매출액", channel: preset.id, ambiguous: false });
      }
    }
  }

  // 시연용: 가짜 직원 3명 + 9/1~9/17 일별 매출·근무를 한 번에 넣는다
  async function loadSample() {
    const store = getStore();
    for (const p of sample.staff as Staff[]) await store.saveStaff(p);
    const byDate = new Map<string, DailySale[]>();
    for (const s of sample.sales as DailySale[]) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
    for (const [d, list] of byDate) await store.saveDailySales(d, list);
    const shiftsByDate = new Map<string, Shift[]>();
    for (const s of sample.shifts as Shift[]) shiftsByDate.set(s.date, [...(shiftsByDate.get(s.date) ?? []), s]);
    for (const [d, list] of shiftsByDate) await store.saveShifts(d, list);
    setMonth(sample.month);
    setDate(`${sample.month}-17`);
    await daily.reload();
  }

  return (
    <>
      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <button className="btn-ghost px-2.5 py-1.5" aria-label="전날" onClick={() => setDate(shiftDate(date, -1))}>
            ◀
          </button>
          <div className="text-center">
            <input aria-label="날짜" type="date" className="num bg-transparent text-center text-base font-bold outline-none" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
            <p className="text-[11px] text-stone-500">
              {dow}요일 · {date === today ? "오늘" : existing.entered ? "입력됨" : "아직 안 넣음"}
              {todayWeather && (
                <span className="num ml-1">
                  · {KIND_ICON[todayWeather.kind]} {todayWeather.kind} {todayWeather.tempMin}~{todayWeather.tempMax}℃
                </span>
              )}
            </p>
          </div>
          <button className="btn-ghost px-2.5 py-1.5" aria-label="다음날" disabled={date >= today} onClick={() => setDate(shiftDate(date, 1))}>
            ▶
          </button>
        </div>

        <button className="w-full text-left text-[12px] text-sky-800" onClick={() => setHelp((v) => !v)}>
          {help ? "▲" : "?"} 마감할 때 1분, 어디서 숫자를 가져오나
        </button>
        {help && (
          <div className="rounded-xl bg-sky-50 px-3 py-2 text-[12px] text-sky-950 ring-1 ring-sky-200">
            <ul className="list-disc space-y-0.5 pl-4">
              <li>
                <b>홀 카드·현금</b> — 포스 <b>마감정산서</b>의 “결제수단별 매출내역”: 신용카드 → 카드, 일반현금+현금영수증 → 홀 현금, 간편결제 → 간편결제(카드사별로 나눴을 때). 할인을 뺀 <b>실매출</b> 기준이에요
              </li>
              <li>
                <b>카드사별로 나눴으면</b> — 마감정산서 맨 아래 “카드사별 매출내역”의 숫자를 카드사 칸에 그대로. 합계가 “카드매출”과 맞으면 돼요
              </li>
              <li>
                <b>배달앱</b> — 각 앱 사장님 앱의 오늘 주문금액(손님 결제 금액, 수수료 빼기 전)
              </li>
              <li>
                <b>알바</b> — 별칭을 고르고 <b>출근·퇴근 시각</b>을 24시간제로 넣으면 근무시간이 계산돼요(예: 18:00~22:30 → 4.5h, 저녁 6시는 18, 자정을 넘기면 다음날로). 숫자만 쳐도 돼요(1830 → 18:30). 시급은 아래 “직원·채널 설정”에서 한 번만 등록
              </li>
            </ul>
            <p className="mt-1">빠뜨린 날은 아래 달력의 회색 날짜를 눌러 나중에 채우면 돼요.</p>
          </div>
        )}

        <div>
          <p className="mb-1 text-xs font-semibold text-stone-500">매출 (주문일 기준)</p>
          <div className="mb-2 rounded-xl bg-stone-50 p-2">
            <p className="mb-1 text-[11px] font-semibold text-stone-500">카드 <span className="font-normal">— 카드사를 고르고 옆에 금액. 마감정산서 “카드사별 매출내역”대로</span></p>
            <div className="space-y-2">
              {cardRows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_8rem_2.5rem] items-center gap-2">
                  <select aria-label={`카드 ${i + 1} 카드사`} className="field" value={r.channel} onChange={(e) => { setCardRows((rs) => rs.map((x, j) => (j === i ? { ...x, channel: e.target.value } : x))); setSaved(false); }}>
                    <option value="hall_card">카드 전체 / 기타</option>
                    {CARD_PRESETS.map((p) => (
                      <option key={p.id} value={p.id} disabled={cardRows.some((x, j) => j !== i && x.channel === p.id)}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <MoneyInput label={`${cardLabel(r.channel)} 매출`} value={r.amount} onChange={(n) => { setCardRows((rs) => rs.map((x, j) => (j === i ? { ...x, amount: n ?? 0 } : x))); setSaved(false); }} />
                  <button className="btn-ghost px-2 py-1 text-xs" aria-label="카드 줄 지우기" disabled={cardRows.length === 1} onClick={() => setCardRows((rs) => rs.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </div>
              ))}
              <button
                className="btn-ghost w-full"
                disabled={cardRows.length >= CARD_PRESETS.length + 1}
                onClick={() => setCardRows((rs) => [...rs, { channel: CARD_PRESETS.find((p) => !rs.some((x) => x.channel === p.id))?.id ?? "hall_card", amount: 0 }])}
              >
                + 카드사 추가
              </button>
            </div>
            <p className="num mt-1 text-right text-xs text-stone-600">
              카드 합계 <b>{won(cardTotal)}</b>
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-1 border-t border-stone-200 pt-2">
              <p className="text-[11px] text-stone-500">여러 날을 한 번에: 포스 ASP → 매출관리 → 승인현황(카드승인현황) 엑셀</p>
              <input ref={cardFileRef} type="file" accept=".xls,.xlsx" aria-label="포스 카드승인현황 엑셀" className="hidden" onChange={(e) => e.target.files?.[0] && readCardFile(e.target.files[0])} />
              <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => cardFileRef.current?.click()}>
                카드승인현황 파일 올리기
              </button>
            </div>
            {cardFileMsg && (
              <div className="mt-2">
                <Notice tone={cardFileMsg.tone}>{cardFileMsg.text}</Notice>
              </div>
            )}
          </div>
          {(
            [
              { title: "현금", list: groups.cash, total: groups.cashTotal, showTotal: false },
              { title: "배달앱", list: groups.delivery, total: groups.deliveryTotal, showTotal: groups.delivery.length > 1 },
            ] as const
          ).map((g) =>
            g.list.length === 0 ? null : (
              <div key={g.title} className="mb-2 rounded-xl bg-stone-50 p-2">
                <p className="mb-1 text-[11px] font-semibold text-stone-500">{g.title}</p>
                <div className="grid grid-cols-2 gap-2">
                  {g.list.map((c) => (
                    <label key={c.id} className="space-y-1 text-[11px] text-stone-500">
                      {c.name}
                      <MoneyInput label={`${c.name} 매출`} value={amounts[c.id] ?? 0} onChange={(n) => { setAmounts((a) => ({ ...a, [c.id]: n ?? 0 })); setSaved(false); }} />
                    </label>
                  ))}
                </div>
                {g.showTotal && (
                  <p className="num mt-1 text-right text-xs text-stone-600">
                    {g.title} 합계 <b>{won(g.total)}</b>
                  </p>
                )}
              </div>
            ),
          )}
          <p className="num mt-1 text-right text-sm">
            오늘 매출 <b>{won(dayTotal)}</b>
            <span className="ml-2 text-[11px] text-stone-500">(카드 {num(cardTotal)} · 현금 {num(groups.cashTotal)} · 배달 {num(groups.deliveryTotal)})</span>
          </p>
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <p className="text-xs font-semibold text-stone-500">시급제 근무</p>
            <button className="text-[11px] text-orange-700" onClick={() => setShowSettings(true)}>
              직원·채널 설정
            </button>
          </div>
          {activeStaff.length === 0 && <Notice tone="info">직원 별칭과 시급을 먼저 등록해 주세요 (실명은 넣지 마세요).</Notice>}
          <div className="space-y-2">
            {rows.length > 0 && (
              <div className="grid grid-cols-[1fr_4rem_4rem_3rem_1.5rem] gap-1.5 px-1 text-[10px] text-stone-400">
                <span>직원</span>
                <span>출근</span>
                <span>퇴근</span>
                <span className="text-right">시간</span>
                <span />
              </div>
            )}
            {rows.map((r, i) => {
              const patchRow = (p: Partial<typeof r>) =>
                setRows((rs) =>
                  rs.map((x, j) => {
                    if (j !== i) return x;
                    const next = { ...x, ...p };
                    if (next.start && next.end) next.hours = hoursBetween(next.start, next.end);
                    else if ("start" in p || "end" in p) next.hours = 0; // 시각을 지우면 자동 계산값도 지운다
                    return next;
                  }),
                );
              return (
                <div key={i} className="grid grid-cols-[1fr_4rem_4rem_3rem_1.5rem] items-center gap-1.5">
                  <select aria-label={`근무 ${i + 1} 직원`} className="field" value={r.staffId} onChange={(e) => patchRow({ staffId: e.target.value })}>
                    <option value="">직원 고르기</option>
                    {activeStaff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.alias}
                      </option>
                    ))}
                  </select>
                  <TimeField label={`근무 ${i + 1} 출근`} value={r.start} onChange={(v) => patchRow({ start: v })} />
                  <TimeField label={`근무 ${i + 1} 퇴근`} value={r.end} onChange={(v) => patchRow({ end: v })} />
                  {r.start && r.end ? (
                    <span className="num text-right text-sm font-bold text-orange-700">{r.hours}h</span>
                  ) : (
                    <input aria-label={`근무 ${i + 1} 시간`} inputMode="decimal" className="field num px-1 text-right" placeholder="시간" value={r.hours || ""} onChange={(e) => patchRow({ hours: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} />
                  )}
                  <button className="btn-ghost px-1 py-1 text-xs" aria-label="근무 줄 지우기" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </div>
              );
            })}
            <button
              className="btn-ghost w-full"
              disabled={activeStaff.length === 0}
              onClick={() =>
                setRows((rs) => {
                  const staffId = activeStaff.find((s) => !rs.some((r) => r.staffId === s.id))?.id ?? "";
                  const last = [...daily.shifts].filter((x) => x.staffId === staffId && x.start && x.end).sort((a, b) => b.date.localeCompare(a.date))[0];
                  const start = last?.start ?? "";
                  const end = last?.end ?? "";
                  return [...rs, { staffId, start, end, hours: start && end ? hoursBetween(start, end) : 0 }];
                })
              }
            >
              + 근무 추가
            </button>
          </div>
          {rows.length > 0 && (
            <p className="num mt-1 text-right text-sm">
              어림 인건비 <b>{won(dayLabor)}</b> · 인건비율 <b>{pctText(dayTotal > 0 ? Math.round((dayLabor / dayTotal) * 1000) / 10 : null)}</b>
            </p>
          )}
          {week.some((w) => w.warn) && (
            <Notice tone="warn">
              이번 주 근무시간 확인 필요: {week.filter((w) => w.warn).map((w) => `${w.alias} ${w.hours}시간`).join(", ")} — 주 15시간을 넘으면 주휴수당이 생길 수 있어요. 판단은 사장님·노무사와.
            </Notice>
          )}
        </div>

        {issues.filter((i) => i.level === "error").map((i) => (
          <Notice key={i.message} tone="error">
            {i.message}
          </Notice>
        ))}
        {saved && <Notice tone="ok">저장했어요.</Notice>}
        <button className="btn-primary w-full" onClick={trySave}>
          {existing.entered ? "고쳐서 저장" : "오늘 마감 저장"}
        </button>
      </section>

      <section className="card space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold">{monthLabel(month)}</h2>
          <span className="text-[11px] text-stone-500">
            {summary.enteredDays}일 입력{summary.missingDays.length > 0 && ` · 빈 날 ${summary.missingDays.length}`}
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
          {DOW.map((d) => (
            <div key={d} className="text-stone-400">
              {d}
            </div>
          ))}
          {Array.from({ length: (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7 }).map((_, i) => (
            <div key={`pad${i}`} />
          ))}
          {daysInMonth(month).map((d) => {
            const t = summary.days.find((x) => x.date === d)!;
            const future = d > today;
            const cls = d === date ? "ring-2 ring-orange-500 " : "";
            const bg = t.entered ? "bg-emerald-100 text-emerald-900" : future ? "text-stone-300" : "bg-stone-100 text-stone-500";
            return (
              <button key={d} aria-label={d} disabled={future} className={`${cls}${bg} num rounded-lg py-1.5`} onClick={() => setDate(d)}>
                {Number(d.slice(8))}
              </button>
            );
          })}
        </div>
        {summary.enteredDays === 0 && (
          <button className="btn-ghost w-full" onClick={loadSample}>
            가짜 예시 자료 넣기 (9/1~9/17, 직원 3명)
          </button>
        )}
        <div className="num grid grid-cols-3 gap-2 pt-1 text-center text-sm">
          <div>
            <p className="text-[11px] text-stone-500">누적 매출</p>
            <p className="font-bold">{num(summary.sales)}</p>
          </div>
          <div>
            <p className="text-[11px] text-stone-500">하루 평균</p>
            <p className="font-bold">{summary.avgDailySales === null ? "–" : num(summary.avgDailySales)}</p>
          </div>
          <div>
            <p className="text-[11px] text-stone-500">인건비율</p>
            <p className="font-bold">{pctText(summary.laborRate)}</p>
          </div>
        </div>
      </section>

      <Link href="/weather" className="card block space-y-1">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">날씨 × 매출</h2>
          <span className="text-xs font-semibold text-orange-700">자세히 →</span>
        </div>
        {weather.analysis.days === 0 ? (
          <p className="text-sm text-stone-500">매출을 넣으면 그날 날씨가 자동으로 붙고, 비 오는 날 배달이 얼마나 느는지 보여 줘요.</p>
        ) : (
          <p className="num text-sm text-stone-700">
            {weather.analysis.rainEffect.delivery !== null ? (
              <>
                비 오는 날 배달 <b>{weather.analysis.rainEffect.delivery > 0 ? "+" : ""}{weather.analysis.rainEffect.delivery}%</b>, 홀 <b>{(weather.analysis.rainEffect.hall ?? 0) > 0 ? "+" : ""}{weather.analysis.rainEffect.hall ?? "–"}%</b> (맑은 날 대비 · {weather.analysis.days}일 기준)
              </>
            ) : (
              <>날씨와 매출이 같이 있는 날 {weather.analysis.days}일. 비 오는 날이 쌓이면 비교가 나와요.</>
            )}
          </p>
        )}
        {weather.forecast.length > 0 && (
          <p className="num text-xs text-stone-500">
            {weather.forecast.slice(0, 3).map((f) => {
              const e = expectedSales(weather.analysis, f.date, f.kind);
              return `${f.date.slice(5)} ${KIND_ICON[f.kind]}${e ? " " + num(e.amount) : ""}`;
            }).join(" · ")}
          </p>
        )}
      </Link>

      {showSettings && <SettingsDialog daily={daily} onClose={() => setShowSettings(false)} />}

      {cardFile && (
        <ConfirmDialog title="카드승인현황 파일 — 이대로 넣을까요?" confirmLabel={`${cardFile.parsed.days.length}일치 넣기`} onConfirm={applyCardFile} onCancel={() => setCardFile(null)}>
          <p>
            <b>{cardFile.parsed.from}</b> ~ <b>{cardFile.parsed.to}</b> · {cardFile.parsed.days.length}일 · 승인 {num(cardFile.parsed.days.reduce((a, d) => a + d.count, 0))}건
          </p>
          <p className="num">
            카드 합계 <b>{won(cardFile.parsed.total)}</b>
            {cardFile.parsed.sheetTotal !== null && cardFile.parsed.sheetTotal !== cardFile.parsed.total && <span className="text-stone-500"> (파일 합계 줄 {won(cardFile.parsed.sheetTotal)} — 취소 건 차이)</span>}
          </p>
          <ul className="num grid grid-cols-2 gap-x-3 text-xs text-stone-600">
            {Object.entries(cardFile.parsed.byCard)
              .sort((a, b) => b[1] - a[1])
              .map(([id, amt]) => (
                <li key={id} className="flex justify-between">
                  <span>{cardLabel(id)}</span>
                  <span>{won(amt)}</span>
                </li>
              ))}
          </ul>
          {cardFile.parsed.unknownIssuers.length > 0 && <Notice tone="warn">카드사 목록에 없는 매입사 “{cardFile.parsed.unknownIssuers.join(", ")}”는 ‘카드 전체 / 기타’로 넣어요.</Notice>}
          <p className="text-xs text-stone-500">이 날짜들의 카드 매출은 파일 값으로 바뀌어요. 현금·배달앱·근무는 그대로예요. 자정 넘어 결제한 것도 영업일자대로 전날에 붙어요.</p>
        </ConfirmDialog>
      )}
      {asking === "check" && (
        <ConfirmDialog title="숫자를 한 번 더 확인해 주세요" confirmLabel="맞아요, 저장" onConfirm={save} onCancel={() => setAsking(null)}>
          {issues.map((i) => (
            <p key={i.message}>• {i.message}</p>
          ))}
        </ConfirmDialog>
      )}
      {asking === "overwrite" && (
        <ConfirmDialog title="이미 넣은 날이에요" confirmLabel="덮어쓰기" onConfirm={save} onCancel={() => setAsking(null)}>
          <p>
            {date}에 저장된 매출 {won(existing.sales)}을(를) {won(dayTotal)}으로 바꿀까요?
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}

// 직원(별칭·시급)과 채널 목록 설정
function SettingsDialog({ daily, onClose }: { daily: ReturnType<typeof useDaily>; onClose: () => void }) {
  const [alias, setAlias] = useState("");
  const [wage, setWage] = useState(0);
  const [channels, setChannels] = useState<Channel[]>(daily.channels);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<ChannelKind>("card");

  async function addStaff() {
    if (!alias.trim() || wage <= 0) return;
    await getStore().saveStaff({ id: newId(), alias: alias.trim(), wage, active: true });
    setAlias("");
    setWage(0);
    await daily.reload();
  }
  async function toggleStaff(s: Staff) {
    await getStore().saveStaff({ ...s, active: !s.active });
    await daily.reload();
  }
  async function saveChannels(next: Channel[]) {
    setChannels(next);
    await getStore().saveSetting(CHANNELS_KEY, next);
    await daily.reload();
  }


  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="직원·채널 설정">
      <div className="card max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">직원·채널 설정</h2>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={onClose}>
            닫기
          </button>
        </div>

        <section className="space-y-2">
          <p className="text-sm font-semibold">시급제 직원 (별칭만, 실명 금지)</p>
          <ul className="divide-y divide-stone-100 text-sm">
            {daily.staff.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-1.5">
                <span className={s.active ? "" : "text-stone-400 line-through"}>
                  {s.alias} <span className="num text-xs text-stone-500">시급 {num(s.wage)}</span>
                </span>
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => toggleStaff(s)}>
                  {s.active ? "그만둠" : "다시 활성"}
                </button>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-[1fr_7rem_4rem] gap-2">
            <input aria-label="별칭" className="field" placeholder="별칭 (예: 홀A)" value={alias} onChange={(e) => setAlias(e.target.value)} />
            <MoneyInput label="시급" value={wage} onChange={(n) => setWage(n ?? 0)} placeholder="시급" />
            <button className="btn-primary px-2" disabled={!alias.trim() || wage <= 0} onClick={addStaff}>
              추가
            </button>
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-sm font-semibold">매출 채널</p>
          <p className="text-[11px] text-stone-500">카드사는 오늘 탭에서 “+ 카드사 추가”로 고르면 자동으로 여기에 생겨요. 배달앱·현금 채널만 여기서 켜고 끄세요.</p>
          <ul className="divide-y divide-stone-100 text-sm">
            {channels.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-1.5">
                <span className={c.active ? "" : "text-stone-400"}>
                  {c.name} <span className="text-[10px] text-stone-400">{{ card: "카드", cash: "현금", delivery: "배달앱" }[c.kind]}</span>
                </span>
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => saveChannels(channels.map((x) => (x.id === c.id ? { ...x, active: !x.active } : x)))}>
                  {c.active ? "끄기" : "켜기"}
                </button>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-[1fr_6rem_4rem] gap-2">
            <input aria-label="새 채널 이름" className="field" placeholder="예: BC카드" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <select aria-label="새 채널 종류" className="field" value={newKind} onChange={(e) => setNewKind(e.target.value as ChannelKind)}>
              <option value="card">카드</option>
              <option value="delivery">배달앱</option>
              <option value="cash">현금</option>
            </select>
            <button
              className="btn-primary px-2"
              disabled={!newName.trim()}
              onClick={() => {
                void saveChannels([...channels, { id: `ch_${newId().slice(0, 8)}`, name: newName.trim(), kind: newKind, active: true }]);
                setNewName("");
              }}
            >
              추가
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
