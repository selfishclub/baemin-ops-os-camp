// 저장소에서 나는 오류의 종류. 화면은 종류별로 다른 말을 보여 준다.
//  - 손상(damaged): 저장된 글을 읽을 수 없다. 빈 장부와 다르다 — 원본은 그대로 두고 쓰기를 막는다.
//  - 가득(full): 브라우저 저장 공간이 모자라 저장하지 못했다. 원래 값은 그대로다.
//  - 쓰기 실패(write): 그 밖의 이유로 저장하지 못했다.

export class StorageDamagedError extends Error {
  readonly kind = "damaged" as const;
  constructor(public readonly reason: string) {
    super(`저장된 장부를 읽을 수 없어요 (${reason}). 입력이 잠겼어요 — 백업 파일로 복구해 주세요.`);
    this.name = "StorageDamagedError";
  }
}

export class StorageFullError extends Error {
  readonly kind = "full" as const;
  constructor(
    public readonly usedBytes: number,
    public readonly attemptedBytes: number,
    public readonly cause?: unknown,
  ) {
    super(`브라우저 저장 공간이 부족해서 저장하지 못했어요 (지금 ${mb(usedBytes)}, 저장하려던 크기 ${mb(attemptedBytes)}). 백업 파일을 받은 뒤 오래된 달을 정리해 주세요.`);
    this.name = "StorageFullError";
  }
}

export class StorageWriteError extends Error {
  readonly kind = "write" as const;
  constructor(
    public readonly reason: string,
    public readonly cause?: unknown,
  ) {
    super(`저장하지 못했어요 (${reason}). 입력한 내용은 저장되지 않았어요.`);
    this.name = "StorageWriteError";
  }
}

export type StorageError = StorageDamagedError | StorageFullError | StorageWriteError;

export function isStorageError(e: unknown): e is StorageError {
  return e instanceof StorageDamagedError || e instanceof StorageFullError || e instanceof StorageWriteError;
}

// 브라우저마다 "공간 부족" 예외 이름이 다르다 (QuotaExceededError · NS_ERROR_DOM_QUOTA_REACHED · code 22/1014)
export function looksLikeQuotaError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const name = String((e as { name?: unknown }).name ?? "");
  const code = Number((e as { code?: unknown }).code ?? NaN);
  return /quota/i.test(name) || code === 22 || code === 1014;
}

export function mb(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}
