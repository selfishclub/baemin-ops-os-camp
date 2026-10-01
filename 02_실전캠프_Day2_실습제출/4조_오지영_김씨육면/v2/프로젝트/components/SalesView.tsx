"use client";

import { useMemo, useState } from "react";
import { won } from "@/lib/csv";
import { WEEKDAYS } from "@/lib/daily";
import {
  SALES_CHANNELS,
  buildCalendar,
  channelsIn,
  channelTotals,
  hallVsDelivery,
  monthTotal,
  setSale,
  type DailySale,
  type DayCell,
} from "@/lib/dailySales";
import type { MonthState } from "@/lib/store";
import { parsePayhereXlsx } from "@/lib/parsePayhere";
import { Delta, pct, shortWon } from "./ui";

type Update = (fn: (s: MonthState) => MonthState) => void;

/**
 * 매출 캘린더.
 *
 * 판 날짜로 적는다 — 통장 입금은 정산일이라 날짜가 어긋난다.
 * 페이히어 파일을 올려 채울 자리를 두되, 빠진 날은 손으로 고칠 수 있어야 한다.
 */
export function SalesView({
  state,
  update,
  months,
  loadSales,
}: {
  state: MonthState;
  update: Update;
  /** 저장된 달 — 연간 흐름에 쓴다 */
  months: string[];
  loadSales: (month: string) => DailySale[];
}) {
  const month = state.month;
  const sales = state.dailySales ?? [];
  const [open, setOpen] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const channels = useMemo(() => channelsIn(sales), [sales]);

  async function onFile(file: File) {
    setErr(null);
    setNotes([]);
    setBusy(true);
    try {
      const r = await parsePayhereXlsx(await file.arrayBuffer());
      if (!r.sales.length) {
        setErr("읽을 결제 내역이 없습니다.");
        return;
      }
      const other = r.sales.filter((s) => !s.date.startsWith(month));
      const mine = r.sales.filter((s) => s.date.startsWith(month));
      if (!mine.length) {
        setErr(`이 파일은 ${r.sales[0].date.slice(0, 7)} 내역입니다. 위에서 그 달로 바꾼 뒤 올려 주세요.`);
        return;
      }
      // 같은 날·같은 채널은 파일 값으로 갈아끼운다. 두 번 올려도 늘어나지 않는다.
      update((st) => {
        const keep = (st.dailySales ?? []).filter(
          (s) => !mine.some((x) => x.date === s.date && x.channel === s.channel)
        );
        return { ...st, dailySales: [...keep, ...mine] };
      });
      setNotes([
        `${r.rows}건을 읽어 ${r.days}일치로 넣었습니다 · ${won(r.sum)}`,
        ...r.byChannel.map((c) => `${c.channel} ${c.count}건 ${won(c.amount)}`),
        ...(r.stated !== null
          ? [`파일이 적어둔 합계 ${won(r.stated)} — ${r.stated === r.sum ? "일치합니다" : "다릅니다"}`]
          : []),
        ...(other.length ? [`다른 달 ${other.length}줄은 넣지 않았습니다.`] : []),
        ...r.warnings,
      ]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "파일을 읽지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const weeks = useMemo(() => buildCalendar(month, sales), [month, sales]);
  const totals = channelTotals(month, sales);
  const total = monthTotal(month, sales);
  const { hall, delivery } = hallVsDelivery(month, sales);

  const year = month.slice(0, 4);
  const yearMonths = useMemo(
    () => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`),
    [year]
  );
  const yearRows = useMemo(
    () => yearMonths.map((m) => ({ month: m, amount: monthTotal(m, m === month ? sales : loadSales(m)) })),
    [yearMonths, month, sales, loadSales]
  );
  const yearTotal = yearRows.reduce((a, b) => a + b.amount, 0);
  const filled = yearRows.filter((r) => r.amount > 0);
  const best = [...filled].sort((a, b) => b.amount - a.amount)[0];

  const prevMonth = yearRows[Number(month.slice(5)) - 2]?.amount ?? 0;
  const delta = prevMonth ? ((total - prevMonth) / prevMonth) * 100 : null;
  const maxDay = Math.max(1, ...weeks.flat().map((c) => c.total));

  return (
    <main className="work">
      <div className="phead">
        <div>
          <h1>{`${year}년 ${Number(month.slice(5))}월 매출`}</h1>
          <div className="eyebrow sub">판 날 기준 · 통장 입금일과 다릅니다</div>
        </div>
      </div>

      <section className="bento" style={{ marginBottom: 18 }}>
        <div className="tile">
          <div className="eyebrow">이 달 매출</div>
          <div className="midnum">{won(total)}</div>
          <div><Delta value={delta} /></div>
          <div className="eyebrow" style={{ letterSpacing: ".06em", marginTop: 6 }}>
            {filled.length ? `${year}년 누적 ${shortWon(yearTotal)}` : "아직 적은 날이 없습니다"}
          </div>
        </div>

        <div className="tile">
          <div className="eyebrow">홀</div>
          <div className="midnum">{won(hall)}</div>
          <div className="eyebrow" style={{ letterSpacing: ".06em" }}>
            {total ? `전체의 ${pct(hall / total)}` : "—"}
          </div>
        </div>

        <div className="tile">
          <div className="eyebrow">배달</div>
          <div className="midnum">{won(delivery)}</div>
          <div className="eyebrow" style={{ letterSpacing: ".06em" }}>
            {total ? `전체의 ${pct(delivery / total)}` : "—"}
          </div>
        </div>

        <div className="tile">
          <div className="eyebrow">채널별</div>
          <div className="legend" style={{ marginTop: 8 }}>
            {channels.map((c) => (
              <div className="lg" key={c}>
                {c}
                <span className="v num">{won(totals.get(c) ?? 0)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="tile w4">
          <div className="th">
            <h3>{year}년 월별 매출</h3>
            <div className="sp" />
            <span className="eyebrow" style={{ letterSpacing: ".06em" }}>
              {best ? `가장 많은 달 ${Number(best.month.slice(5))}월 ${shortWon(best.amount)}` : "—"}
            </span>
          </div>
          <div className="yearbars">
            {yearRows.map((r) => {
              const max = Math.max(1, ...yearRows.map((x) => x.amount));
              return (
                <div className={`yb${r.month === month ? " on" : ""}`} key={r.month} title={`${Number(r.month.slice(5))}월 ${won(r.amount)}`}>
                  <div className="bar"><i style={{ height: `${(r.amount / max) * 100}%` }} /></div>
                  <span className="lb">{Number(r.month.slice(5))}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="tile" style={{ padding: 18 }}>
        <div className="th">
          <h3>매출 캘린더</h3>
          <div className="sp" />
          <span className="eyebrow" style={{ letterSpacing: ".06em" }}>
            칸을 누르면 그날 매출을 채널별로 적습니다
          </span>
        </div>

        <div className="cal">
          {WEEKDAYS.map((w, i) => (
            <div className={`calhead${i === 0 ? " sun" : i === 6 ? " sat" : ""}`} key={w}>{w}</div>
          ))}
          {weeks.flat().map((c) =>
            c.outside ? (
              <div className="calcell out" key={c.date} />
            ) : (
              <button
                className={`calcell${open === c.date ? " open" : ""}${c.total ? " has" : ""}`}
                key={c.date}
                onClick={() => setOpen(open === c.date ? null : c.date)}
              >
                <span className={`d${c.weekday === 0 ? " sun" : c.weekday === 6 ? " sat" : ""}`}>{c.day}</span>
                {c.total > 0 && (
                  <>
                    <span className="amt num">{shortWon(c.total)}</span>
                    <span className="bar" style={{ width: `${(c.total / maxDay) * 100}%` }} />
                  </>
                )}
              </button>
            )
          )}
        </div>

        {open && <DayEditor date={open} sales={sales} channels={channels} update={update} onClose={() => setOpen(null)} />}
      </div>

      <div className="okbox" style={{ display: "block", marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <b>페이히어 매출 파일</b>
          <span className="eyebrow" style={{ letterSpacing: ".06em" }}>
            결제 내역 조회(상세) · xlsx
          </span>
          <label className="cta" style={{ marginLeft: "auto", cursor: "pointer" }}>
            {busy ? "읽는 중…" : "파일 올리기"}
            <input
              type="file"
              accept=".xlsx"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <p className="note-line" style={{ marginTop: 10 }}>
          영업일과 배달앱 열을 읽어 홀·배민·쿠팡이츠로 갈라 넣습니다. 같은 날 같은 채널은 파일 값으로
          갈아끼우니 두 번 올려도 늘어나지 않습니다. 빠진 날은 달력에서 손으로 고치시면 됩니다.
        </p>
        {err && <p className="note-line" style={{ color: "var(--danger)", fontWeight: 700 }}>{err}</p>}
        {notes.map((n, i) => (
          <p className="note-line" key={i} style={{ margin: "2px 0" }}>· {n}</p>
        ))}
      </div>
    </main>
  );
}

function DayEditor({
  date,
  sales,
  channels,
  update,
  onClose,
}: {
  date: string;
  sales: DailySale[];
  channels: string[];
  update: Update;
  onClose: () => void;
}) {
  const of = (ch: string) => sales.find((s) => s.date === date && s.channel === ch)?.amount ?? 0;
  const day = Number(date.slice(8));
  const sum = channels.reduce((a, c) => a + of(c), 0);

  return (
    <div className="dayedit">
      <div className="th">
        <h3>{day}일 매출</h3>
        <div className="sp" />
        <b className="num">{won(sum)}</b>
        <button className="tool" onClick={onClose}>닫기</button>
      </div>
      <div className="fields">
        {channels.map((ch) => (
          <label key={ch}>
            <span>{ch}</span>
            <input
              className="inp rt num"
              inputMode="numeric"
              value={of(ch) ? won(of(ch)) : ""}
              placeholder="0"
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  dailySales: setSale(
                    s.dailySales ?? [],
                    date,
                    ch,
                    Number(e.target.value.replace(/[^\d]/g, "")) || 0
                  ),
                }))
              }
            />
          </label>
        ))}
      </div>
    </div>
  );
}
