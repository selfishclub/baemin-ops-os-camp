"use client";

import { useEffect, useMemo, useState } from "react";
import { MoneyInput, Notice } from "@/components/ui";
import { SourceTag } from "@/components/SourceTag";
import { num } from "@/lib/format";
import { AD_BUDGET_KEY, bizmoneyDays, budgetPlan, customerAdLimit, DEFAULT_AD_BUDGET, type AdBudget } from "@/lib/market/adOps";
import type { NaverAdExport } from "@/lib/market/adStats";
import { getStore } from "@/lib/storage";

// 광고 노트 ⑦ 한 달 예산 · 충전금 — 카페스이 광고 노트의 "한 달 15만 원 배분안"과 "충전금 며칠치" 틀.
// 하루 한도는 네이버 광고주센터의 캠페인·묶음에 직접 걸어야 상한을 넘지 않는다. 이 카드는 그 숫자를 맞춰 보는 곳이다.
export function AdBudgetCard({ ad, today }: { ad: NaverAdExport | null; today: string }) {
  const [b, setB] = useState<AdBudget>(DEFAULT_AD_BUDGET);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void getStore()
      .getSetting<AdBudget>(AD_BUDGET_KEY)
      .then((v) => {
        setB({ ...DEFAULT_AD_BUDGET, ...(v ?? {}) });
        setLoaded(true);
      });
  }, []);

  function save(next: AdBudget) {
    setB(next);
    void getStore().saveSetting(AD_BUDGET_KEY, next).catch(() => {});
  }

  const plan = useMemo(() => (ad ? budgetPlan(ad, b.monthCap, today) : null), [ad, b.monthCap, today]);
  const bm = useMemo(() => (ad ? bizmoneyDays(ad, today) : null), [ad, today]);
  const lim = customerAdLimit(b);

  if (!loaded) return null;

  return (
    <section className="card space-y-3">
      <h2 className="text-base font-bold">
        ⑦ 한 달 예산 · 충전금 <SourceTag from="카페스이" />
      </h2>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <MoneyInput label="한 달 광고비 상한 (VAT 포함)" value={b.monthCap} onChange={(v) => save({ ...b, monthCap: v ?? 0 })} />
        </div>
        {bm && (
          <p className={`num rounded-xl px-3 py-2 text-sm ${bm.days !== null && bm.days <= 7 ? "bg-red-50 text-red-900" : bm.days !== null && bm.days <= 16 ? "bg-amber-50 text-amber-900" : "bg-stone-50 text-stone-700"}`}>
            충전금 <b>{num(bm.left)}원</b>
            {bm.days !== null ? ` · 하루 평균 ${num(bm.perDay)}원이면 약 ${bm.days}일치` : " · 아직 쓴 광고비가 없어요"}
          </p>
        )}
      </div>

      {plan ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="py-1">어디에</th>
                  <th className="text-right">하루 한도</th>
                  <th className="text-right">한 달 최대 (31일·VAT)</th>
                  <th className="pl-3">메모</th>
                </tr>
              </thead>
              <tbody className="num divide-y divide-stone-100">
                {plan.rows.map((r) => (
                  <tr key={r.name} className={r.on ? "" : "text-stone-400"}>
                    <td className="py-1 font-semibold">
                      <span className={`mr-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${r.type === "플레이스" ? "bg-[#e3ead9] text-[#45603f]" : "bg-amber-100 text-amber-900"}`}>{r.type}</span>
                      {r.name}
                    </td>
                    <td className="text-right">{r.daily === null ? "없음" : `${num(r.daily)}원`}</td>
                    <td className="text-right">{r.monthMax === null ? "–" : `${num(r.monthMax)}원`}</td>
                    <td className="pl-3 text-xs text-stone-500">{!r.on ? "꺼짐" : r.daily === null ? "하루 한도가 없어요 — 꼭 거세요" : `켜진 묶음 ${r.groupsOn}개`}</td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td className="py-1">합계</td>
                  <td />
                  <td className={`text-right ${plan.over ? "text-red-700" : ""}`}>{num(plan.monthMax)}원</td>
                  <td className="pl-3 text-xs font-normal text-stone-500">지난 30일 실제 광고비 {num(plan.last30)}원</td>
                </tr>
              </tbody>
            </table>
          </div>
          {b.monthCap <= 0 ? (
            <p className="text-sm text-amber-800">위에 한 달 광고비 상한을 넣으면, 하루 한도를 다 썼을 때 넘는지 알려 드려요.</p>
          ) : plan.over ? (
            <Notice tone="warn">
              하루 한도를 끝까지 다 쓰면 한 달 {num(plan.monthMax)}원으로 상한 {num(b.monthCap)}원을 넘어요. 하루 한도 합을 <b>{num(Math.floor(b.monthCap / 31 / 1.1 / 100) * 100)}원</b> 이하로 맞추세요. 한도를 걸면 금액은 안 넘지만 앞 시간에 다 쓰일 수 있어서, 손님 많은 시간대 묶음을 따로 두는 게 좋아요.
            </Notice>
          ) : (
            <p className="text-xs text-stone-500">하루 한도를 다 써도 상한 안이에요. 연말 회식철처럼 검색이 몰리는 달은 한도를 먼저 확인하세요.</p>
          )}
        </>
      ) : (
        <p className="text-sm text-stone-500">네이버 광고 자료를 받으면 캠페인별 하루 한도로 한 달 최대 광고비를 계산해 보여요.</p>
      )}

      {/* 손님 1명당 광고비 한도 */}
      <div className="space-y-2 rounded-xl bg-stone-50 p-3">
        <p className="text-sm font-semibold">손님 1명당 광고비 한도 <span className="text-xs font-normal text-stone-500">손님 1명이 1년 동안 남겨 주는 이익 ÷ 3</span></p>
        <div className="grid gap-2 sm:grid-cols-3">
          <MoneyInput label="한 번에 쓰는 돈 (객단가)" value={b.ticket} allowEmpty onChange={(v) => save({ ...b, ticket: v })} />
          <label className="text-xs text-stone-600">
            1년에 몇 번 오나
            <input className="field num mt-1" inputMode="numeric" value={b.visitsPerYear ?? ""} placeholder="예: 4" onChange={(e) => save({ ...b, visitsPerYear: e.target.value === "" ? null : Math.max(0, Number(e.target.value.replace(/\D/g, ""))) })} />
          </label>
          <label className="text-xs text-stone-600">
            남는 비율 (영업이익률 %)
            <input className="field num mt-1" inputMode="decimal" value={b.marginPct ?? ""} placeholder="손익 탭 참고, 예: 15" onChange={(e) => save({ ...b, marginPct: e.target.value === "" ? null : Math.max(0, Number(e.target.value.replace(/[^\d.]/g, ""))) })} />
          </label>
        </div>
        {lim ? (
          <p className="text-sm">
            손님 1명이 1년에 <b className="num">{num(lim.yearProfit)}원</b>을 남겨 줘요 → 광고로 손님 1명을 데려오는 데 <b className="num">{num(lim.limit)}원</b>까지 써도 돼요.
          </p>
        ) : (
          <p className="text-xs text-stone-500">세 칸을 채우면 계산돼요. 객단가는 테이블 1개 평균 결제액, 영업이익률은 손익 탭의 영업이익 ÷ 매출이에요.</p>
        )}
      </div>
    </section>
  );
}
