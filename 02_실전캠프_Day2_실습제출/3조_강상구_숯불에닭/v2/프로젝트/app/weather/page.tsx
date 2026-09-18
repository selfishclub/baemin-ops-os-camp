"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Notice } from "@/components/ui";
import { useWeather } from "@/components/useWeather";
import { todayStr } from "@/lib/daily";
import { num, pctText, won } from "@/lib/format";
import { STORE_LOCATION, expectedSales, KIND_ICON, missingWeatherDates, type WeatherKind } from "@/lib/weather";

const DOW = ["월", "화", "수", "목", "금", "토", "일"];
const KINDS: WeatherKind[] = ["맑음", "흐림", "비", "눈"];
const dow = (d: string) => (new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7;

export default function WeatherPage() {
  const w = useWeather();
  const [note, setNote] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const missing = missingWeatherDates(w.sales, w.weather, todayStr());

  // 열 때 빠진 날씨를 자동으로 채운다 (한 번)
  useEffect(() => {
    if (w.loading || w.fetching || missing.length === 0) return;
    w.fillMissing().then((n) => n && setNote(`${n}일 치 날씨를 받아 왔어요 (${STORE_LOCATION.name}, Open-Meteo)`)).catch((e) => setNote(`날씨를 못 받았어요: ${e instanceof Error ? e.message : e}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.loading, missing.length]);

  if (w.loading) return <p className="py-10 text-center text-sm text-stone-500">불러오는 중…</p>;
  const a = w.analysis;
  const sunny = a.byKind.find((k) => k.kind === "맑음");
  const rainy = a.byKind.find((k) => k.kind === "비");

  return (
    <>
      <section className="card space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold">날씨 × 매출</h2>
          <span className="text-[11px] text-stone-500">{STORE_LOCATION.name} · 매출·날씨 둘 다 있는 날 {a.days}일</span>
        </div>
        <button className="w-full text-left text-[12px] text-sky-800" onClick={() => setHelp((v) => !v)}>
          {help ? "▲" : "?"} 무엇을 보는 화면인가
        </button>
        {help && (
          <div className="rounded-xl bg-sky-50 px-3 py-2 text-[12px] text-sky-950 ring-1 ring-sky-200">
            <ul className="list-disc space-y-0.5 pl-4">
              <li>오늘 탭에 넣은 일별 매출 옆에 그날 날씨(Open-Meteo, 키 없음·무료)를 자동으로 붙여요. 넣을 건 없어요.</li>
              <li>날씨별·요일별 평균 매출과 배달 비율, 인건비율을 비교해요. 4~6주는 쌓여야 믿을 만해요.</li>
              <li>이번 주 예보로 “예상 매출”을 참고값으로 보여 줘요. 준비량·알바 인원은 사장님이 정해요.</li>
            </ul>
          </div>
        )}
        {note && <Notice tone={note.startsWith("날씨를 못") ? "warn" : "ok"}>{note}</Notice>}
        {w.error && <Notice tone="error">{w.error}</Notice>}
        {a.days === 0 && (
          <Notice tone="info">
            아직 비교할 날이 없어요. <Link href="/today" className="font-bold underline">오늘 탭</Link>에서 매출을 넣으면 날씨가 자동으로 붙어요.
          </Notice>
        )}
        {a.days > 0 && a.days < 14 && <Notice tone="info">아직 {a.days}일뿐이라 숫자가 흔들릴 수 있어요. 2주 이상 쌓이면 믿을 만해져요.</Notice>}
      </section>

      {a.days > 0 && (
        <>
          <section className="grid grid-cols-3 gap-2">
            <Stat label="비 오는 날 배달" value={signedPct(a.rainEffect.delivery)} sub="맑은 날 대비" tone={a.rainEffect.delivery === null ? undefined : a.rainEffect.delivery >= 0 ? "good" : "bad"} />
            <Stat label="비 오는 날 홀" value={signedPct(a.rainEffect.hall)} sub="맑은 날 대비" tone={a.rainEffect.hall === null ? undefined : a.rainEffect.hall >= 0 ? "good" : "bad"} />
            <Stat label="비 오는 날 전체" value={signedPct(a.rainEffect.total)} sub={sunny && rainy ? `맑음 ${sunny.days}일 · 비 ${rainy.days}일` : "비교할 날 부족"} />
          </section>

          <section className="card space-y-2">
            <h2 className="text-base font-bold">날씨별 하루 평균</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] text-sm">
                <thead className="text-left text-xs text-stone-500">
                  <tr>
                    <th className="py-1">날씨</th>
                    <th className="text-right">날 수</th>
                    <th className="text-right">전체</th>
                    <th className="text-right">홀</th>
                    <th className="text-right">배달</th>
                    <th className="text-right">배달 비율</th>
                    <th className="text-right">인건비율</th>
                  </tr>
                </thead>
                <tbody className="num divide-y divide-stone-100">
                  {a.byKind.map((k) => (
                    <tr key={k.kind}>
                      <td className="py-1.5 font-semibold">
                        {KIND_ICON[k.kind]} {k.kind}
                      </td>
                      <td className="text-right">{k.days}</td>
                      <td className="text-right font-bold">{num(k.avgSales)}</td>
                      <td className="text-right">{num(k.avgHall)}</td>
                      <td className="text-right">{num(k.avgDelivery)}</td>
                      <td className="text-right">{pctText(k.deliveryShare)}</td>
                      <td className="text-right">{pctText(k.laborRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {a.hot && (
              <p className="num text-xs text-stone-500">
                30℃ 이상이었던 날 {a.hot.days}일 · 하루 평균 {num(a.hot.avgSales)} (전체 평균 {num(a.overallAvg)})
              </p>
            )}
          </section>

          <section className="card space-y-2">
            <h2 className="text-base font-bold">요일 × 날씨 <span className="text-[11px] font-normal text-stone-500">하루 평균 매출 (날 수)</span></h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[26rem] text-xs">
                <thead className="text-stone-500">
                  <tr>
                    <th className="py-1 text-left">요일</th>
                    {KINDS.map((k) => (
                      <th key={k} className="text-right">
                        {KIND_ICON[k]} {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="num divide-y divide-stone-100">
                  {DOW.map((d, i) => (
                    <tr key={d}>
                      <td className="py-1 font-semibold">{d}</td>
                      {KINDS.map((k) => {
                        const c = a.byWeekdayKind[i]?.[k];
                        return (
                          <td key={k} className="text-right">
                            {c ? (
                              <>
                                {num(c.avgSales)} <span className="text-stone-400">({c.days})</span>
                              </>
                            ) : (
                              <span className="text-stone-300">–</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className="card space-y-2">
        <h2 className="text-base font-bold">이번 주 예보와 예상 매출 <span className="text-[11px] font-normal text-stone-500">참고값</span></h2>
        {w.forecast.length === 0 ? (
          <Notice tone="info">예보를 못 받았어요. 인터넷 연결을 확인해 주세요.</Notice>
        ) : (
          <ul className="divide-y divide-stone-100 text-sm">
            {w.forecast.map((f) => {
              const exp = expectedSales(a, f.date, f.kind);
              return (
                <li key={f.date} className="flex items-center justify-between py-1.5">
                  <span>
                    <span className="num">{f.date.slice(5)}</span> {DOW[dow(f.date)]} {KIND_ICON[f.kind]} {f.kind} <span className="num text-xs text-stone-500">{f.tempMin}~{f.tempMax}℃{f.rainMm > 0 && ` · ${f.rainMm}mm`}</span>
                  </span>
                  <span className="num text-right">
                    {exp ? (
                      <>
                        <b>{won(exp.amount)}</b>
                        <span className="block text-[10px] text-stone-400">{exp.basis}</span>
                      </>
                    ) : (
                      <span className="text-stone-400">–</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-[11px] text-stone-500">예상 매출은 같은 요일·같은 날씨의 과거 평균이에요. 준비량과 알바 인원은 이걸 보고 사장님이 정해요. 다음 버전(매장관리자)에서 원육 발주량까지 이어집니다.</p>
      </section>
    </>
  );
}

const signedPct = (n: number | null) => (n === null ? "–" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "good" | "bad" }) {
  return (
    <div className="card">
      <p className="text-[11px] font-semibold text-stone-500">{label}</p>
      <p className={`num mt-1 text-xl font-extrabold ${tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-700" : ""}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-stone-500">{sub}</p>
    </div>
  );
}
