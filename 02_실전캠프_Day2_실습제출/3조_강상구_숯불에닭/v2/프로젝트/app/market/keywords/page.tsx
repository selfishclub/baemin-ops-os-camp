"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SourceTag } from "@/components/SourceTag";
import { useExport } from "@/components/useExport";
import { Notice } from "@/components/ui";
import { todayStr } from "@/lib/daily";
import { num } from "@/lib/format";
import { CORE_TAILS, KEYWORD_NAV_KEY, KEYWORD_VOLUMES_KEY, SLOT_MAX, TYPE_ACTION, buildCombos, compareSlots, draftSlots, mainRegions, menuCoverage, isOurs, normalizeKeyword, opportunities, parseWorkbook, regionGrade, volumeOf, type KeywordNavData, type PlaceType, type RegionGrade, type VolumeMap } from "@/lib/market/keywordNav";
import { EMPTY_PLACE_KEYWORDS, PLACE_KEYWORDS_KEY, keywordSummaries, type PlaceKeywords } from "@/lib/market/rank";
import { getStore } from "@/lib/storage";

const HELPER = process.env.NEXT_PUBLIC_HELPER_URL || "http://127.0.0.1:4599";

// 랜드마크 기본 10종 — 메인 권역 뒤에 붙여 검색수를 재 본다 (교육의 "단위 키워드 + 랜드마크 10종")
const LANDMARK_TYPES = ["핫플", "시청", "구청", "타워", "병원", "사거리", "아파트", "마트", "대학교", "공연장", "쇼핑몰", "터미널", "공항"];

const GRADE_CLS: Record<RegionGrade, string> = { "1등": "bg-emerald-100 text-emerald-800", "2등": "bg-amber-100 text-amber-800", "3등": "bg-stone-100 text-stone-500" };
const TYPE_CLS: Record<PlaceType, string> = { 대표상호: "bg-orange-100 text-orange-800", 손님리뷰: "bg-sky-100 text-sky-800", 한참: "bg-stone-200 text-stone-700", 메뉴: "bg-lime-100 text-lime-800", 기타: "bg-stone-100 text-stone-500" };

function TypeBadge({ type }: { type: PlaceType | null }) {
  if (!type) return <span className="text-[11px] text-stone-400">?</span>;
  return (
    <span title={TYPE_ACTION[type]} className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${TYPE_CLS[type]}`}>
      {type}
    </span>
  );
}

// 키워드 네비게이션 — 교육 엑셀을 올리면 지역 등급 · 조합 · 검색수 · 유형별 할 일 · 5칸 초안이 나온다.
export default function KeywordNavPage() {
  const exp = useExport();
  const today = todayStr();
  const [data, setData] = useState<KeywordNavData | null>(null);
  const [volumes, setVolumes] = useState<VolumeMap>({});
  const [loaded, setLoaded] = useState(false);
  const [pk, setPk] = useState<PlaceKeywords>(EMPTY_PLACE_KEYWORDS);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "error" | "info"; text: string } | null>(null);
  const [helperReady, setHelperReady] = useState<boolean | null>(null); // null = 도우미 연결 안 됨
  const [busy, setBusy] = useState<string | null>(null);
  const [related, setRelated] = useState<{ keyword: string; total: number }[]>([]);
  const [added, setAdded] = useState<string[]>([]);
  const [quick, setQuick] = useState<Record<string, number | null>>({}); // 이 화면에서 바로 잰 순위

  useEffect(() => {
    const store = getStore();
    void Promise.all([store.getSetting<KeywordNavData>(KEYWORD_NAV_KEY), store.getSetting<VolumeMap>(KEYWORD_VOLUMES_KEY), store.getSetting<PlaceKeywords>(PLACE_KEYWORDS_KEY)]).then(([d, v, p]) => {
      setData(d ?? null);
      // 네이버가 덧붙여 준 연관 키워드 가운데 우리 것이 아닌 것(항공권 등)은 걸러 낸다. 내가 직접 물은 것은 그대로 둔다
      const vols = v ?? {};
      const cleaned = d ? Object.fromEntries(Object.entries(vols).filter(([k, e]) => !e.related || isOurs(k, d))) : vols;
      setVolumes(cleaned);
      if (Object.keys(cleaned).length !== Object.keys(vols).length) void store.saveSetting(KEYWORD_VOLUMES_KEY, cleaned).catch(() => {});
      if (p) setPk({ ...EMPTY_PLACE_KEYWORDS, ...p, slots: [...EMPTY_PLACE_KEYWORDS.slots].map((s, i) => p.slots?.[i] ?? s) as PlaceKeywords["slots"] });
      setLoaded(true);
    });
    fetch(`${HELPER}/keyword-volume/status`)
      .then((r) => r.json())
      .then((j: { ready?: boolean }) => setHelperReady(Boolean(j.ready)))
      .catch(() => setHelperReady(null));
  }, []);

  // 추적 기록의 최근 순위 (키워드 → 순위, null = 50위 밖)
  const ranks = useMemo(() => {
    const out: Record<string, number | null> = {};
    if (exp.rank) for (const s of keywordSummaries(exp.rank.history)) if (s.latestDate) out[s.keyword] = s.rank;
    for (const [k, v] of Object.entries(quick)) out[k] = v;
    return out;
  }, [exp.rank, quick]);
  const tracked = useMemo(() => [...(exp.rank?.keywords ?? []), ...added], [exp.rank, added]);
  const isTracked = (k: string) => tracked.some((t) => normalizeKeyword(t) === normalizeKeyword(k));
  const rankOf = (k: string): { measured: boolean; rank: number | null } => {
    const key = Object.keys(ranks).find((r) => normalizeKeyword(r) === normalizeKeyword(k));
    return key === undefined ? { measured: false, rank: null } : { measured: true, rank: ranks[key] };
  };

  // ── 저장 ──
  const saveData = (d: KeywordNavData | null) => {
    setData(d);
    void getStore().saveSetting(KEYWORD_NAV_KEY, d).catch(() => {});
  };
  const saveVolumes = (v: VolumeMap) => {
    setVolumes(v);
    void getStore().saveSetting(KEYWORD_VOLUMES_KEY, v).catch(() => {});
  };

  // ── 엑셀 올리기 ──
  async function onFile(file: File) {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheets: Record<string, unknown[][]> = {};
      for (const n of wb.SheetNames) sheets[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true }) as unknown[][];
      const parsed = parseWorkbook({ sheets }, file.name, today);
      if (!parsed.regions.length && !parsed.nav.length) {
        setMsg({ tone: "error", text: "키워드정리·네비게이션 시트를 찾지 못했어요. 교육에서 만든 엑셀(배민 아카데미 사본)이 맞나요?" });
        return;
      }
      saveData(parsed);
      setMsg({ tone: "ok", text: `읽었어요 — 지역 ${parsed.regions.length}개 · 메뉴 ${parsed.menus.length}개 · TPO ${parsed.tpo.length}개 · 조합 ${parsed.nav.length}개` });
    } catch (e) {
      setMsg({ tone: "error", text: `파일을 읽지 못했어요 (${e instanceof Error ? e.message : e})` });
    }
  }

  // ── 검색수 조회 (도우미 → 네이버 검색광고 키워드 도구) ──
  async function lookup(keywords: string[], label: string) {
    const want = [...new Set(keywords.map(normalizeKeyword).filter(Boolean))].slice(0, 100);
    if (!want.length) return;
    setBusy(label);
    setMsg({ tone: "info", text: `네이버에 ${want.length}개 검색수를 묻는 중… (5개씩, 10초 안팎)` });
    try {
      const res = await fetch(`${HELPER}/keyword-volume`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keywords: want }) });
      const j = (await res.json()) as { ok: boolean; message?: string; ready?: boolean; exact?: { keyword: string; pc: number; mobile: number; total: number; under10: boolean }[]; related?: { keyword: string; total: number; pc: number; mobile: number; under10: boolean }[] };
      if (!j.ok) {
        if (j.ready === false) setHelperReady(false);
        setMsg({ tone: "warn", text: j.message ?? "검색수를 읽지 못했어요." });
        return;
      }
      // 연관 키워드는 우리 지역 말이 든 것만 남긴다 (청주공항을 물으면 항공권 같은 게 섞여 온다)
      const ours = (j.related ?? []).filter((r) => isOurs(r.keyword, data));
      const next: VolumeMap = { ...volumes };
      for (const v of j.exact ?? []) next[v.keyword] = { total: v.total, pc: v.pc, mobile: v.mobile, under10: v.under10, at: today };
      for (const v of ours) if (!next[v.keyword]) next[v.keyword] = { total: v.total, pc: v.pc, mobile: v.mobile, under10: v.under10, at: today, related: true };
      saveVolumes(next);
      setRelated(ours.slice(0, 20).map((r) => ({ keyword: r.keyword, total: r.total })));
      setMsg({ tone: "ok", text: `${j.exact?.length ?? 0}개 검색수를 받았어요${ours.length ? ` · 네이버가 함께 알려준 우리 지역 연관 키워드 ${ours.length}개도 저장` : ""}` });
    } catch {
      setHelperReady(null);
      setMsg({ tone: "error", text: "도우미에 연결하지 못했어요. 리뷰 수집기 폴더에서 npm run helper 를 켜 주세요." });
    } finally {
      setBusy(null);
    }
  }

  async function track(k: string) {
    try {
      const res = await fetch(`${HELPER}/rank/keywords`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keyword: k }) });
      const j = (await res.json()) as { ok: boolean; message?: string };
      if (j.ok) setAdded((a) => [...a, k]);
      else setMsg({ tone: "warn", text: j.message ?? "추가하지 못했어요." });
    } catch {
      setMsg({ tone: "error", text: "도우미에 연결하지 못했어요." });
    }
  }

  async function measure(k: string) {
    setBusy(`rank:${k}`);
    setMsg({ tone: "info", text: `"${k}" 순위를 네이버 플레이스에서 읽는 중… (30초~1분)` });
    try {
      const res = await fetch(`${HELPER}/rank`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keyword: k }) });
      const j = (await res.json()) as { ok: boolean; message?: string; result?: { mine: { rank: number } | null; note?: string } | null };
      if (!j.ok || !j.result) {
        setMsg({ tone: "warn", text: j.message ?? "순위를 읽지 못했어요." });
        return;
      }
      if (j.result.note) {
        setMsg({ tone: "warn", text: j.result.note });
        return;
      }
      const rank = j.result.mine?.rank ?? null;
      setQuick((q) => ({ ...q, [k]: rank }));
      setMsg({ tone: "ok", text: `"${k}" — ${rank === null ? "50위 밖" : `${rank}위`}` });
    } catch {
      setMsg({ tone: "error", text: "도우미에 연결하지 못했어요." });
    } finally {
      setBusy(null);
    }
  }

  // ── 조합기 상태 ──
  const [pickedRegions, setPickedRegions] = useState<string[] | null>(null);
  const [pickedTails, setPickedTails] = useState<string[]>([...CORE_TAILS]);
  const [customRegion, setCustomRegion] = useState("");
  const [customTail, setCustomTail] = useState("");
  const [showAllRegions, setShowAllRegions] = useState(false);
  const [moreChips, setMoreChips] = useState<{ region: boolean; tail: boolean }>({ region: false, tail: false });

  const mains = useMemo(() => (data ? mainRegions(data.regions) : []), [data]);
  const regionsSorted = useMemo(() => (data ? [...data.regions].sort((a, b) => (b.foodVolume ?? -1) - (a.foodVolume ?? -1)) : []), [data]);
  const usableRegions = useMemo(() => regionsSorted.filter((r) => regionGrade(r.foodVolume) !== "3등"), [regionsSorted]);
  const regionPick = pickedRegions ?? mains.map((r) => r.keyword);
  const combos = useMemo(() => {
    if (!data) return [];
    const regs = [...data.regions.filter((r) => regionPick.includes(r.keyword)), ...regionPick.filter((k) => !data.regions.some((r) => r.keyword === k)).map((k) => ({ keyword: k, kind: "주소" as const, volume: null, foodVolume: 1000 }))];
    return buildCombos(regs, pickedTails, data.menus.slice(0, 5).map((m) => m.keyword));
  }, [data, regionPick, pickedTails]);
  const comboRows = useMemo(
    () =>
      combos
        .map((c) => ({ ...c, volume: volumeOf(c.keyword, data, volumes), type: data?.nav.find((n) => normalizeKeyword(n.keyword) === c.keyword)?.type ?? null, ...rankOf(c.keyword) }))
        .sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [combos, data, volumes, ranks],
  );
  const unknownCombos = comboRows.filter((c) => c.volume === null).map((c) => c.keyword);

  // ── 인사이트 ──
  const coverage = useMemo(() => (data ? menuCoverage(data, volumes, ranks) : []), [data, volumes, ranks]);
  const opps = useMemo(() => (data ? opportunities(data, volumes, ranks, tracked, { limit: 20 }) : []), [data, volumes, ranks, tracked]);
  const draft = useMemo(() => (data ? draftSlots(data, volumes, { shopName: exp.rank?.shop ?? "" }) : null), [data, volumes, exp.rank]);
  const diff = useMemo(() => (draft && data ? compareSlots(pk.slots, draft, [...data.regions.map((r) => r.keyword), ...data.brandWords.map((b) => b.input), ...data.tpo]) : null), [draft, data, pk.slots]);
  const landmarkKeys = useMemo(() => (mains[0] ? LANDMARK_TYPES.map((t) => normalizeKeyword(mains[0].keyword) + t) : []), [mains]);

  const applyDraft = () => {
    if (!draft) return;
    if (!window.confirm("상권 탭의 대표 키워드 5칸(장부 안 메모)을 이 초안으로 바꿀까요? 네이버 스마트플레이스는 바뀌지 않아요 — 거기서는 사장님이 직접 바꿉니다.")) return;
    const next = { ...pk, slots: draft.slots.slice(0, 5) as PlaceKeywords["slots"] };
    setPk(next);
    void getStore().saveSetting(PLACE_KEYWORDS_KEY, next).catch(() => {});
    setMsg({ tone: "ok", text: "상권 탭 5칸 메모에 넣었어요. 스마트플레이스에서 바꾼 뒤 1~2주 뒤 순위를 다시 재 보세요." });
  };

  if (!loaded || !exp.loaded) return <p className="py-10 text-center text-sm text-stone-500">불러오는 중…</p>;

  const navWithVolume = data?.nav.filter((n) => (n.volume ?? 0) > 0).length ?? 0;

  return (
    <>
      <section className="card space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">
            키워드 네비게이션
            <SourceTag from="배민아카데미" />
          </h2>
          <Link href="/market" className="text-xs font-semibold text-orange-700 underline">
            ← 상권 탭
          </Link>
        </div>
        <p className="text-sm text-stone-600">
          교육에서 만든 키워드 엑셀을 올리면 <b>지역 등급(1등·2등)</b> → <b>지역 × 메뉴·TPO 조합</b> → <b>검색수·순위</b> → <b>유형별 할 일</b> → <b>대표 키워드 5칸 초안</b>이 나와요. 검색수는 네이버 검색광고 키워드 도구(무료)로 도우미가 읽어 옵니다 — 마피아넷이 보여 주는 숫자와 같은 출처예요.
        </p>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      </section>

      {/* 자료 */}
      <section className="card space-y-2">
        <h2 className="text-base font-bold">① 자료</h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="btn-primary cursor-pointer">
            {data ? "엑셀 다시 올리기" : "교육 엑셀 올리기 (.xlsx)"}
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
          </label>
          {data && (
            <>
              <span className="num text-xs text-stone-600">
                {data.fileName} · {data.uploadedAt} · 지역 {data.regions.length} · 메뉴 {data.menus.length} · TPO {data.tpo.length} · 조합 {num(data.nav.length)} (검색수 있는 것 {num(navWithVolume)})
              </span>
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => window.confirm("올린 엑셀 자료를 지울까요? (조회한 검색수는 남아요)") && saveData(null)}>
                지우기
              </button>
            </>
          )}
        </div>
        <p className="text-xs text-stone-500">
          검색수 조회: {helperReady === null ? <span className="text-stone-500">도우미가 꺼져 있어요 (리뷰 수집기 폴더에서 npm run helper)</span> : helperReady ? <span className="text-emerald-700">도우미에 네이버 검색광고 키가 있어요 — 바로 물어볼 수 있어요</span> : <span className="text-amber-800">도우미 .env.local 에 NAVER_AD_CUSTOMER_ID · NAVER_AD_API_KEY · NAVER_AD_SECRET 을 넣어 주세요 (searchad.naver.com → 도구 → API 사용 관리, 무료)</span>}
          {Object.keys(volumes).length > 0 && <span className="num"> · 조회해 둔 검색수 {num(Object.keys(volumes).length)}개</span>}
        </p>
        {!data && <Notice tone="info">엑셀이 없어도 아래 조합기에서 지역·꼬리를 직접 적어 검색수를 물어볼 수 있어요. 다만 등급 판정·유형(대표상호/손님리뷰)은 엑셀 자료가 있어야 보여요.</Notice>}
      </section>

      {/* 지역 등급 */}
      {data && regionsSorted.length > 0 && (
        <section className="card space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold">② 지역 키워드 등급</h2>
            <span className="text-xs text-stone-500">지역+맛집 월간 검색수 1,000↑ 1등(모든 꼬리와 조합) · 10~999 2등(맛집·식당·핵심 메뉴만) · 그 밖 3등(안 씀)</span>
          </div>
          {mains.length > 0 && (
            <p className="text-sm">
              메인 권역: {mains.map((r) => <b key={r.keyword} className="mr-1.5">{r.keyword}</b>)}
              <span className="text-xs text-stone-500">— 동(율량동)+맛집이 구(청원구)+맛집보다 크면 동이 메인이에요. 중소도시는 시 단위가 기본.</span>
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="py-1">키워드</th>
                  <th>종류</th>
                  <th className="text-right">검색수</th>
                  <th className="text-right">+맛집</th>
                  <th className="text-center">등급</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {(showAllRegions ? regionsSorted : regionsSorted.slice(0, 15)).map((r) => {
                  const g = regionGrade(r.foodVolume);
                  return (
                    <tr key={r.keyword} className={g === "3등" ? "text-stone-400" : ""}>
                      <td className="py-1 font-semibold">{r.keyword}</td>
                      <td className="text-xs">{r.kind}</td>
                      <td className="num text-right">{r.volume === null ? "–" : num(r.volume)}</td>
                      <td className="num text-right">{r.foodVolume === null ? "–" : num(r.foodVolume)}</td>
                      <td className="text-center">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${GRADE_CLS[g]}`}>{g}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {regionsSorted.length > 15 && (
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setShowAllRegions((v) => !v)}>
              {showAllRegions ? "접기" : `${regionsSorted.length - 15}개 더 보기`}
            </button>
          )}
        </section>
      )}

      {/* 조합기 */}
      <section className="card space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">③ 조합기 — 지역 × 꼬리</h2>
          <span className="text-xs text-stone-500">마피아넷 조합기와 같은 일. 검색수 모르는 조합은 도우미가 네이버에 물어봐요</span>
        </div>
        <div>
          <p className="text-xs font-semibold text-stone-500">지역 (1등·2등만)</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {(moreChips.region ? usableRegions : usableRegions.filter((r, i) => regionGrade(r.foodVolume) === "1등" || i < 16 || regionPick.includes(r.keyword))).map((r) => {
              const on = regionPick.includes(r.keyword);
              const g = regionGrade(r.foodVolume);
              return (
                <button key={r.keyword} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${on ? "bg-orange-600 text-white ring-orange-600" : "bg-white text-stone-700 ring-stone-200"}`} onClick={() => setPickedRegions(on ? regionPick.filter((k) => k !== r.keyword) : [...regionPick, r.keyword])}>
                  {r.keyword} <span className={`ml-0.5 ${on ? "text-orange-100" : "text-stone-400"}`}>{g}</span>
                </button>
              );
            })}
            {usableRegions.length > 16 && (
              <button className="rounded-full px-2.5 py-1 text-xs text-stone-500 underline" onClick={() => setMoreChips((m) => ({ ...m, region: !m.region }))}>
                {moreChips.region ? "접기" : "2등 더 보기"}
              </button>
            )}
            {regionPick.filter((k) => !data?.regions.some((r) => r.keyword === k)).map((k) => (
              <button key={k} className="rounded-full bg-orange-600 px-2.5 py-1 text-xs font-semibold text-white ring-1 ring-orange-600" onClick={() => setPickedRegions(regionPick.filter((x) => x !== k))}>
                {k} ×
              </button>
            ))}
            <form
              className="flex gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                const k = normalizeKeyword(customRegion);
                if (k && !regionPick.includes(k)) setPickedRegions([...regionPick, k]);
                setCustomRegion("");
              }}
            >
              <input className="field w-28 px-2 py-1 text-xs" placeholder="직접 추가" value={customRegion} onChange={(e) => setCustomRegion(e.target.value)} maxLength={15} />
            </form>
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-stone-500">꼬리 — 강한 꼬리 · 메뉴 · TPO</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {[...CORE_TAILS, ...(data?.menus.map((m) => m.keyword) ?? []), ...(data?.tpo ?? []), ...pickedTails.filter((t) => !CORE_TAILS.includes(t) && !data?.menus.some((m) => m.keyword === t) && !data?.tpo.includes(t))]
              .filter((t, i, arr) => arr.indexOf(t) === i)
              .filter((t, i) => moreChips.tail || i < 40 || pickedTails.includes(t))
              .map((t) => {
                const on = pickedTails.includes(t);
                const kind = CORE_TAILS.includes(t) ? "" : data?.menus.some((m) => m.keyword === t) ? "메뉴" : data?.tpo.includes(t) ? "TPO" : "";
                return (
                  <button key={t} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${on ? "bg-stone-800 text-white ring-stone-800" : "bg-white text-stone-700 ring-stone-200"}`} onClick={() => setPickedTails(on ? pickedTails.filter((x) => x !== t) : [...pickedTails, t])}>
                    {t}
                    {kind && <span className={`ml-0.5 text-[10px] ${on ? "text-stone-300" : "text-stone-400"}`}>{kind}</span>}
                  </button>
                );
              })}
            {(data?.tpo.length ?? 0) + (data?.menus.length ?? 0) > 36 && (
              <button className="rounded-full px-2.5 py-1 text-xs text-stone-500 underline" onClick={() => setMoreChips((m) => ({ ...m, tail: !m.tail }))}>
                {moreChips.tail ? "접기" : "TPO 전부 보기"}
              </button>
            )}
            <form
              className="flex gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                const t = normalizeKeyword(customTail);
                if (t && !pickedTails.includes(t)) setPickedTails([...pickedTails, t]);
                setCustomTail("");
              }}
            >
              <input className="field w-28 px-2 py-1 text-xs" placeholder="직접 추가" value={customTail} onChange={(e) => setCustomTail(e.target.value)} maxLength={15} />
            </form>
          </div>
        </div>
        {comboRows.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
              <span className="num">조합 {comboRows.length}개 · 검색수 모르는 것 {unknownCombos.length}개</span>
              {unknownCombos.length > 0 && (
                <button className="btn-primary px-3 py-1 text-xs" disabled={busy !== null} onClick={() => void lookup(unknownCombos, "combos")}>
                  {busy === "combos" ? "묻는 중…" : `검색수 조회 (${Math.min(unknownCombos.length, 100)}개)`}
                </button>
              )}
              <button className="btn-ghost px-3 py-1 text-xs" disabled={busy !== null} onClick={() => void lookup(comboRows.map((c) => c.keyword), "combos-all")}>
                {busy === "combos-all" ? "묻는 중…" : "전부 다시 조회"}
              </button>
            </div>
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white text-left text-xs text-stone-500">
                  <tr>
                    <th className="py-1">키워드</th>
                    <th className="text-right">월간 검색수</th>
                    <th className="text-center">유형</th>
                    <th className="text-right">우리 순위</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {comboRows.map((c) => (
                    <tr key={c.keyword} className={c.volume === 0 ? "text-stone-400" : ""}>
                      <td className="py-1 font-semibold">
                        {c.keyword} <span className="text-[10px] font-normal text-stone-400">{c.grade}</span>
                      </td>
                      <td className="num text-right">{c.volume === null ? <span className="text-stone-300">?</span> : num(c.volume)}</td>
                      <td className="text-center">
                        <TypeBadge type={c.type} />
                      </td>
                      <td className="num text-right">{c.measured ? (c.rank === null ? "밖" : `${c.rank}위`) : <span className="text-stone-300">–</span>}</td>
                      <td className="text-right">
                        {(c.volume ?? 0) >= 10 && (
                          <span className="inline-flex gap-1">
                            <button className="btn-ghost px-2 py-0.5 text-[11px]" disabled={busy !== null} onClick={() => void measure(c.keyword)}>
                              {busy === `rank:${c.keyword}` ? "재는 중" : "순위 재기"}
                            </button>
                            {isTracked(c.keyword) ? <span className="text-[11px] text-emerald-700">추적 중</span> : <button className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => void track(c.keyword)}>추적</button>}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {related.length > 0 && (
          <div className="rounded-xl bg-stone-50 p-3">
            <p className="text-xs font-semibold text-stone-500">네이버가 함께 알려준 연관 키워드 (검색수 큰 순) — 손님이 실제로 치는 말이에요</p>
            <p className="num mt-1 text-sm">{related.map((r) => `${r.keyword} ${num(r.total)}`).join(" · ")}</p>
          </div>
        )}
        {landmarkKeys.length > 0 && (
          <div className="rounded-xl bg-stone-50 p-3">
            <p className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-stone-500">
              랜드마크 10종 — "{mains[0].keyword}" 뒤에 붙여 검색수를 재 보면 동네 사람들이 부르는 큰 장소가 나와요
              <button className="btn-ghost px-2 py-0.5 text-[11px]" disabled={busy !== null} onClick={() => void lookup(landmarkKeys, "landmark")}>
                {busy === "landmark" ? "묻는 중…" : "검색수 조회"}
              </button>
            </p>
            <p className="num mt-1 text-sm">{landmarkKeys.map((k) => `${k} ${volumeOf(k, data, volumes) === null ? "?" : num(volumeOf(k, data, volumes)!)}`).join(" · ")}</p>
            <p className="mt-1 text-[11px] text-stone-500">검색수가 나오면 네이버 지도에서 그 말로 검색해 실제 장소 이름(예: 홈플러스율량점·청주대)을 찾고, 같은 장소의 다른 이름(약칭·역명)까지 검색수를 합쳐 보세요. 0~9건은 버려요.</p>
          </div>
        )}
      </section>

      {/* 인사이트 */}
      {data && (
        <section className="card space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold">④ 인사이트 — 어디부터 잡을까</h2>
            <span className="text-xs text-stone-500">장악 순서: 메뉴(이미 먹을 걸 정한 손님) → TPO → 맛집</span>
          </div>
          <div>
            <p className="text-sm font-semibold">메뉴 키워드 장악 현황 <span className="text-xs font-normal text-stone-500">메인 권역 + 메뉴, 검색수 50↑</span></p>
            {coverage.length === 0 ? (
              <p className="text-xs text-stone-500">검색수 있는 메뉴 조합이 아직 없어요. 조합기에서 메뉴 꼬리를 골라 검색수를 조회해 보세요.</p>
            ) : (
              <ul className="mt-1 grid gap-1.5 sm:grid-cols-2">
                {coverage.slice(0, 12).map((c) => {
                  const good = c.measured && c.rank !== null && c.rank <= 5;
                  return (
                    <li key={c.keyword} className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm ring-1 ${good ? "bg-emerald-50 ring-emerald-200" : c.measured ? "bg-amber-50 ring-amber-200" : "bg-stone-50 ring-stone-200"}`}>
                      <span>
                        <b>{c.keyword}</b> <span className="num text-xs text-stone-500">{num(c.volume)}</span>
                      </span>
                      <span className="num flex items-center gap-2 text-xs">
                        {c.measured ? <b>{c.rank === null ? "50위 밖" : `${c.rank}위`}</b> : <span className="text-stone-400">안 재 봄</span>}
                        {!good && (
                          <button className="btn-ghost px-2 py-0.5 text-[11px]" disabled={busy !== null} onClick={() => void measure(c.keyword)}>
                            {busy === `rank:${c.keyword}` ? "재는 중" : "재기"}
                          </button>
                        )}
                        {!isTracked(c.keyword) && (
                          <button className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => void track(c.keyword)}>
                            추적
                          </button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold">기회 키워드 <span className="text-xs font-normal text-stone-500">검색수 100↑인데 5위 안이 아닌 것 · 검색수 큰 순 · 유형을 눌러 보면 할 일</span></p>
            <div className="mt-1 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-stone-500">
                  <tr>
                    <th className="py-1">키워드</th>
                    <th className="text-right">검색수</th>
                    <th className="text-center">유형</th>
                    <th>지금</th>
                    <th>할 일</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {opps.map((o) => (
                    <tr key={o.keyword}>
                      <td className="py-1 font-semibold">{o.keyword}</td>
                      <td className="num text-right">{num(o.volume)}</td>
                      <td className="text-center">
                        <TypeBadge type={o.type} />
                      </td>
                      <td className="num text-xs text-stone-600">{o.reason}</td>
                      <td className="text-xs text-stone-600">{o.guide ?? (o.type ? TYPE_ACTION[o.type] : "상위 가게 5칸·상호를 보고 유형부터 정하기")}</td>
                      <td className="text-right">
                        <span className="inline-flex gap-1">
                          {!o.measured && (
                            <button className="btn-ghost px-2 py-0.5 text-[11px]" disabled={busy !== null} onClick={() => void measure(o.keyword)}>
                              {busy === `rank:${o.keyword}` ? "재는 중" : "재기"}
                            </button>
                          )}
                          {o.tracked ? <span className="text-[11px] text-emerald-700">추적 중</span> : <button className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => void track(o.keyword)}>추적</button>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="grid gap-1.5 text-xs text-stone-600 sm:grid-cols-2">
            {(Object.keys(TYPE_ACTION) as PlaceType[]).filter((t) => t !== "기타").map((t) => (
              <p key={t}>
                <TypeBadge type={t} /> {TYPE_ACTION[t]}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* 5칸 초안 */}
      {data && draft && (
        <section className="card space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold">⑤ 대표 키워드 5칸 초안</h2>
            <span className="text-xs text-stone-500">대표상호 유형 가운데 검색수 큰 말부터, 한 칸 {SLOT_MAX}자 · 상호·주소에 이미 있는 말은 뺌</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {draft.slots.map((s, i) => (
              <div key={i} className="rounded-xl bg-stone-50 px-3 py-2">
                <p className="flex justify-between text-xs text-stone-500">
                  <span>{i + 1}칸</span>
                  <span className="num">{s.length}/{SLOT_MAX}</span>
                </p>
                <p className="mt-0.5 font-bold">{s || <span className="text-stone-300">비어 있음</span>}</p>
              </div>
            ))}
          </div>
          <p className="num text-xs text-stone-600">넣은 말(검색수): {draft.used.map((u) => `${u.word} ${num(u.volume)}`).join(" · ") || "–"}</p>
          {draft.leftover.length > 0 && <p className="num text-xs text-stone-500">자리가 없어 못 넣은 말: {draft.leftover.map((l) => `${l.word} ${num(l.volume)}`).join(" · ")}</p>}
          {diff && (
            <div className="rounded-xl bg-orange-50 p-3 text-sm">
              <p>
                지금 5칸 메모에 <b>없는</b> 말: {diff.missing.length ? diff.missing.map((w) => <b key={w} className="mr-1.5 text-orange-900">{w}</b>) : <span className="text-stone-500">없음 — 다 들어 있어요</span>}
              </p>
              <p className="mt-1">
                지금 5칸에 있지만 검색수 근거가 안 보이는 말: {diff.unknown.length ? diff.unknown.join(" · ") : <span className="text-stone-500">없음</span>}
                <span className="block text-xs text-stone-500">근거가 없다고 틀린 건 아니에요 — 조합기에서 그 말을 꼬리로 넣어 검색수를 재 보세요.</span>
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" onClick={applyDraft}>
              이 초안을 상권 탭 5칸 메모에 넣기
            </button>
            <span className="text-xs text-stone-500">네이버는 안 바뀌어요. 스마트플레이스에서 2~3개씩 바꿔 보고(검수에 걸리면 줄여서) 1~2주 뒤 순위를 재 보세요.</span>
          </div>
          {draft.skipped.length > 0 && (
            <details className="text-xs text-stone-500">
              <summary className="cursor-pointer">안 넣은 말 {draft.skipped.length}개와 이유</summary>
              <p className="mt-1">{draft.skipped.map((s) => `${s.word} (${s.why})`).join(" · ")}</p>
            </details>
          )}
        </section>
      )}
    </>
  );
}
