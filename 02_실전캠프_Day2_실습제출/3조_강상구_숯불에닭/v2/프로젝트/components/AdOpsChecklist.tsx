"use client";

import { useEffect, useState } from "react";
import { SourceTag } from "@/components/SourceTag";
import { AD_OPS_CHECKLIST, AD_OPS_KEY } from "@/lib/market/adOps";
import { getStore } from "@/lib/storage";

// 광고 노트 ⑧ 운영 점검 — 카페스이 사장님이 네이버 광고 강의 기준으로 만든 점검 틀을 숯불에닭에 맞게 옮김.
// 「했어요」를 누르면 그 날짜가 남는다. 다시 누르면 지운다.
export function AdOpsChecklist({ today }: { today: string }) {
  const [done, setDone] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<string | null>(AD_OPS_CHECKLIST[0].area);

  useEffect(() => {
    void getStore()
      .getSetting<Record<string, string>>(AD_OPS_KEY)
      .then((v) => {
        setDone(v ?? {});
        setLoaded(true);
      });
  }, []);

  function toggle(id: string) {
    const next = { ...done };
    if (next[id]) delete next[id];
    else next[id] = today;
    setDone(next);
    void getStore().saveSetting(AD_OPS_KEY, next).catch(() => {});
  }

  if (!loaded) return null;
  const all = AD_OPS_CHECKLIST.flatMap((a) => a.items);
  const doneN = all.filter((i) => done[i.id]).length;

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">
          ⑧ 운영 점검 <SourceTag from="카페스이" />
        </h2>
        <span className="num rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-600">
          끝낸 것 {doneN} / {all.length}
        </span>
      </div>
      <p className="text-sm text-stone-600">광고비를 더 넣기 전에 볼 것들이에요. 한 것은 「했어요」를 눌러 두세요.</p>
      <div className="space-y-2">
        {AD_OPS_CHECKLIST.map((a) => {
          const n = a.items.filter((i) => done[i.id]).length;
          const isOpen = open === a.area;
          return (
            <div key={a.area} className="rounded-xl ring-1 ring-stone-200">
              <button className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold" onClick={() => setOpen(isOpen ? null : a.area)}>
                <span>{a.area}</span>
                <span className="num text-xs font-normal text-stone-500">
                  {n}/{a.items.length} {isOpen ? "▲" : "▼"}
                </span>
              </button>
              {isOpen && (
                <ul className="divide-y divide-stone-100 border-t border-stone-100">
                  {a.items.map((i) => (
                    <li key={i.id} className="flex items-start justify-between gap-3 px-3 py-2">
                      <div className={done[i.id] ? "text-stone-400" : ""}>
                        <p className="text-sm font-semibold">{i.title}</p>
                        <p className="text-xs text-stone-500">{i.how}</p>
                      </div>
                      <button className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold ${done[i.id] ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`} onClick={() => toggle(i.id)}>
                        {done[i.id] ? `했어요 ✓ ${done[i.id].slice(5).replace("-", "/")}` : "했어요"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
