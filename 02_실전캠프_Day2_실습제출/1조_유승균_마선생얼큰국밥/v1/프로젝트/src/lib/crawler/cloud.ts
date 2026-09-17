/** 노트북 ↔ 인터넷 서버(클라우드) 사이의 수집 작업 연동.
 *  노트북 앱은 STUDIO_INGEST_URL 이 있을 때 클라우드에 진행 상황을 보고하고, 대기 중인 수집 요청을 가져갑니다. */

export function cloudBase(): string | null {
  const u = process.env.STUDIO_INGEST_URL?.trim();
  if (!u) return null;
  return u.replace(/\/api\/reviews\/ingest\/?$/, "");
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const t = process.env.INGEST_TOKEN?.trim();
  if (t) h["x-extension-token"] = t;
  return h;
}

export interface CloudReport {
  id?: number | null;
  platform: string;
  status: "running" | "done" | "error" | "stopped";
  log: string[];
  result?: { inserted: number; updated: number; total: number } | null;
  startedAt?: string;
  finishedAt?: string | null;
}

/** 진행 상황 보고. id 가 없으면 클라우드가 새 작업을 만들고 id 를 돌려줍니다 */
export async function reportToCloud(r: CloudReport): Promise<number | null> {
  const base = cloudBase();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/crawl/report`, { method: "POST", headers: headers(), body: JSON.stringify(r), signal: AbortSignal.timeout(15000) });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: number };
    return data.ok && typeof data.id === "number" ? data.id : r.id ?? null;
  } catch (e) {
    console.error("[cloud] 보고 실패:", e instanceof Error ? e.message : e);
    return r.id ?? null;
  }
}

export interface PendingResponse {
  pending: { id: number; platform: string } | null;
  stopIds: number[];
}

export async function fetchPendingFromCloud(): Promise<PendingResponse | null> {
  const base = cloudBase();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/crawl/pending`, { headers: headers(), signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const data = (await res.json()) as PendingResponse & { ok?: boolean };
    return data.ok === false ? null : { pending: data.pending ?? null, stopIds: data.stopIds ?? [] };
  } catch {
    return null;
  }
}
