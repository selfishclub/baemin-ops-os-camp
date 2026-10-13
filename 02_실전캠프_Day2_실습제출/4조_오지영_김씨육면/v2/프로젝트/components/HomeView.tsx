"use client";

import { useMemo } from "react";
import { PERSONAL } from "@/lib/accounts";
import { won } from "@/lib/csv";
import type { MonthState } from "@/lib/store";
import { PersonalStep } from "./steps/Personal";
import { shortWon } from "./ui";

type Update = (fn: (s: MonthState) => MonthState) => void;

/**
 * 권빈이네 — 집 가계.
 *
 * 김씨육면 탭이 "매출 − 비용 = 이익"을 보는 자리라면, 여기는
 * "들어온 돈 − 쓴 돈 = 남은 돈"을 보는 자리다.
 *
 * 가게 카드 전표에 섞여 들어온 개인 지출이 여기로 흘러온다.
 * 복사하는 게 아니라 **같은 거래 하나를 양쪽에서 보는 것**이다 —
 * 여기서 대분류를 바꾸면 그 길로 월 정산 2단계로 돌아간다.
 * 분류는 계속 달라질 것이므로 몇 번이든 오갈 수 있어야 한다.
 */
export function HomeView({
  state,
  update,
  months,
  loadMonthState,
}: {
  state: MonthState;
  update: Update;
  /** 저장된 달 — 누적을 보는 데 쓴다 */
  months: string[];
  loadMonthState: (month: string) => MonthState;
}) {
  const month = state.month;
  const [y, m] = month.split("-");

  const rows = useMemo(
    () => state.transactions.filter((t) => t.group === "personal"),
    [state.transactions]
  );
  const spent = rows.reduce((a, b) => a + b.amount, 0);
  const 미정 = rows.filter((t) => !t.sub);

  /** 가게에서 가져온 생활비 — 입금 내역에서 '지영 생활비'로 가른 것 */
  const fromShop = (state.bankDeposits ?? [])
    .filter((d) => d.kind === "지영 생활비")
    .reduce((a, b) => a + b.amount, 0);

  /** 올해 누적 — 달마다 저장된 것을 모은다 */
  const year = useMemo(() => {
    const same = months.filter((x) => x.startsWith(y));
    let sum = 0;
    let count = 0;
    for (const mm of same) {
      const st = mm === month ? state : loadMonthState(mm);
      for (const t of st.transactions) {
        if (t.group !== "personal") continue;
        sum += t.amount;
        count += 1;
      }
    }
    return { sum, count, months: same.length };
  }, [months, y, month, state, loadMonthState]);

  const bySub = useMemo(() => {
    const by = new Map<string, { amount: number; count: number }>();
    for (const t of rows) {
      const k = t.sub ?? "소분류 미정";
      const cur = by.get(k) ?? { amount: 0, count: 0 };
      cur.amount += t.amount;
      cur.count += 1;
      by.set(k, cur);
    }
    return [...by.entries()]
      .map(([sub, v]) => ({ sub, ...v }))
      .sort((a, b) => b.amount - a.amount);
  }, [rows]);

  return (
    <main className="work">
      <div className="phead">
        <div>
          <h1>{`권빈이네 — ${y}년 ${Number(m)}월`}</h1>
          <div className="eyebrow sub">집 살림 · 가게 손익에는 들어가지 않습니다</div>
        </div>
      </div>

      <section className="bento" style={{ marginBottom: 18 }}>
        <div className="tile">
          <div className="eyebrow">이 달 쓴 돈</div>
          <div className="midnum">{won(spent)}</div>
          <div className="eyebrow" style={{ letterSpacing: ".06em", marginTop: 6 }}>
            {rows.length}건
            {미정.length > 0 && ` · 소분류 미정 ${미정.length}건`}
          </div>
        </div>

        <div className="tile">
          <div className="eyebrow">가게에서 가져온 생활비</div>
          <div className="midnum">{fromShop ? won(fromShop) : "—"}</div>
          <div className="eyebrow" style={{ letterSpacing: ".06em", marginTop: 6 }}>
            {fromShop
              ? `쓴 돈과 차이 ${shortWon(fromShop - spent)}`
              : "월 정산 입금 내역에서 '지영 생활비'로 가르면 여기 뜹니다"}
          </div>
        </div>

        <div className="tile">
          <div className="eyebrow">{y}년 누적</div>
          <div className="midnum">{won(year.sum)}</div>
          <div className="eyebrow" style={{ letterSpacing: ".06em", marginTop: 6 }}>
            {year.months}개월 · {year.count}건
            {year.months > 0 && ` · 월평균 ${shortWon(Math.round(year.sum / year.months))}`}
          </div>
        </div>

        <div className="tile">
          <div className="eyebrow">무엇에 썼나</div>
          <div className="legend" style={{ marginTop: 8 }}>
            {bySub.length === 0 && <span className="note-line">아직 없습니다</span>}
            {bySub.slice(0, 7).map((s) => (
              <div className="lg" key={s.sub}>
                {s.sub}
                <span className="v num">{won(s.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel" style={{ padding: "18px 22px" }}>
        <div className="th">
          <h3>지출</h3>
          <div className="sp" />
          <span className="eyebrow" style={{ letterSpacing: ".06em" }}>
            가게 카드에 섞여 들어온 것도 여기로 옵니다
          </span>
        </div>
        <p className="note-line" style={{ margin: "8px 0 14px" }}>
          대분류를 <b>{PERSONAL}</b>이 아닌 것으로 바꾸면 이 목록에서 빠져 <b>김씨육면 월 정산</b>으로 돌아갑니다.
          반대로 월 정산에서 <b>{PERSONAL}</b>으로 바꾸면 여기로 옵니다. 몇 번이든 오갈 수 있습니다.
        </p>
        <PersonalStep state={state} update={update} />
      </section>
    </main>
  );
}
