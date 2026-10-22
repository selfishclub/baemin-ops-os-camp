"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Notice } from "@/components/ui";
import { MARKET_MANUAL_KEY, type ManualEntry } from "@/components/MarketManualCard";
import { NeighborhoodImports } from "@/components/NeighborhoodImports";
import { num } from "@/lib/format";
import { HISTORY_KEY, type HistoryDay } from "@/lib/history";
import { withHistory } from "@/lib/market/insight";
import {
  BUS_KEY,
  FEELS,
  JOURNAL_KEY,
  PARKING_CITY_URL,
  PARKING_DELETED_KEY,
  PARKING_KEY,
  PARKING_LOT,
  PARKING_URL,
  SUGGESTED_TIMES,
  TABLES_KEY,
  TAGS,
  VISITORS_KEY,
  busDay,
  dayTimeline,
  isValidDate,
  isValidTime,
  kstNow,
  mergeAutoParking,
  missingMonths,
  newId,
  parkingAge,
  parkingUse,
  tablesOn,
  terraceOpen,
  upsertById,
  validateJournal,
  validateParking,
  visitorDay,
  type BusStore,
  type Feel,
  type JournalEntry,
  type ParkingReading,
  type ParkingRecord,
  type TablesSetting,
  type VisitorStore,
} from "@/lib/market/neighborhood";
import { MARKET_REPORT_KEY, type SbizReport } from "@/lib/market/sbizReport";
import { getStore } from "@/lib/storage";
import type { DailySale } from "@/lib/types";

// 상권 탭 맨 위 — 오늘 동네와 우리 가게 (PRD v1).
//  A 주차 현황(직접 입력) · B 짧은 장사 일지 · C 그날 시간 흐름 비교 + 하루 단위 자료(나중에 오는 자료는 따로) · D 자료 가져오기.
//  자동 판정은 하지 않는다. 숫자가 없으면 "–" 이고 0 으로 채우지 않는다.

// 리뷰 수집기 도우미 (내 컴퓨터 127.0.0.1:4599) — 주차 자동 기록을 여기서 받아 온다
const HELPER = process.env.NEXT_PUBLIC_HELPER_URL || "http://127.0.0.1:4599";
type AutoState = { kind: "loading" } | { kind: "off" } | { kind: "ok"; last: ParkingReading | null; added: number; lastError: { at: string; reason: string; stop?: boolean } | null };

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const dow = (d: string) => WEEK[new Date(`${d}T00:00:00Z`).getUTCDay()];
const show = (n: number | null | undefined, unit = "") => (n === null || n === undefined ? "–" : `${num(n)}${unit}`);

/** 빈 칸(null)과 0 을 구분하는 정수 칸 */
function IntInput({ value, onChange, placeholder, label }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string; label: string }) {
  return (
    <input
      aria-label={label}
      className="field num mt-1"
      inputMode="numeric"
      value={value ?? ""}
      placeholder={placeholder ?? "안 셌으면 비워 두기"}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d]/g, "");
        onChange(t === "" ? null : Number(t));
      }}
    />
  );
}

function Chips<T extends string>({ options, value, onChange, label }: { options: T[]; value: T | null; onChange: (v: T | null) => void; label: string }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className={`rounded-full px-3 py-1 text-xs ring-1 ${value === o ? "bg-stone-800 text-white ring-stone-800" : "bg-white text-stone-700 ring-stone-300"}`}
          onClick={() => onChange(value === o ? null : o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

interface Draft {
  id: string | null; // 고치는 중이면 그 기록 id
  time: string;
  seated: number | null;
  totalTables: number | null;
  street: Feel | null;
  nearby: Feel | null;
  tags: string[];
  memo: string;
  teamsIn: number | null;
}
const emptyDraft = (time: string, totalTables: number | null): Draft => ({ id: null, time, seated: null, totalTables, street: null, nearby: null, tags: [], memo: "", teamsIn: null });

export function NeighborhoodToday({ center }: { center: { lat: number; lng: number } | null }) {
  const [now, setNow] = useState(kstNow());
  const [date, setDate] = useState(now.date);
  const [loaded, setLoaded] = useState(false);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [parking, setParking] = useState<ParkingRecord[]>([]);
  const [tables, setTables] = useState<TablesSetting | null>(null);
  const [visitors, setVisitors] = useState<VisitorStore | null>(null);
  const [bus, setBus] = useState<BusStore | null>(null);
  const [report, setReport] = useState<SbizReport | null>(null);
  const [manual, setManual] = useState<ManualEntry[]>([]);
  const [salesByDay, setSalesByDay] = useState<Map<string, { total: number; ledger: boolean }>>(new Map());
  const [msg, setMsg] = useState<{ tone: "ok" | "error" | "warn"; text: string } | null>(null);
  const [auto, setAuto] = useState<AutoState>({ kind: "loading" });

  // 주차 입력 칸
  const [pTotal, setPTotal] = useState<number | null>(null);
  const [pAvail, setPAvail] = useState<number | null>(null);
  const [pTime, setPTime] = useState(now.time);
  const [pSource, setPSource] = useState("");
  const [pNote, setPNote] = useState("");
  // 일지 입력 칸
  const [draft, setDraft] = useState<Draft>(emptyDraft(now.time, null));
  // "고치기"를 누르면 입력 칸이 목록보다 위에 있어 눈에 안 띈다 → 입력 칸으로 올려 보내고 착석 칸에 커서 (2026-10-22 사장님: 고치기가 안 되는 것 같다)
  const journalFormRef = useRef<HTMLDivElement>(null);
  function startEdit(j: JournalEntry) {
    setDraft({ id: j.id, time: j.time, seated: j.seated, totalTables: j.totalTables, street: j.street, nearby: j.nearby, tags: j.tags, memo: j.memo, teamsIn: j.teamsIn });
    setTimeout(() => {
      journalFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      journalFormRef.current?.querySelector<HTMLInputElement>('input[aria-label="착석 테이블 수"]')?.focus({ preventScroll: true });
    }, 50);
  }
  const [inInput, setInInput] = useState<number | null>(null);
  const [outInput, setOutInput] = useState<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(kstNow()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const store = getStore();
    void Promise.all([
      store.getSetting<JournalEntry[]>(JOURNAL_KEY),
      store.getSetting<ParkingRecord[]>(PARKING_KEY),
      store.getSetting<TablesSetting>(TABLES_KEY),
      store.getSetting<VisitorStore>(VISITORS_KEY),
      store.getSetting<BusStore>(BUS_KEY),
      store.getSetting<SbizReport>(MARKET_REPORT_KEY),
      store.getSetting<ManualEntry[]>(MARKET_MANUAL_KEY),
      store.listAllDailySales(),
      store.getSetting<HistoryDay[]>(HISTORY_KEY),
      store.getSetting<string[]>(PARKING_DELETED_KEY),
    ]).then(([j, p, t, v, b, r, m, rows, hist, gone]: [JournalEntry[] | null, ParkingRecord[] | null, TablesSetting | null, VisitorStore | null, BusStore | null, SbizReport | null, ManualEntry[] | null, DailySale[], HistoryDay[] | null, string[] | null]) => {
      setJournal(j ?? []);
      setParking(p ?? []);
      setTables(t);
      setVisitors(v);
      setBus(b);
      setReport(r);
      setManual(m ?? []);
      // 하루 매출 = 장부 채널 합계, 장부 쓰기 전은 지난 매출(포스 홀+배달) — 해마다 견줘 보기와 같은 합치기
      const byDay = new Map<string, number>();
      for (const s of rows) byDay.set(s.date, (byDay.get(s.date) ?? 0) + s.amount);
      const ledgerDates = new Set(byDay.keys());
      const merged = withHistory([...byDay].map(([d, total]) => ({ date: d, total })), hist ?? []);
      setSalesByDay(new Map(merged.map((d) => [d.date, { total: d.total, ledger: ledgerDates.has(d.date) && byDay.get(d.date) === d.total }])));
      const lastP = [...(p ?? [])].sort((a, c) => a.date.localeCompare(c.date) || a.time.localeCompare(c.time)).pop();
      if (lastP) setPTotal(lastP.total);
      setInInput(t?.inside ?? null);
      setOutInput(t?.outside ?? null);
      setLoaded(true);
      void pullAuto(p ?? [], gone ?? []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 도우미에서 최근 60일 자동 기록을 받아 장부 주차 기록에 더한다 (같은 날짜·시각은 한 번만) */
  async function pullAuto(current: ParkingRecord[], deleted: string[]) {
    const since = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 4000);
      const res = await fetch(`${HELPER}/parking/readings?since=${since}`, { signal: ctl.signal });
      clearTimeout(timer);
      if (!res.ok) return setAuto({ kind: "off" });
      const body = (await res.json()) as { readings?: ParkingReading[]; lastError?: { at: string; reason: string; stop?: boolean } | null };
      const readings = body.readings ?? [];
      // 저장 직전에 저장소의 최신 목록 위에 더한다 (다른 탭이 사이에 바꿨어도 덮어쓰지 않게)
      const latest = (await getStore().getSetting<ParkingRecord[]>(PARKING_KEY)) ?? current;
      const m = mergeAutoParking(latest, readings, deleted);
      if (m.added) {
        await getStore().saveSetting(PARKING_KEY, m.list);
        setParking(m.list);
      }
      setAuto({ kind: "ok", last: readings[readings.length - 1] ?? null, added: m.added, lastError: body.lastError ?? null });
    } catch {
      setAuto({ kind: "off" });
    }
  }

  const isToday = date === now.date;
  const tableCount = tablesOn(tables, date);
  // 날짜를 바꾸면 입력 칸 시각·테이블 수를 그날에 맞춘다
  useEffect(() => {
    setDraft(emptyDraft(isToday ? now.time : "20:00", tableCount));
    setPTime(isToday ? now.time : "20:00");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, tableCount]);

  const save = async <T,>(key: string, value: T, okText: string): Promise<boolean> => {
    try {
      await getStore().saveSetting(key, value);
      setMsg({ tone: "ok", text: okText });
      return true;
    } catch (e) {
      setMsg({ tone: "error", text: `저장하지 못했어요: ${e instanceof Error ? e.message : String(e)}` });
      return false;
    }
  };

  const dayParking = useMemo(() => parking.filter((p) => p.date === date).sort((a, b) => a.time.localeCompare(b.time)), [parking, date]);
  const dayJournal = useMemo(() => journal.filter((j) => j.date === date), [journal, date]);
  const timeline = useMemo(() => dayTimeline(journal, parking, date), [journal, parking, date]);
  const recordedDates = useMemo(() => [...new Set([...journal.map((j) => j.date), ...parking.map((p) => p.date)])].sort().reverse(), [journal, parking]);
  const lastPark = dayParking[dayParking.length - 1] ?? null;
  const lastAge = lastPark ? parkingAge(lastPark, now) : null;

  async function addParking() {
    const err = validateParking(pTotal, pAvail) ?? (!isValidTime(pTime) ? "본 시각을 00:00~23:59 로 적어 주세요." : null) ?? (pSource && !isValidTime(pSource) ? "출처 기준 시각은 00:00 모양으로 적거나 비워 두세요." : null);
    if (err) return setMsg({ tone: "error", text: err });
    const rec: ParkingRecord = { id: newId(), lot: PARKING_LOT, date, time: pTime, sourceTime: pSource || null, total: pTotal!, available: pAvail!, method: "직접 입력", note: pNote.trim(), savedAt: new Date().toISOString() };
    const next = upsertById((await getStore().getSetting<ParkingRecord[]>(PARKING_KEY)) ?? parking, rec);
    if (await save(PARKING_KEY, next, `주차 ${md(date)} ${pTime} 기록했어요.`)) {
      setParking(next);
      setPAvail(null);
      setPSource("");
      setPNote("");
    }
  }
  async function removeParking(id: string) {
    // 자동 기록은 지운 id 를 남겨 두어 도우미에서 다시 받아 와도 안 들어오게 한다
    if (id.startsWith("auto-")) {
      const gone = (await getStore().getSetting<string[]>(PARKING_DELETED_KEY)) ?? [];
      if (!gone.includes(id) && !(await save(PARKING_DELETED_KEY, [...gone, id], ""))) return;
    }
    const next = ((await getStore().getSetting<ParkingRecord[]>(PARKING_KEY)) ?? parking).filter((p) => p.id !== id);
    if (await save(PARKING_KEY, next, id.startsWith("auto-") ? "주차 기록을 지웠어요. 자동 기록이라도 다시 받아 오지 않아요." : "주차 기록을 지웠어요.")) setParking(next);
  }

  async function saveJournal() {
    const entry: JournalEntry = {
      id: draft.id ?? newId(),
      date,
      time: draft.time,
      seated: draft.seated,
      totalTables: draft.totalTables,
      street: draft.street,
      nearby: draft.nearby,
      tags: draft.tags,
      memo: draft.memo.trim(),
      teamsIn: draft.teamsIn,
      savedAt: new Date().toISOString(),
    };
    const err = validateJournal(entry);
    if (err) return setMsg({ tone: "error", text: err });
    const next = upsertById((await getStore().getSetting<JournalEntry[]>(JOURNAL_KEY)) ?? journal, entry);
    if (await save(JOURNAL_KEY, next, `${md(date)} ${entry.time} 일지를 ${draft.id ? "고쳤어요" : "저장했어요"}.`)) {
      setJournal(next);
      setDraft(emptyDraft(isToday ? kstNow().time : draft.time, tableCount));
    }
  }
  async function removeJournal(id: string) {
    const next = ((await getStore().getSetting<JournalEntry[]>(JOURNAL_KEY)) ?? journal).filter((j) => j.id !== id);
    if (await save(JOURNAL_KEY, next, "일지를 지웠어요.")) {
      setJournal(next);
      if (draft.id === id) setDraft(emptyDraft(draft.time, tableCount));
    }
  }
  async function saveTables() {
    if (inInput === null || inInput <= 0) return setMsg({ tone: "error", text: "내부 테이블 수를 1 이상으로 적어 주세요." });
    const next: TablesSetting = { history: tables?.history ?? [], terraceDays: tables?.terraceDays ?? {}, inside: inInput, outside: outInput ?? 0 };
    if (await save(TABLES_KEY, next, `테이블 수를 내부 ${inInput}개 · 야장 ${outInput ?? 0}개로 적었어요.`)) setTables(next);
  }
  async function setTerrace(open: boolean) {
    const next: TablesSetting = { history: tables?.history ?? [], inside: tables?.inside, outside: tables?.outside, terraceDays: { ...(tables?.terraceDays ?? {}), [date]: open } };
    if (await save(TABLES_KEY, next, `${md(date)} 야장 ${open ? "열었어요" : "안 열었어요"}로 적었어요.`)) setTables(next);
  }

  if (!loaded) return null;

  // ── 하루 단위 자료 (나중에 도착하는 자료) ──
  const vDay = visitorDay(visitors, date);
  const vLast = visitors ? Object.keys(visitors.days).sort().pop() ?? null : null;
  const bDay = busDay(bus, date);
  const bMonths = bus?.months.map((m) => m.month) ?? [];
  const bGap = missingMonths(bMonths);
  const stationMedian = (() => {
    const s = Object.values(bus?.days ?? {}).map((d) => d[6]).sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : null;
  })();
  const sale = salesByDay.get(date) ?? null;
  const month = date.slice(0, 7);
  const rMonth = report?.months.find((m) => m.month === month) ?? null;
  const mMonth = manual.find((m) => m.month === month) ?? null;

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">
          오늘 동네와 우리 가게 <span className="text-xs font-normal text-stone-500">한산할 때 — 동네 전체가 한산한지, 우리만 한산한지 되짚는 기록</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className="field w-auto py-1 text-sm" value={date} max={now.date} onChange={(e) => isValidDate(e.target.value) && setDate(e.target.value)} aria-label="날짜 고르기" />
          {!isToday && (
            <button type="button" className="btn-ghost text-xs" onClick={() => setDate(now.date)}>
              오늘로
            </button>
          )}
          {recordedDates.length > 0 && (
            <select className="field w-auto py-1 text-xs" value="" onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="기록한 날 고르기">
              <option value="">기록한 날 {recordedDates.length}일</option>
              {recordedDates.map((d) => (
                <option key={d} value={d}>
                  {d} ({dow(d)})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <p className="num text-xs text-stone-500">
        {date} ({dow(date)}) · 지금 한국 시각 {now.date} {now.time} · 판단은 사장님이 해요 — 이 화면은 같은 시각의 기록을 나란히 보여 주기만 해요.
      </p>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {/* A. 주차 */}
      <div className="space-y-2 rounded-xl bg-stone-50 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold">
            A. 주차 — {PARKING_LOT} <span className="text-xs font-normal text-stone-500">주변 상황의 보조 신호 (차 대수이지 손님 수가 아니에요)</span>
          </p>
          <a className="text-xs font-semibold text-orange-700 underline" href={PARKING_URL} target="_blank" rel="noreferrer">
            통합주차포털 열기
          </a>
        </div>
        <p className="text-xs text-stone-600">
          확보 방식: <b>자동 수집</b> — 수집기가 통합주차포털 공개 첫 화면을 저녁 18~22시 매시 한 번 읽어요(컴퓨터가 켜져 있을 때만). 그 사이 시각은 <b>직접 입력</b>으로 더해요. 공식 API·이용 조건은 확인하지 못했고{" "}
          <a className="underline" href={PARKING_CITY_URL} target="_blank" rel="noreferrer">
            청주 교통빅데이터
          </a>
          에는 율량·사천동 주차장이 없어요. 포털 화면에 자료 기준 시각이 없어 &quot;읽은 시각&quot;만 남아요.
        </p>
        <p className="num text-xs">
          {auto.kind === "loading" && <span className="text-stone-500">자동 기록 받는 중…</span>}
          {auto.kind === "off" && <span className="font-semibold text-amber-800">도우미가 꺼져 있어 자동 기록을 못 받았어요 — 수집기 도우미(npm run helper)를 켜면 다음에 열 때 들어와요.</span>}
          {auto.kind === "ok" && (
            <span className="text-stone-600">
              자동 기록: {auto.last ? `마지막으로 읽은 때 ${md(auto.last.date)} ${auto.last.time} (가능 ${num(auto.last.available)}/${num(auto.last.total)})` : "아직 읽은 기록 없음 (18시부터)"}
              {auto.added > 0 && ` · 이번에 ${auto.added}건 받아 왔어요`}
              {auto.lastError && <span className="ml-1 font-semibold text-red-700">· 마지막 실패 {auto.lastError.at.slice(5, 16).replace("T", " ")}: {auto.lastError.reason}</span>}
            </span>
          )}
        </p>
        {lastPark ? (
          (() => {
            const u = parkingUse(lastPark);
            return (
              <p className="num text-sm">
                마지막 기록 <b>{lastPark.time}</b> · 전체 {num(lastPark.total)}면 · 가능 {num(lastPark.available)} · 사용 중 <b>{num(u.used)}</b> · 점유율 <b>{u.rate === null ? "–" : `${u.rate}%`}</b>
                <span className="text-xs text-stone-500"> · {lastPark.status ? `포털 표시 ${lastPark.status} · ` : ""}출처 기준 시각 {lastPark.sourceTime ?? "미제공"} · {lastPark.method}</span>
                {lastAge !== null && lastAge > 60 && <span className="ml-1 text-xs font-semibold text-amber-800">· {lastAge}분 전 값 — 지금은 다를 수 있어요</span>}
              </p>
            );
          })()
        ) : (
          <p className="text-sm text-stone-500">{isToday ? "오늘 주차 기록이 아직 없어요." : "이날 주차 기록이 없어요."}</p>
        )}
        <div className="grid gap-2 sm:grid-cols-5">
          <label className="text-xs text-stone-600">
            본 시각
            <input className="field num mt-1" type="time" value={pTime} onChange={(e) => setPTime(e.target.value)} />
          </label>
          <label className="text-xs text-stone-600">
            전체 면수
            <IntInput label="전체 면수" value={pTotal} onChange={setPTotal} placeholder="화면 값" />
          </label>
          <label className="text-xs text-stone-600">
            주차 가능 대수
            <IntInput label="주차 가능 대수" value={pAvail} onChange={setPAvail} placeholder="화면 값" />
          </label>
          <label className="text-xs text-stone-600">
            출처 기준 시각 (있으면)
            <input className="field num mt-1" type="time" value={pSource} onChange={(e) => setPSource(e.target.value)} aria-label="출처 기준 시각" />
          </label>
          <div className="flex items-end">
            <button type="button" className="btn-primary w-full" onClick={() => void addParking()}>
              주차 기록
            </button>
          </div>
        </div>
        <input className="field text-sm" placeholder="메모 (선택) — 예: 포털이 안 열려 직접 보고 옴" value={pNote} onChange={(e) => setPNote(e.target.value)} />
        {dayParking.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] text-sm">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="py-1">시각</th>
                  <th className="text-right">가능/전체</th>
                  <th className="text-right">사용 중</th>
                  <th className="text-right">점유율</th>
                  <th className="pl-2">방식 · 출처 기준</th>
                  <th />
                </tr>
              </thead>
              <tbody className="num divide-y divide-stone-100">
                {dayParking.map((p) => {
                  const u = parkingUse(p);
                  return (
                    <tr key={p.id}>
                      <td className="py-1">{p.time}</td>
                      <td className="text-right">
                        {num(p.available)}/{num(p.total)}
                      </td>
                      <td className="text-right">{num(u.used)}</td>
                      <td className="text-right">{u.rate === null ? "–" : `${u.rate}%`}</td>
                      <td className="pl-2 text-xs text-stone-500">
                        {p.method}
                        {p.status ? ` (${p.status})` : ""} · {p.sourceTime ?? "미제공"}
                        {p.note ? ` · ${p.note}` : ""}
                      </td>
                      <td className="text-right">
                        <button type="button" className="text-xs text-stone-400 underline" onClick={() => void removeParking(p.id)}>
                          지우기
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* B. 짧은 장사 일지 */}
      <div ref={journalFormRef} className={`space-y-2 rounded-xl p-3 ${draft.id ? "bg-amber-50 ring-2 ring-amber-300" : "bg-stone-50"}`}>
        <p className="text-sm font-semibold">
          B. 짧은 장사 일지 <span className="text-xs font-normal text-stone-500">하루에 여러 번 · 처음엔 18·20·22시를 제안해요(정해진 시각은 아니에요)</span>
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-stone-600">
            시각
            <input className="field num mt-1 w-28" type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
          </label>
          {SUGGESTED_TIMES.map((t) => (
            <button key={t} type="button" className="btn-ghost text-xs" onClick={() => setDraft({ ...draft, time: t })}>
              {t}
            </button>
          ))}
          {draft.id && <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900">✏️ {draft.time} 기록을 고치는 중 — 바꾼 뒤 아래 &quot;고친 내용 저장&quot;</span>}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs text-stone-600">
            지금 손님이 앉은 테이블
            <IntInput label="착석 테이블 수" value={draft.seated} onChange={(v) => setDraft({ ...draft, seated: v })} />
          </label>
          <label className="text-xs text-stone-600">
            오늘 연 전체 테이블 <span className="text-stone-400">(빈 테이블 아님 · 아래 설정에서 자동)</span>
            <IntInput label="전체 테이블 수" value={draft.totalTables} onChange={(v) => setDraft({ ...draft, totalTables: v })} placeholder={tableCount === null ? "아래에서 한 번 정해 두기" : String(tableCount)} />
            {draft.seated !== null && draft.totalTables !== null && draft.seated <= draft.totalTables && <span className="num text-stone-500">빈 테이블 {draft.totalTables - draft.seated}개</span>}
          </label>
          <label className="text-xs text-stone-600">
            직전 기록 뒤 들어온 팀 (선택)
            <IntInput label="입장 팀 수" value={draft.teamsIn} onChange={(v) => setDraft({ ...draft, teamsIn: v })} placeholder="안 셌으면 비워 두기" />
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="text-xs text-stone-600">
            거리 체감
            <Chips label="거리 체감" options={FEELS} value={draft.street} onChange={(v) => setDraft({ ...draft, street: v })} />
          </div>
          <div className="text-xs text-stone-600">
            주변 식당 체감 (선택 · 가게 이름은 적지 않아요)
            <Chips label="주변 식당 체감" options={FEELS} value={draft.nearby} onChange={(v) => setDraft({ ...draft, nearby: v })} />
          </div>
        </div>
        <div className="text-xs text-stone-600">
          특이사항
          <div className="mt-1 flex flex-wrap gap-1">
            {TAGS.map((t) => {
              const on = draft.tags.includes(t);
              return (
                <button key={t} type="button" className={`rounded-full px-3 py-1 text-xs ring-1 ${on ? "bg-orange-600 text-white ring-orange-600" : "bg-white text-stone-700 ring-stone-300"}`} onClick={() => setDraft({ ...draft, tags: on ? draft.tags.filter((x) => x !== t) : [...draft.tags, t] })}>
                  {t}
                </button>
              );
            })}
          </div>
        </div>
        <input className="field text-sm" placeholder="메모 — 예: 옆 고깃집도 비어 있음, 비가 그침" value={draft.memo} onChange={(e) => setDraft({ ...draft, memo: e.target.value })} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={() => void saveJournal()}>
            {draft.id ? "고친 내용 저장" : "일지 저장"}
          </button>
          {draft.id && (
            <button type="button" className="btn-ghost" onClick={() => setDraft(emptyDraft(draft.time, tableCount))}>
              고치기 그만
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
          <span>
            테이블: {tableCount === null ? "아직 안 정함" : `이날 ${tableCount}개`}
            {tables?.inside != null && ` (내부 ${tables.inside}${terraceOpen(tables, date) ? ` + 야장 ${tables.outside ?? 0}` : " · 야장 닫음"})`}
          </span>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={terraceOpen(tables, date)} onChange={(e) => void setTerrace(e.target.checked)} disabled={tables?.inside == null} />
            {md(date)} 야장 열었어요
          </label>
          <span className="ml-auto flex items-center gap-1">
            내부
            <input className="field num w-14 py-1" inputMode="numeric" value={inInput ?? ""} onChange={(e) => setInInput(e.target.value.replace(/\D/g, "") === "" ? null : Number(e.target.value.replace(/\D/g, "")))} aria-label="내부 테이블 수" />
            야장
            <input className="field num w-14 py-1" inputMode="numeric" value={outInput ?? ""} onChange={(e) => setOutInput(e.target.value.replace(/\D/g, "") === "" ? null : Number(e.target.value.replace(/\D/g, "")))} aria-label="야장 테이블 수" />
            <button type="button" className="btn-ghost text-xs" onClick={() => void saveTables()}>
              테이블 수 저장
            </button>
          </span>
        </div>
        {dayJournal.length > 0 && (
          <ul className="divide-y divide-stone-200 text-sm">
            {dayJournal.map((j) => (
              <li key={j.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1">
                <span className="num">
                  <b>{j.time}</b> 착석 {j.seated === null ? "–" : j.seated}/{j.totalTables ?? "–"}{j.seated !== null && j.totalTables !== null && j.seated <= j.totalTables ? ` (빈 ${j.totalTables - j.seated})` : ""} · 거리 {j.street ?? "–"} · 주변 {j.nearby ?? "–"}
                  {j.teamsIn !== null && ` · 들어온 팀 ${j.teamsIn}`}
                  {j.tags.length > 0 && <span className="text-xs text-orange-800"> · {j.tags.join("·")}</span>}
                  {j.memo && <span className="text-xs text-stone-500"> · {j.memo}</span>}
                </span>
                <span className="flex gap-2">
                  <button type="button" className="text-xs text-stone-500 underline" onClick={() => startEdit(j)}>
                    고치기
                  </button>
                  <button type="button" className="text-xs text-stone-400 underline" onClick={() => void removeJournal(j.id)}>
                    지우기
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* C. 날짜별 비교 */}
      <div className="space-y-2 rounded-xl bg-stone-50 p-3">
        <p className="text-sm font-semibold">
          C. {md(date)} ({dow(date)}) 시간 흐름 <span className="text-xs font-normal text-stone-500">같은 시각끼리 · 주차는 30분 안의 가장 가까운 기록을 붙이고 차이를 적어요</span>
        </p>
        {timeline.length === 0 ? (
          <p className="text-sm text-stone-500">이날 일지·주차 기록이 없어요. 위에서 기록을 시작하면 여기에 나란히 보여요.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="py-1">시각</th>
                  <th className="text-right">주차 점유</th>
                  <th className="text-right">착석 테이블</th>
                  <th className="pl-3">거리</th>
                  <th>주변 식당</th>
                  <th>특이사항·메모</th>
                </tr>
              </thead>
              <tbody className="num divide-y divide-stone-100">
                {timeline.map((r, i) => {
                  const u = r.parking ? parkingUse(r.parking) : null;
                  return (
                    <tr key={i}>
                      <td className="py-1 font-semibold">{r.time}</td>
                      <td className="text-right">
                        {u ? (u.rate === null ? `${num(u.used)}대` : `${u.rate}% (${num(u.used)}대)`) : "–"}
                        {r.parking && r.journal && r.gap > 0 && <span className="block text-[11px] text-amber-800">주차는 {r.parking.time} 기록 ({r.gap}분 차이)</span>}
                      </td>
                      <td className="text-right">{r.journal ? `${r.journal.seated ?? "–"}/${r.journal.totalTables ?? "–"}` : "–"}</td>
                      <td className="pl-3">{r.journal?.street ?? "–"}</td>
                      <td>{r.journal?.nearby ?? "–"}</td>
                      <td className="text-xs text-stone-600">{r.journal ? [r.journal.tags.join("·"), r.journal.memo].filter(Boolean).join(" · ") || "–" : r.parking?.note || "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="pt-1 text-xs font-semibold text-stone-500">하루 단위 자료 — 그 시각의 관찰이 아니라 나중에 들어오는 하루·한 달 숫자예요</p>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-lg bg-white p-2 ring-1 ring-stone-200">
            <dt className="text-xs text-stone-500">마감 매출 (장부 · 장부 전은 포스 홀+배달)</dt>
            <dd className="num">
              {isToday && !sale ? "영업 중 — 마감 전이라 하루 매출과 비교하지 않아요" : sale ? `${num(sale.total)}원${sale.ledger ? "" : " (지난 매출)"}${isToday ? " · 오늘 입력분" : ""}` : "기록 없음"}
            </dd>
          </div>
          <div className="rounded-lg bg-white p-2 ring-1 ring-stone-200">
            <dt className="text-xs text-stone-500">관광 방문자 (율량·사천동 하루 추정, 관광 데이터랩 KT 내국인)</dt>
            <dd className="num">
              {vDay ? `전체 ${show(vDay.total, "명")} · 현지인 ${show(vDay.local)} · 외지인 ${show(vDay.outsider)}` : !visitors ? "아직 안 가져옴 (아래 D)" : vLast && date > vLast ? `아직 안 올라옴 — 받아 둔 마지막 날 ${vLast}` : "이날 자료 없음"}
            </dd>
          </div>
          <div className="rounded-lg bg-white p-2 ring-1 ring-stone-200">
            <dt className="text-xs text-stone-500">버스 승하차 (청주 정류소별 일별 · 하루 합계)</dt>
            <dd className="num">
              {bDay ? (
                <>
                  동 전체 승차 {num(bDay.dongUp)} · 하차 {num(bDay.dongDown)} / 가게 500m 안 승차 {num(bDay.near500Up)} · 하차 {num(bDay.near500Down)}
                  {stationMedian !== null && bDay.stations < stationMedian / 2 && <span className="block text-xs text-amber-800">이날은 정류장 {bDay.stations}곳만 자료가 있어요(평소 {stationMedian}곳) — 일부만 집계된 날</span>}
                </>
              ) : !bus ? (
                "아직 안 가져옴 (아래 D)"
              ) : bGap.includes(month) ? (
                "이 달 파일이 공식 목록에 없었어요"
              ) : bMonths.length && month > bMonths[bMonths.length - 1] ? (
                `아직 안 올라옴 — 받아 둔 마지막 달 ${bMonths[bMonths.length - 1]} (달마다 올라와요)`
              ) : (
                "이날 자료 없음"
              )}
            </dd>
          </div>
          <div className="rounded-lg bg-white p-2 ring-1 ring-stone-200">
            <dt className="text-xs text-stone-500">{Number(month.slice(5))}월 배경 (소상공인365 · 월 숫자라 이날 값이 아니에요)</dt>
            <dd className="num">
              {rMonth ? (
                <>
                  선택 영역 일평균 유동인구 {show(rMonth.footTraffic, "명")} · 행정동 같은 업종 업소당 월매출 {show(rMonth.sales, "원")} · 업소 {show(rMonth.stores, "곳")}
                </>
              ) : mMonth && (mMonth.footTraffic !== null || mMonth.areaSales !== null) ? (
                <>옮겨 적은 값: 일평균 유동인구 {show(mMonth.footTraffic, "명")} · 월 매출 칸 {show(mMonth.areaSales, "원")}</>
              ) : (
                "이 달 자료 없음 (석 달쯤 늦게 올라와요)"
              )}
            </dd>
          </div>
        </dl>
      </div>

      <NeighborhoodImports center={center} visitors={visitors} bus={bus} onVisitors={setVisitors} onBus={setBus} />
    </section>
  );
}
