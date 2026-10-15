"use client";

import { useState } from "react";
import { num } from "@/lib/format";

// 순위 바로 재기 — 키워드를 넣으면 리뷰 도우미(npm run helper)가 네이버 플레이스 검색 결과를 읽어 우리 가게가 몇 위인지 알려 준다.
// 공개 검색 페이지를 읽기만 한다. 한 번에 하나, 1분 안팎. 기록은 남기지 않고, "매일 추적에 더하기"를 누르면 아침 순위 기록 대상이 된다.
const HELPER = process.env.NEXT_PUBLIC_HELPER_URL || "http://127.0.0.1:4599";

interface Top { rank: number | null; id: string; name: string; category?: string | null; blog: number | null; visitor: number | null; save?: string | number | null; address?: string | null }
interface RankResult { keyword: string; total: number | null; mine: Top | null; top: Top[]; adNames: string[]; note?: string }

export function RankCheckCard({ tracked }: { tracked: string[] }) {
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{ date: string; time: string; shop: string; r: RankResult } | null>(null);
  const [added, setAdded] = useState<string[]>([]);

  async function check() {
    const k = keyword.trim();
    if (!k) return;
    setBusy(true);
    setMsg("네이버 플레이스에서 찾는 중… (30초~1분)");
    setResult(null);
    try {
      const res = await fetch(`${HELPER}/rank`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keyword: k }) });
      const j = (await res.json()) as { ok: boolean; message?: string; date?: string; time?: string; shop?: string; result?: RankResult | null };
      if (!j.ok || !j.result) {
        setMsg(j.message ?? "순위를 읽지 못했어요.");
        return;
      }
      setResult({ date: j.date ?? "", time: j.time ?? "", shop: j.shop ?? "", r: j.result });
      setMsg(null);
    } catch {
      setMsg("도우미에 연결하지 못했어요. 리뷰 수집기 폴더에서 npm run helper 를 켜 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function track(k: string) {
    try {
      const res = await fetch(`${HELPER}/rank/keywords`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keyword: k }) });
      const j = (await res.json()) as { ok: boolean; message?: string };
      if (j.ok) setAdded((a) => [...a, k]);
      else setMsg(j.message ?? "추가하지 못했어요.");
    } catch {
      setMsg("도우미에 연결하지 못했어요.");
    }
  }

  const r = result?.r;
  const isTracked = (k: string) => tracked.includes(k) || added.includes(k);

  return (
    <section className="card space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">순위 바로 재기</h2>
        <span className="text-xs text-stone-500">궁금한 키워드로 우리 가게가 몇 위인지 · 네이버 플레이스 검색 결과</span>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void check();
        }}
      >
        <input className="field" placeholder="예: 청주 숯불닭갈비, 율량동 회식" value={keyword} onChange={(e) => setKeyword(e.target.value)} disabled={busy} maxLength={30} />
        <button className="btn-primary shrink-0" type="submit" disabled={busy || !keyword.trim()}>
          {busy ? "찾는 중…" : "순위 재기"}
        </button>
      </form>
      {msg && <p className="text-xs text-stone-600">{msg}</p>}
      {r && (
        <div className="rounded-xl bg-stone-50 p-3">
          {r.note ? (
            <p className="text-sm text-amber-800">{r.note}</p>
          ) : (
            <>
              <p className="text-sm">
                <b>"{r.keyword}"</b> — 우리 가게 <b className="num text-lg">{r.mine ? `${r.mine.rank}위` : "50위 밖"}</b>
                {r.total !== null && <span className="num text-xs text-stone-500"> · 검색 결과 {num(r.total)}곳</span>}
                {r.mine && (
                  <span className="num text-xs text-stone-500">
                    {" "}
                    · 방문자 리뷰 {r.mine.visitor ?? "–"} · 블로그 {r.mine.blog ?? "–"}
                  </span>
                )}
                <span className="num ml-1 text-[11px] text-stone-400">
                  {result!.date} {result!.time}
                </span>
              </p>
              <ol className="mt-2 divide-y divide-stone-100 text-sm">
                {r.top.slice(0, 10).map((t, i) => {
                  const mine = !!r.mine && t.id === r.mine.id;
                  return (
                    <li key={t.id || i} className={`flex items-center gap-2 py-1 ${mine ? "rounded bg-orange-50 px-1 font-bold" : ""}`}>
                      <span className="num w-6 text-right text-stone-500">{t.rank ?? i + 1}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {t.name}
                        {mine && " ← 우리"}
                        {t.category && <span className="ml-1 text-xs font-normal text-stone-400">{t.category}</span>}
                      </span>
                      <span className="num text-xs text-stone-500">리뷰 {t.visitor ?? "–"} · 블로그 {t.blog ?? "–"}</span>
                    </li>
                  );
                })}
              </ol>
              {r.adNames.length > 0 && <p className="mt-1 text-xs text-stone-500">광고로 위에 뜬 가게 {r.adNames.length}곳은 순위에서 뺐어요: {r.adNames.join(", ")}</p>}
              <div className="mt-2 flex items-center gap-2">
                {isTracked(r.keyword) ? (
                  <span className="text-xs text-emerald-700">매일 09:00 순위 기록에 들어 있어요</span>
                ) : (
                  <button className="btn-ghost px-3 py-1 text-xs" onClick={() => track(r.keyword)}>
                    이 키워드를 매일 추적에 더하기
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
      <p className="text-xs text-stone-500">한 번에 한 키워드만, 간격을 두고 재 주세요. 네이버가 제한 문구를 보이면 그날은 멈춰요.</p>
    </section>
  );
}
