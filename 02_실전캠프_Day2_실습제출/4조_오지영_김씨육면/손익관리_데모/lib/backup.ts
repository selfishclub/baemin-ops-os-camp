"use client";

/**
 * 전체 내보내기.
 *
 * 분류 결과·학습 규칙·설정은 이 브라우저의 저장소에만 있다. 브라우저를 정리하면 사라지고,
 * 본부로 옮기려 해도 꺼낼 길이 없었다. 저장된 것을 **하나도 고르지 않고** 파일 하나에 담는다.
 *
 * 키를 목록으로 적지 않고 접두(kimssi-)로 모은다 — 나중에 새 키가 생겨도 빠지지 않게.
 * 값은 가공하지 않는다. JSON이면 풀어서 넣고, 아니면 글자 그대로 넣는다.
 */

const PREFIX = "kimssi-";
const MONTH_PREFIX = "kimssi-settlement:";

export interface BackupFile {
  app: "kimssi-profit";
  version: 1;
  exportedAt: string;
  origin: string;
  /** 파일을 열어보지 않고도 무엇이 들었는지 알 수 있게 */
  summary: {
    months: string[];
    transactions: number;
    keys: number;
  };
  /** 저장소 키 → 값. 저장돼 있던 그대로 */
  storage: Record<string, unknown>;
}

export function collectBackup(): BackupFile {
  const storage: Record<string, unknown> = {};
  const months: string[] = [];
  let transactions = 0;

  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key?.startsWith(PREFIX)) continue;
    const raw = window.localStorage.getItem(key) ?? "";
    let value: unknown = raw;
    try {
      value = JSON.parse(raw);
    } catch {
      /* JSON이 아니면 글자 그대로 둔다 (테마·날짜 표시 등) */
    }
    storage[key] = value;

    if (key.startsWith(MONTH_PREFIX)) {
      months.push(key.slice(MONTH_PREFIX.length));
      const txs = (value as { transactions?: unknown[] } | null)?.transactions;
      if (Array.isArray(txs)) transactions += txs.length;
    }
  }

  return {
    app: "kimssi-profit",
    version: 1,
    exportedAt: new Date().toISOString(),
    origin: window.location.origin,
    summary: { months: months.sort(), transactions, keys: Object.keys(storage).length },
    storage,
  };
}

/** 내려받기. 이 컴퓨터의 다운로드 폴더로만 간다 — 어디에도 보내지 않는다 */
export function downloadBackup(): BackupFile {
  const data = collectBackup();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD, 한국 시간
  a.href = url;
  a.download = `kimssi-백업-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return data;
}
