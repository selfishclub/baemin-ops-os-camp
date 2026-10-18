"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { Notice } from "@/components/ui";
import { todayStr } from "@/lib/daily";
import { HISTORY_KEY, historyByMonth, mergeHistory, parseOkposDaily, type HistoryDay } from "@/lib/history";
import { getStore } from "@/lib/storage";
import { loadStoreProfile } from "@/lib/storeProfile";
import { fetchPastWeather } from "@/lib/weather";

// 지난 매출 (참고용) — 장부 쓰기 전 포스 「일별종합」 엑셀을 올려 둔다.
// 손익·정산에는 안 들어가고 상권 읽어 주기·해마다 견줘 보기에서만 쓴다.

export function HistorySalesCard({ onSaved }: { onSaved?: () => void }) {
  const [days, setDays] = useState<HistoryDay[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    void getStore()
      .getSetting<HistoryDay[]>(HISTORY_KEY)
      .then((v) => {
        setDays(v ?? []);
        setLoaded(true);
      });
  }, []);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      let all = days;
      const bad: string[] = [];
      let added = 0;
      for (const file of [...files]) {
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
        const got = parseOkposDaily(rows);
        if (!got) bad.push(file.name);
        else {
          all = mergeHistory(all, got);
          added += got.length;
        }
      }
      await getStore().saveSetting(HISTORY_KEY, all);
      setDays(all);
      setMsg({ tone: bad.length ? "error" : "ok", text: `${added}일치를 넣었어요.${bad.length ? ` 일별종합 파일이 아니라 못 읽은 것: ${bad.join(", ")}` : ""}` });
      onSaved?.();
    } catch (e) {
      setMsg({ tone: "error", text: `넣지 못했어요: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  // 지난 매출이 있는 날의 날씨를 받아 둔다 — 비 오는 날 비교가 길어진다
  const fillWeather = async () => {
    setBusy(true);
    try {
      const { location } = await loadStoreProfile();
      if (!location) throw new Error("날씨 지역을 먼저 정해 주세요 (규칙 탭 → 내 가게)");
      const store = getStore();
      const have = new Set((await store.listWeather("2000-01-01", "2100-01-01")).map((w) => w.date));
      const need = days.filter((d) => !have.has(d.date) && d.date < todayStr()).map((d) => d.date);
      if (!need.length) return setMsg({ tone: "info", text: "지난 매출 날의 날씨는 이미 다 있어요." });
      const want = new Set(need);
      const got = (await fetchPastWeather(location, need[0], need[need.length - 1])).filter((w) => want.has(w.date));
      await store.saveWeather(got);
      setMsg({ tone: "ok", text: `${got.length}일치 날씨를 받았어요.` });
      onSaved?.();
    } catch (e) {
      setMsg({ tone: "error", text: `날씨를 받지 못했어요: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return null;
  const months = historyByMonth(days);

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">
          지난 매출 (참고용) <span className="text-xs font-normal text-stone-500">장부 쓰기 전 포스 매출 · 손익에는 안 들어가요</span>
        </h2>
        {days.length > 0 && (
          <span className="num text-xs text-stone-500">
            {days[0].date} ~ {days[days.length - 1].date} · {months.size}개월 · 영업일 {[...months.values()].reduce((a, m) => a + m.days, 0)}일
          </span>
        )}
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <p className="text-sm text-stone-600">
        오케이포스 「일별종합」 엑셀을 올리면 위 「상권 읽어 주기」가 우리 가게 지난 겨울·요일·비 오는 날까지 길게 보고, 아래 「해마다 견줘 보기」의 우리 매출 칸이 채워져요. 포스에는 배달이 안 찍혀서 홀 매출만이에요.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className={`btn-primary cursor-pointer px-3 py-1.5 text-sm ${busy ? "pointer-events-none opacity-50" : ""}`}>
          일별종합 엑셀 올리기 (여러 개 가능)
          <input type="file" accept=".xls,.xlsx" multiple className="hidden" onChange={(e) => void addFiles(e.target.files).finally(() => (e.target.value = ""))} />
        </label>
        {days.length > 0 && (
          <button type="button" className="btn-ghost px-3 py-1.5 text-sm" disabled={busy} onClick={() => void fillWeather()}>
            그날들 날씨 받기
          </button>
        )}
      </div>
    </section>
  );
}
