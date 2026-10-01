import raw from "@/config/mappings.json";
import type { MapRule } from "./rules";

/**
 * 검수하며 만든 규칙은 브라우저에만 두면 지우는 순간 날아간다.
 * 파일로 내보내 config/mappings.json에 커밋하고, 앱은 그 파일을 바닥에 깔고 시작한다.
 */
export interface SubRename {
  account: string;
  from: string;
  to: string;
  at: string;
}

export interface SubMemo {
  account: string;
  sub: string;
  memo: string;
}

export interface Mappings {
  version: 1;
  updatedAt: string;
  note?: string;
  rules: MapRule[];
  subRenames: SubRename[];
  subMemos: SubMemo[];
}

export const BASE_MAPPINGS: Mappings = {
  version: 1,
  updatedAt: (raw as { updatedAt?: string }).updatedAt ?? "",
  rules: ((raw as { rules?: MapRule[] }).rules ?? []).map((r) => ({ ...r, origin: "learned" as const })),
  subRenames: (raw as { subRenames?: SubRename[] }).subRenames ?? [],
  subMemos: (raw as { subMemos?: SubMemo[] }).subMemos ?? [],
};

export function mergeMappings(base: Mappings, live: Partial<Mappings>): Mappings {
  const rules = [...(live.rules ?? [])];
  for (const r of base.rules) {
    if (!rules.some((x) => x.keyword === r.keyword)) rules.push(r);
  }
  const renames = [...base.subRenames, ...(live.subRenames ?? [])];
  const memoMap = new Map<string, SubMemo>();
  for (const m of [...base.subMemos, ...(live.subMemos ?? [])]) {
    memoMap.set(`${m.account}/${m.sub}`, m);
  }
  return {
    version: 1,
    updatedAt: new Date().toISOString().slice(0, 10),
    rules,
    subRenames: renames,
    subMemos: [...memoMap.values()],
  };
}

export function downloadMappings(m: Mappings) {
  const blob = new Blob([JSON.stringify(m, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mappings.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
