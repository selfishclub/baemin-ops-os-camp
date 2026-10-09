import { isStorageError, type StorageError } from "./errors";

// 저장 실패를 한곳에서 받는다.
// 저장을 부르는 화면이 40곳 가까이 되고 그중 실패를 받지 않는 곳이 있어서,
// 저장소가 실패할 때마다 여기로 알리고 AppShell 이 모든 화면 위에 빨간 알림을 띄운다.
// 알림에는 크기·종류만 넣고 장부 내용은 절대 넣지 않는다.

export const STORAGE_FAILED_EVENT = "ledger:storage-failed";

export interface StorageFailedDetail {
  kind: StorageError["kind"] | "unknown";
  message: string; // 사장님께 보여 줄 말
  at: string; // ISO 시각
  usedBytes?: number;
  attemptedBytes?: number;
}

type Listener = (d: StorageFailedDetail) => void;
const listeners = new Set<Listener>();

export function onStorageFailure(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function toFailedDetail(e: unknown): StorageFailedDetail {
  const at = new Date().toISOString();
  if (isStorageError(e)) {
    return {
      kind: e.kind,
      message: e.message,
      at,
      usedBytes: e.kind === "full" ? e.usedBytes : undefined,
      attemptedBytes: e.kind === "full" ? e.attemptedBytes : undefined,
    };
  }
  return { kind: "unknown", message: `저장하지 못했어요 (${e instanceof Error ? e.name : "알 수 없는 오류"}). 입력한 내용은 저장되지 않았어요.`, at };
}

// 실패를 알리고, 받은 오류를 그대로 돌려준다 (부른 쪽은 다시 던진다)
export function notifyStorageFailure(e: unknown): StorageFailedDetail {
  const detail = toFailedDetail(e);
  for (const fn of listeners) {
    try {
      fn(detail);
    } catch {}
  }
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
    try {
      window.dispatchEvent(new CustomEvent(STORAGE_FAILED_EVENT, { detail }));
    } catch {}
  }
  return detail;
}
