"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMonth } from "@/components/AppShell";
import { ConfirmDialog, MoneyInput, Notice } from "@/components/ui";
import { CHANNELS_KEY, useDaily } from "@/components/useDaily";
import type { Channel, ChannelKind } from "@/lib/categories";
import { newId } from "@/lib/classify";
import { checkDay, dayTotals, daysInMonth, monthSummary, shiftDate, todayStr, weekHoursByStaff, type DailyIssue } from "@/lib/daily";
import { num, pctText, won } from "@/lib/format";
import { monthLabel } from "@/lib/month";
import { getStore } from "@/lib/storage";
import type { DailySale, Shift, Staff } from "@/lib/types";
import sample from "@/lib/sampleDaily.json";
import { useWeather } from "@/components/useWeather";
import { KIND_ICON, expectedSales } from "@/lib/weather";

const DOW = ["월", "화", "수", "목", "금", "토", "일"];

export default function TodayPage() {
  const { month, setMonth } = useMonth();
  const daily = useDaily(month);
  const today = todayStr();
  const [date, setDate] = useState(() => (today.startsWith(month) ? today : `${month}-01`));
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<{ staffId: string; hours: number }[]>([]);
  const [issues, setIssues] = useState<DailyIssue[]>([]);
  const [asking, setAsking] = useState<"check" | "overwrite" | null>(null);
  const [saved, setSaved] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [help, setHelp] = useState(false);
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
    setRows(daily.shifts.filter((s) => s.date === date).map((s) => ({ staffId: s.staffId, hours: s.hours })));
    setIssues([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily.loading, date, daily.sales, daily.shifts, daily.channels]);

  // 날짜를 옮기면 "저장했어요" 표시를 지운다 (저장 뒤 다시 불러올 때는 남긴다)
  useEffect(() => {
    setSaved(false);
  }, [date]);

  const summary = useMemo(() => monthSummary(month, daily.sales, daily.shifts, daily.staff, today), [month, daily.sales, daily.shifts, daily.staff, today]);
  const week = useMemo(() => weekHoursByStaff(date, daily.shifts, daily.staff), [date, daily.shifts, daily.staff]);

  const dayTotal = active.reduce((a, c) => a + (amounts[c.id] ?? 0), 0);
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
    const sales: DailySale[] = active.filter((c) => (amounts[c.id] ?? 0) > 0).map((c) => ({ date, channel: c.id, amount: amounts[c.id] }));
    const shifts: Shift[] = rows.filter((r) => r.staffId && r.hours > 0).map((r) => ({ date, staffId: r.staffId, hours: r.hours }));
    await store.saveDailySales(date, sales);
    await store.saveShifts(date, shifts);
    await daily.reload();
    setSaved(true);
    weather.fillMissing().catch(() => {});
  }

  const dow = DOW[(new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7];

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
                <b>홀 카드·현금</b> — 포스 마감(일계) 화면의 카드 매출·현금 매출
              </li>
              <li>
                <b>배달앱</b> — 각 앱 사장님 앱의 오늘 주문금액(손님 결제 금액, 수수료 빼기 전)
              </li>
              <li>
                <b>알바</b> — 별칭을 고르고 오늘 일한 시간. 시급은 아래 “직원·채널 설정”에서 한 번만 등록
              </li>
            </ul>
            <p className="mt-1">빠뜨린 날은 아래 달력의 회색 날짜를 눌러 나중에 채우면 돼요.</p>
          </div>
        )}

        <div>
          <p className="mb-1 text-xs font-semibold text-stone-500">매출 (주문일 기준)</p>
          <div className="grid grid-cols-2 gap-2">
            {active.map((c) => (
              <label key={c.id} className="space-y-1 text-[11px] text-stone-500">
                {c.name}
                <MoneyInput label={`${c.name} 매출`} value={amounts[c.id] ?? 0} onChange={(n) => { setAmounts((a) => ({ ...a, [c.id]: n ?? 0 })); setSaved(false); }} />
              </label>
            ))}
          </div>
          <p className="num mt-1 text-right text-sm">
            오늘 매출 <b>{won(dayTotal)}</b>
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
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_5rem_2.5rem] items-center gap-2">
                <select aria-label={`근무 ${i + 1} 직원`} className="field" value={r.staffId} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, staffId: e.target.value } : x)))}>
                  <option value="">직원 고르기</option>
                  {activeStaff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.alias}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`근무 ${i + 1} 시간`}
                  inputMode="decimal"
                  className="field num text-right"
                  placeholder="시간"
                  value={r.hours || ""}
                  onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, hours: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 } : x)))}
                />
                <button className="btn-ghost px-2 py-1 text-xs" aria-label="근무 줄 지우기" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            ))}
            <button className="btn-ghost w-full" disabled={activeStaff.length === 0} onClick={() => setRows((rs) => [...rs, { staffId: activeStaff.find((s) => !rs.some((r) => r.staffId === s.id))?.id ?? "", hours: 0 }])}>
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
          <p className="text-[11px] text-stone-500">포스에 카드사별 매출 집계가 있으면 “카드” 채널을 카드사별로 추가하고 “홀 카드”를 끄면 돼요.</p>
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
