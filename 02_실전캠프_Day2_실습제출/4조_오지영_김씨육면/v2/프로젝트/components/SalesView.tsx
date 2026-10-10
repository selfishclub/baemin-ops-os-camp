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
import { loadMonth, saveMonth, type MonthState } from "@/lib/store";
import { byCategory, groupMenu, isSellable, type MenuGroup, type MenuTotal } from "@/lib/menu";
import { menuNamesOf, renameMenu } from "@/lib/learned";
import { updateLearned, useLearned } from "@/lib/useLearned";
import { parsePayhereXlsx } from "@/lib/parsePayhere";
import { Delta, pct, shortWon } from "./ui";

type Update = (fn: (s: MonthState) => MonthState) => void;

/**
 * 같은 날·같은 채널은 파일 값으로 갈아끼운다.
 * 같은 파일을 두 번 올려도 건수가 늘지 않아야 한다.
 */
function mergeSales(existing: DailySale[], incoming: DailySale[]): DailySale[] {
  const keep = existing.filter((s) => !incoming.some((x) => x.date === s.date && x.channel === s.channel));
  return [...keep, ...incoming];
}

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
  onOtherMonths,
}: {
  state: MonthState;
  update: Update;
  /** 저장된 달 — 연간 흐름에 쓴다 */
  months: string[];
  loadSales: (month: string) => DailySale[];
  /** 이 화면이 다른 달을 건드렸을 때. 월 막대와 연간 합계를 다시 읽게 한다 */
  onOtherMonths?: () => void;
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

      // 파일이 몇 월 건지 읽어 알아서 그 달에 넣는다.
      // 달마다 위에서 바꿔 가며 올리게 하면 깜빡하고 엉뚱한 달에 넣기 쉽다.
      const byMonth = new Map<string, DailySale[]>();
      for (const sale of r.sales) {
        const m = sale.date.slice(0, 7);
        const list = byMonth.get(m);
        if (list) list.push(sale);
        else byMonth.set(m, [sale]);
      }

      const menuByMonth = new Map<string, MenuTotal[]>();
      for (const m of r.menu) {
        const list = menuByMonth.get(m.month);
        const row = { item: m.item, category: m.category, qty: m.qty, amount: m.amount };
        if (list) list.push(row);
        else menuByMonth.set(m.month, [row]);
      }

      const months = [...new Set([...byMonth.keys(), ...menuByMonth.keys()])].sort();
      let touchedOther = false;
      for (const m of months) {
        const rows = byMonth.get(m) ?? [];
        const mrows = menuByMonth.get(m) ?? [];
        // 파일을 다시 올리면 그 달 메뉴는 파일 값으로 통째로 갈아끼운다.
        // 더하면 두 번 올렸을 때 수량이 늘어난다.
        const put = (st: MonthState): MonthState => ({
          ...st,
          dailySales: rows.length ? mergeSales(st.dailySales ?? [], rows) : st.dailySales,
          menu: mrows.length ? mrows : st.menu,
        });
        if (m === month) {
          update(put);
        } else {
          saveMonth(put(loadMonth(m)));
          touchedOther = true;
        }
      }
      if (touchedOther) onOtherMonths?.();

      const sumOf = (rows: DailySale[]) => rows.reduce((a, b) => a + b.amount, 0);
      setNotes([
        `${r.rows}건을 읽어 ${months.length}개 달에 넣었습니다 · ${won(r.sum)}`,
        ...months.map((m) => {
          const rows = byMonth.get(m) ?? [];
          const days = new Set(rows.map((x) => x.date)).size;
          const mn = menuByMonth.get(m)?.length ?? 0;
          return `${Number(m.slice(5))}월 — ${days}일치 · ${won(sumOf(rows))}${mn ? ` · 메뉴 ${mn}종` : ""}`;
        }),
        ...r.byChannel.map((c) => `${c.channel} ${c.count}건 ${won(c.amount)}`),
        ...(r.stated !== null
          ? [`파일이 적어둔 합계 ${won(r.stated)} — ${r.stated === r.sum ? "일치합니다" : "다릅니다"}`]
          : []),
        ...(months.includes(month) ? [] : ["지금 보고 있는 달에는 넣을 것이 없었습니다. 위에서 달을 바꿔 보세요."]),
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

      <MenuPanel menu={state.menu ?? []} month={month} />
    </main>
  );
}

/**
 * 메뉴별 판매.
 *
 * 순위는 **수량**으로 매긴다. 메뉴 금액은 할인 전 정가에 옵션까지 더한 값이라
 * 결제 금액(매출)과 다르다 — 나란히 두면 매출로 오해한다.
 */
function MenuPanel({ menu, month }: { menu: MenuTotal[]; month: string }) {
  const learned = useLearned();
  const names = menuNamesOf(learned);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const groups = useMemo(() => groupMenu(menu, names).filter(isSellable), [menu, names]);
  const cats = useMemo(() => byCategory(groups), [groups]);
  const totalQty = groups.reduce((a, b) => a + b.qty, 0);
  const shown = open ? groups : groups.slice(0, 10);

  if (!menu.length) {
    return (
      <section className="tile" style={{ marginTop: 18 }}>
        <div className="eyebrow">메뉴</div>
        <p className="note-line" style={{ marginTop: 8 }}>
          페이히어 <b>결제 내역 조회(상세)</b> 파일을 올리면 어떤 메뉴가 얼마나 팔렸는지 여기에 나옵니다.
        </p>
      </section>
    );
  }

  return (
    <section className="tile" style={{ marginTop: 18 }}>
      <div className="th">
        <h3>{Number(month.slice(5))}월 메뉴</h3>
        <div className="sp" />
        <span className="eyebrow" style={{ letterSpacing: ".06em" }}>
          {groups.length}종 · {totalQty.toLocaleString("ko-KR")}개
        </span>
      </div>

      <div className="legend" style={{ marginTop: 10, marginBottom: 14 }}>
        {cats.map((c) => (
          <div className="lg" key={c.category}>
            {c.category}
            <span className="v num">
              {c.qty.toLocaleString("ko-KR")}개 · {totalQty ? pct(c.qty / totalQty) : "—"}
            </span>
          </div>
        ))}
      </div>

      <table className="data">
        <thead>
          <tr>
            <th style={{ width: 44 }} />
            <th style={{ textAlign: "left" }}>메뉴</th>
            <th>수량</th>
            <th>비중</th>
            <th>메뉴 금액</th>
            <th style={{ width: 70 }} />
          </tr>
        </thead>
        <tbody>
          {shown.map((g, i) => (
            <tr key={g.name}>
              <td className="num" style={{ color: "var(--muted)" }}>{i + 1}</td>
              <td style={{ textAlign: "left" }}>
                {editing === g.name ? (
                  <MenuRename group={g} onDone={() => setEditing(null)} />
                ) : (
                  <>
                    <b>{g.name}</b>
                    {g.from.length > 1 && (
                      <span className="badge small" title={g.from.join("\n")}>
                        {g.from.length}개 이름 묶음
                      </span>
                    )}
                  </>
                )}
              </td>
              <td className="num"><b>{g.qty.toLocaleString("ko-KR")}</b></td>
              <td className="num" style={{ color: "var(--muted)" }}>{totalQty ? pct(g.qty / totalQty) : "—"}</td>
              <td className="num" style={{ color: "var(--muted)" }}>{won(g.amount)}</td>
              <td>
                {editing !== g.name && (
                  <button className="tool" onClick={() => setEditing(g.name)}>이름</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {groups.length > 10 && (
        <button className="tool" style={{ marginTop: 10 }} onClick={() => setOpen((v) => !v)}>
          {open ? "상위 10개만" : `전부 보기 (${groups.length}종)`}
        </button>
      )}

      <p className="note-line" style={{ marginTop: 12 }}>
        순위는 <b>수량</b> 기준입니다. <b>메뉴 금액</b>은 할인 전 정가에 옵션까지 더한 값이라
        매출(결제 금액)과 다릅니다. 배달앱은 메뉴 이름에 홍보 문구가 붙어 와서 같은 메뉴를 자동으로 묶었습니다 —
        잘못 묶였으면 <b>이름</b>을 눌러 고치시면 됩니다. 원문은 그대로 둡니다.
      </p>
    </section>
  );
}

/** 묶인 원문을 보여주고, 하나씩 어떤 이름으로 볼지 정하게 한다 */
function MenuRename({ group, onDone }: { group: MenuGroup; onDone: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {group.from.map((raw) => (
        <div key={raw} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span className="mn" style={{ flex: 1, minWidth: 0, color: "var(--muted)", fontSize: 12 }} title={raw}>
            {raw}
          </span>
          <input
            className="inp mini"
            style={{ width: 200 }}
            defaultValue={group.name}
            aria-label={`${raw} 묶을 이름`}
            onBlur={(e) => updateLearned((l) => renameMenu(l, raw, e.target.value))}
          />
        </div>
      ))}
      <div>
        <button className="tool save" onClick={onDone}>닫기</button>
      </div>
    </div>
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
