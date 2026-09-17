"use client";

import { REVENUE_CHANNELS } from "@/lib/accounts";
import type { MonthState } from "@/lib/store";
import type { RevenueLine } from "@/lib/types";
import type { Summary } from "@/lib/summary";
import { Money, pct } from "../ui";

/** 정상 수수료율 범위 — 벗어나면 표시만 한다 (§3 탭2 이상값 경고) */
const band = (account: string): [number, number] =>
  account === "매출-배달" ? [0.2, 0.35] : [0.01, 0.04];

export function RevenueStep({
  state,
  update,
  summary,
}: {
  state: MonthState;
  update: (fn: (s: MonthState) => MonthState) => void;
  summary: Summary;
}) {
  function setLine(channel: string, field: "gross" | "deposit", v: number) {
    update((s) => {
      const def = REVENUE_CHANNELS.find((c) => c.channel === channel)!;
      const exists = s.revenue.some((r) => r.channel === channel);
      const revenue = exists
        ? s.revenue.map((r) => (r.channel === channel ? { ...r, [field]: v } : r))
        : ([...s.revenue, { account: def.account, channel, gross: 0, deposit: 0, [field]: v }] as RevenueLine[]);
      return { ...s, revenue };
    });
  }

  const get = (channel: string) => state.revenue.find((r) => r.channel === channel);
  const t = summary.revenue;

  return (
    <div>
      <div className="scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>채널</th>
              <th>매출액</th>
              <th>입금액</th>
              <th>수수료</th>
              <th>수수료율</th>
            </tr>
          </thead>
          <tbody>
            {REVENUE_CHANNELS.map((c) => {
              const line = get(c.channel);
              const gross = line?.gross ?? 0;
              const deposit = line?.deposit ?? 0;
              const fee = gross - deposit;
              const rate = gross ? fee / gross : 0;
              const [lo, hi] = band(c.account);
              const off = gross > 0 && (rate < lo || rate > hi);
              return (
                <tr key={c.channel}>
                  <td>
                    {c.channel}
                    <span style={{ marginLeft: 7, fontSize: 11, color: "var(--muted)" }}>{c.account}</span>
                  </td>
                  <td>
                    <input
                      type="number"
                      className="inp rt"
                      style={{ width: 132 }}
                      value={gross || ""}
                      placeholder="0"
                      onChange={(e) => setLine(c.channel, "gross", Number(e.target.value) || 0)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="inp rt"
                      style={{ width: 132 }}
                      value={deposit || ""}
                      placeholder="0"
                      onChange={(e) => setLine(c.channel, "deposit", Number(e.target.value) || 0)}
                    />
                  </td>
                  <td className="num">{fee ? <Money v={fee} /> : "—"}</td>
                  <td className="num" style={{ color: off ? "var(--warn)" : "var(--muted)" }}>
                    {gross ? pct(rate) : "—"}
                    {off && " ⚠"}
                    {deposit > gross && <b style={{ color: "var(--danger)" }}> 입금&gt;매출</b>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>합계</td>
              <td><Money v={t.gross} /></td>
              <td><Money v={t.deposit} /></td>
              <td><Money v={t.fee} /></td>
              <td className="num" style={{ color: "var(--muted)" }}>{t.gross ? pct(t.feeRate) : "—"}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="note-line" style={{ marginTop: 11 }}>
        수수료는 <b>매출액 − 입금액</b>으로 계산해 <b>수수료</b> 계정에 자동으로 들어갑니다.
        정상 범위는 홀 1~4%, 배달 20~35%이며 벗어나면 표시만 합니다.
      </p>
    </div>
  );
}
