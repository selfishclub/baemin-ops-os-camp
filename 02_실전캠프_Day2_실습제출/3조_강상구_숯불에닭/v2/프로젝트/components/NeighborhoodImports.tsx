"use client";

import { useState } from "react";
import { Notice } from "@/components/ui";
import { num } from "@/lib/format";
import {
  BUS_KEY,
  BUS_URL,
  VISITORS_KEY,
  VISITOR_URL,
  mergeBus,
  mergeVisitors,
  missingMonths,
  parseBusCsvTexts,
  parseVisitorCsv,
  unzipCsvTexts,
  type BusStore,
  type VisitorStore,
} from "@/lib/market/neighborhood";
import { getStore } from "@/lib/storage";

// D. 자료 가져오기 — 공식 사이트에서 사장님이 받은 파일만 읽는다(사이트를 대신 긁지 않는다).
//  관광 데이터랩 방문자 CSV, 청주 교통빅데이터 정류소별 일별 승하차 ZIP. 같은 날짜·같은 달을 다시 넣으면 바꿔 넣어 두 번 더해지지 않는다.

export function NeighborhoodImports({
  center,
  visitors,
  bus,
  onVisitors,
  onBus,
}: {
  center: { lat: number; lng: number } | null;
  visitors: VisitorStore | null;
  bus: BusStore | null;
  onVisitors: (v: VisitorStore) => void;
  onBus: (b: BusStore) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ tone: "ok" | "warn" | "error"; text: string }[]>([]);

  async function addVisitorFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const out: typeof log = [];
    let cur = visitors;
    for (const f of Array.from(files)) {
      const p = parseVisitorCsv(await f.text(), f.name);
      if (p.error) {
        out.push({ tone: "error", text: `${f.name}: ${p.error}` });
        continue;
      }
      const m = mergeVisitors(cur, p, f.name, new Date().toISOString());
      try {
        await getStore().saveSetting(VISITORS_KEY, m.store);
        cur = m.store;
        out.push({ tone: p.badRows.length ? "warn" : "ok", text: `${f.name}: 새 날짜 ${m.added}일 · 값이 바뀐 날 ${m.changed}일${p.badRows.length ? ` · 못 읽은 줄 ${p.badRows.length}개(달력에 없는 날짜 등, 다른 날로 옮기지 않고 뺌)` : ""}` });
      } catch (e) {
        out.push({ tone: "error", text: `${f.name}: 저장 실패 — ${e instanceof Error ? e.message : String(e)} (기존 자료는 그대로예요)` });
        break;
      }
    }
    if (cur) onVisitors(cur);
    setLog(out);
    setBusy(false);
  }

  async function addBusFiles(files: FileList | null) {
    if (!files?.length || !center) return;
    setBusy(true);
    const out: typeof log = [];
    let cur = bus;
    for (const f of Array.from(files).sort((a, b) => a.name.localeCompare(b.name))) {
      try {
        const p = parseBusCsvTexts(unzipCsvTexts(new Uint8Array(await f.arrayBuffer())));
        if (p.error) {
          out.push({ tone: "error", text: `${f.name}: ${p.error}` });
          continue;
        }
        const next = mergeBus(cur, p, f.name, new Date().toISOString(), center);
        await getStore().saveSetting(BUS_KEY, next);
        cur = next;
        const bad = Object.entries(p.invalidDates);
        const notes = [bad.length ? `달력에 없는 날짜 ${bad.map(([d, n]) => `${d}(${n}줄)`).join(", ")} 뺌` : "", p.missingCoord ? `좌표 없는 줄 ${p.missingCoord}개(동 합계에만 넣음)` : "", p.duplicates ? `겹친 줄 ${p.duplicates}개 뺌` : ""].filter(Boolean);
        out.push({ tone: notes.length ? "warn" : "ok", text: `${f.name}: ${p.month} · 율량·사천동 ${num(p.rows.length)}줄${notes.length ? ` · ${notes.join(" · ")}` : ""}` });
      } catch (e) {
        out.push({ tone: "error", text: `${f.name}: ${e instanceof Error ? e.message : String(e)} (기존 자료는 그대로예요)` });
      }
    }
    if (cur) onBus(cur);
    setLog(out);
    setBusy(false);
  }

  const vDates = visitors ? Object.keys(visitors.days).sort() : [];
  const bMonths = bus?.months.map((m) => m.month) ?? [];
  const bGap = missingMonths(bMonths);
  const bBad = bus?.months.reduce((t, m) => t + Object.values(m.invalidDates).reduce((a, b) => a + b, 0), 0) ?? 0;
  const near500 = bus ? Object.values(bus.stations).filter((s) => s.dist <= 500).length : 0;

  return (
    <details className="rounded-xl bg-stone-50 p-3">
      <summary className="cursor-pointer text-sm font-semibold">
        D. 자료 가져오기 <span className="text-xs font-normal text-stone-500">공식 사이트에서 받은 파일을 넣어요 · 관광 방문자 {vDates.length ? `${vDates[0]}~${vDates[vDates.length - 1]} ${vDates.length}일` : "없음"} · 버스 {bMonths.length ? `${bMonths[0]}~${bMonths[bMonths.length - 1]} ${bMonths.length}달` : "없음"}</span>
      </summary>
      <div className="mt-3 space-y-3 text-sm">
        <div className="space-y-1">
          <p className="font-semibold">관광 데이터랩 — 율량·사천동 방문자 수 (일간)</p>
          <p className="text-xs text-stone-600">
            <a className="font-semibold text-orange-700 underline" href={VISITOR_URL} target="_blank" rel="noreferrer">
              관광 데이터랩
            </a>
            에서 율량·사천동 / 내국인(KT) / 일간 / 방문자 수 추이를 받아 넣어요. 동 전체의 하루 통신 추정값이라 거리의 실시간 인원이나 영업시간 방문자가 아니에요. 며칠 늦게 올라와요.
          </p>
          <input type="file" accept=".csv,text/csv" multiple disabled={busy} onChange={(e) => void addVisitorFiles(e.target.files).finally(() => (e.target.value = ""))} aria-label="관광 방문자 CSV 넣기" />
          {visitors && (
            <p className="num text-xs text-stone-500">
              {visitors.region} · {vDates.length}일 · 넣은 파일 {visitors.files.map((f) => `${f.name}(${f.from}~${f.to})`).join(", ")}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <p className="font-semibold">청주 교통빅데이터 — 정류소별 일별 승하차 (달마다 ZIP)</p>
          <p className="text-xs text-stone-600">
            <a className="font-semibold text-orange-700 underline" href={BUS_URL} target="_blank" rel="noreferrer">
              자료 다운로드
            </a>
            의 일별 정류소 승하차현황 분석마트 파일을 그대로 넣어요(여러 달 한 번에). 율량·사천동 정류장만 골라 동 전체와 가게 500m·1km 안을 나눠 하루 합계로 저장해요. 시간대별 달 자료를 특정 날 저녁 숫자로 쓰지 않아요.
          </p>
          {center ? (
            <input type="file" accept=".zip,.bin,application/zip" multiple disabled={busy} onChange={(e) => void addBusFiles(e.target.files).finally(() => (e.target.value = ""))} aria-label="버스 승하차 ZIP 넣기" />
          ) : (
            <Notice tone="warn">가게 위치(동네 조사 자료)가 아직 없어 반경을 계산할 수 없어요. 수집 자료를 먼저 받아 주세요.</Notice>
          )}
          {bus && (
            <p className="num text-xs text-stone-500">
              {bMonths.length}달 · {Object.keys(bus.days).length}일 · 가게 500m 안 정류장 {near500}곳(방향별 따로)
              {bGap.length > 0 && ` · 빠진 달 ${bGap.join(", ")}`}
              {bBad > 0 && ` · 달력에 없는 날짜 줄 ${num(bBad)}개 뺌`}
            </p>
          )}
        </div>

        {busy && <p className="text-xs text-stone-500">읽는 중… (버스 파일은 한 달에 몇 초씩 걸려요)</p>}
        {log.map((l, i) => (
          <Notice key={i} tone={l.tone}>
            {l.text}
          </Notice>
        ))}
        <p className="text-xs text-stone-500">소상공인365 월별 자료는 아래 「상권 읽어 주기」 보고서 붙여넣기·「유동인구 옮겨 적기」를 그대로 써요.</p>
      </div>
    </details>
  );
}
