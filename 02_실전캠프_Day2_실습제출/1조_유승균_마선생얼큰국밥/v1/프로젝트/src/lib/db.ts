import { createClient, type Client, type InStatement, type InValue, type Row } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_SQL } from "./schema.mjs";
import {
  SettingsSchema,
  type Category,
  type ContentKind,
  type ContentRow,
  type Platform,
  type Review,
  type ReviewFilter,
  type Sentiment,
  type Settings,
  type WeeklyRow,
  type WeeklySummary,
} from "./types";

/* ---------- 연결: TURSO_DATABASE_URL 이 있으면 클라우드(Turso), 없으면 로컬 파일 ---------- */

const g = globalThis as unknown as { __studioClient?: Client; __studioReady?: Promise<unknown>; __studioKey?: string };

export function dataDir(): string {
  return process.env.STUDIO_DATA_DIR || path.join(process.cwd(), "data");
}

export function isCloudDb(): boolean {
  return Boolean(process.env.TURSO_DATABASE_URL?.trim());
}

function connectionUrl(): string {
  const cloud = process.env.TURSO_DATABASE_URL?.trim();
  if (cloud) return cloud;
  return "file:" + path.join(dataDir(), "studio.db").replace(/\\/g, "/");
}

export async function getDb(): Promise<Client> {
  const url = connectionUrl();
  if (g.__studioClient && g.__studioKey === url) {
    await g.__studioReady;
    return g.__studioClient;
  }
  const cloud = isCloudDb();
  if (!cloud) fs.mkdirSync(dataDir(), { recursive: true });
  const client = createClient(cloud ? { url, authToken: process.env.TURSO_AUTH_TOKEN?.trim() } : { url });
  g.__studioClient = client;
  g.__studioKey = url;
  g.__studioReady = (async () => {
    if (!cloud) await client.execute("PRAGMA journal_mode = WAL").catch(() => {});
    await client.executeMultiple(SCHEMA_SQL);
  })();
  await g.__studioReady;
  return client;
}

type Rec = Record<string, unknown>;
const rec = (r: Row): Rec => r as unknown as Rec;
const num = (v: unknown, d = 0): number => (v === null || v === undefined ? d : Number(v));
const str = (v: unknown, d = ""): string => (v === null || v === undefined ? d : String(v));

async function q(sql: string, args: InValue[] = []) {
  const db = await getDb();
  return db.execute({ sql, args });
}

/* ---------- 리뷰 ---------- */

function rowToReview(r: Rec): Review {
  let categories: Category[] = [];
  try {
    categories = JSON.parse(str(r.categories, "[]"));
  } catch {
    categories = [];
  }
  return {
    id: num(r.id),
    platform: str(r.platform) as Platform,
    external_id: str(r.external_id),
    store_id: str(r.store_id),
    customer_name: str(r.customer_name),
    rating: r.rating === null || r.rating === undefined ? null : Number(r.rating),
    order_count: r.order_count === null || r.order_count === undefined ? null : Number(r.order_count),
    review_date: str(r.review_date),
    review_text: str(r.review_text),
    order_menu: str(r.order_menu),
    delivery_review: str(r.delivery_review),
    has_photo: num(r.has_photo) === 1,
    owner_reply: str(r.owner_reply),
    categories,
    sentiment: str(r.sentiment, "neutral") as Sentiment,
    score: num(r.score),
    bookmarked: num(r.bookmarked) === 1,
    bookmark_note: str(r.bookmark_note),
    source_url: str(r.source_url),
    collected_at: str(r.collected_at),
    created_at: str(r.created_at),
    content_count: num(r.content_count),
  };
}

export interface UpsertReviewInput {
  platform: Platform;
  external_id: string;
  store_id: string;
  customer_name: string;
  rating: number | null;
  order_count: number | null;
  review_date: string;
  review_text: string;
  order_menu: string;
  delivery_review: string;
  has_photo: boolean;
  owner_reply: string;
  categories: Category[];
  sentiment: Sentiment;
  score: number;
  source_url: string;
  raw_json: string;
  collected_at: string;
}

export async function upsertReviews(items: UpsertReviewInput[]): Promise<{ inserted: number; updated: number }> {
  if (!items.length) return { inserted: 0, updated: 0 };
  const db = await getDb();
  const platforms = Array.from(new Set(items.map((i) => i.platform)));
  const existing = new Set<string>();
  for (const p of platforms) {
    const rs = await db.execute({ sql: "SELECT external_id FROM reviews WHERE platform = ?", args: [p] });
    for (const r of rs.rows) existing.add(p + "|" + str(rec(r).external_id));
  }

  const now = new Date().toISOString();
  const stmts: InStatement[] = [];
  let inserted = 0;
  let updated = 0;
  for (const it of items) {
    if (existing.has(it.platform + "|" + it.external_id)) {
      stmts.push({
        sql: `UPDATE reviews SET store_id = ?, customer_name = ?, rating = ?, order_count = ?, review_date = ?,
          review_text = ?, order_menu = ?, delivery_review = ?, has_photo = ?, owner_reply = ?, categories = ?,
          sentiment = ?, score = ?, source_url = ?, raw_json = ?, collected_at = ?
          WHERE platform = ? AND external_id = ?`,
        args: [
          it.store_id, it.customer_name, it.rating, it.order_count, it.review_date,
          it.review_text, it.order_menu, it.delivery_review, it.has_photo ? 1 : 0, it.owner_reply, JSON.stringify(it.categories),
          it.sentiment, it.score, it.source_url, it.raw_json, it.collected_at,
          it.platform, it.external_id,
        ],
      });
      updated++;
    } else {
      stmts.push({
        sql: `INSERT INTO reviews (platform, external_id, store_id, customer_name, rating, order_count, review_date,
          review_text, order_menu, delivery_review, has_photo, owner_reply, categories, sentiment, score,
          source_url, raw_json, collected_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          it.platform, it.external_id, it.store_id, it.customer_name, it.rating, it.order_count, it.review_date,
          it.review_text, it.order_menu, it.delivery_review, it.has_photo ? 1 : 0, it.owner_reply, JSON.stringify(it.categories),
          it.sentiment, it.score, it.source_url, it.raw_json, it.collected_at, now,
        ],
      });
      existing.add(it.platform + "|" + it.external_id);
      inserted++;
    }
  }
  // 원격 DB 왕복을 줄이기 위해 100개씩 묶어서 한 번에 실행
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100), "write");
  return { inserted, updated };
}

const SELECT_REVIEW = `
  SELECT r.*, (SELECT COUNT(*) FROM contents c WHERE c.review_id = r.id) AS content_count
  FROM reviews r`;

export async function listReviews(f: ReviewFilter = {}): Promise<{ items: Review[]; total: number }> {
  const where: string[] = [];
  const params: InValue[] = [];
  if (f.platform) { where.push("r.platform = ?"); params.push(f.platform); }
  if (f.category) { where.push("r.categories LIKE ?"); params.push(`%"${f.category}"%`); }
  if (f.sentiment) { where.push("r.sentiment = ?"); params.push(f.sentiment); }
  if (f.bookmarked) where.push("r.bookmarked = 1");
  if (f.q) { where.push("(r.review_text LIKE ? OR r.order_menu LIKE ? OR r.customer_name LIKE ?)"); params.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`); }
  if (f.from) { where.push("r.review_date >= ?"); params.push(f.from); }
  if (f.to) { where.push("r.review_date <= ?"); params.push(f.to); }
  const w = where.length ? " WHERE " + where.join(" AND ") : "";
  const order = f.sort === "score" ? " ORDER BY r.score DESC, r.review_date DESC" : " ORDER BY r.review_date DESC, r.id DESC";
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 500);
  const offset = Math.max(f.offset ?? 0, 0);

  const db = await getDb();
  const [countRs, rowsRs] = await db.batch(
    [
      { sql: `SELECT COUNT(*) AS n FROM reviews r${w}`, args: params },
      { sql: `${SELECT_REVIEW}${w}${order} LIMIT ? OFFSET ?`, args: [...params, limit, offset] },
    ],
    "read"
  );
  return { items: rowsRs.rows.map((r) => rowToReview(rec(r))), total: num(rec(countRs.rows[0]).n) };
}

/** 플랫폼별 이미 저장된 external_id 목록 (크롤러의 중복 건너뛰기용) */
export async function listExternalIds(platform: Platform): Promise<string[]> {
  const rs = await q("SELECT external_id FROM reviews WHERE platform = ?", [platform]);
  return rs.rows.map((r) => str(rec(r).external_id));
}

export async function getReview(id: number): Promise<Review | null> {
  const rs = await q(`${SELECT_REVIEW} WHERE r.id = ?`, [id]);
  return rs.rows[0] ? rowToReview(rec(rs.rows[0])) : null;
}

export async function getReviewsByIds(ids: number[]): Promise<Review[]> {
  if (!ids.length) return [];
  const rs = await q(`${SELECT_REVIEW} WHERE r.id IN (${ids.map(() => "?").join(",")})`, ids);
  const map = new Map(rs.rows.map((r) => [num(rec(r).id), rowToReview(rec(r))]));
  return ids.map((id) => map.get(id)).filter((x): x is Review => Boolean(x));
}

export async function setBookmark(id: number, bookmarked: boolean, note?: string): Promise<Review | null> {
  if (note === undefined) await q("UPDATE reviews SET bookmarked = ? WHERE id = ?", [bookmarked ? 1 : 0, id]);
  else await q("UPDATE reviews SET bookmarked = ?, bookmark_note = ? WHERE id = ?", [bookmarked ? 1 : 0, note, id]);
  return getReview(id);
}

export async function deleteReview(id: number): Promise<void> {
  const db = await getDb();
  await db.batch(
    [
      { sql: "DELETE FROM contents WHERE review_id = ?", args: [id] },
      { sql: "DELETE FROM reviews WHERE id = ?", args: [id] },
    ],
    "write"
  );
}

export interface Stats {
  total: number;
  thisWeek: number;
  bookmarked: number;
  withContent: number;
  byPlatform: Record<string, number>;
  byCategory: Record<string, number>;
  bySentiment: Record<string, number>;
  lastCollectedAt: string | null;
}

export async function getStats(weekStart: string, weekEnd: string): Promise<Stats> {
  const db = await getDb();
  const [total, thisWeek, bookmarked, withContent, byP, byS, cats, last] = await db.batch(
    [
      "SELECT COUNT(*) n FROM reviews",
      { sql: "SELECT COUNT(*) n FROM reviews WHERE review_date BETWEEN ? AND ?", args: [weekStart, weekEnd] },
      "SELECT COUNT(*) n FROM reviews WHERE bookmarked = 1",
      "SELECT COUNT(DISTINCT review_id) n FROM contents",
      "SELECT platform, COUNT(*) n FROM reviews GROUP BY platform",
      "SELECT sentiment, COUNT(*) n FROM reviews GROUP BY sentiment",
      "SELECT categories FROM reviews",
      "SELECT MAX(collected_at) m FROM reviews",
    ],
    "read"
  );
  const byPlatform: Record<string, number> = {};
  for (const r of byP.rows) byPlatform[str(rec(r).platform)] = num(rec(r).n);
  const bySentiment: Record<string, number> = {};
  for (const r of byS.rows) bySentiment[str(rec(r).sentiment)] = num(rec(r).n);
  const byCategory: Record<string, number> = {};
  for (const r of cats.rows) {
    try {
      for (const c of JSON.parse(str(rec(r).categories, "[]")) as string[]) byCategory[c] = (byCategory[c] || 0) + 1;
    } catch { /* ignore */ }
  }
  const m = rec(last.rows[0]).m;
  return {
    total: num(rec(total.rows[0]).n),
    thisWeek: num(rec(thisWeek.rows[0]).n),
    bookmarked: num(rec(bookmarked.rows[0]).n),
    withContent: num(rec(withContent.rows[0]).n),
    byPlatform,
    byCategory,
    bySentiment,
    lastCollectedAt: m ? String(m) : null,
  };
}

/* ---------- 콘텐츠 ---------- */

function rowToContent(r: Rec): ContentRow {
  return {
    id: num(r.id),
    review_id: num(r.review_id),
    kind: str(r.kind) as ContentKind,
    payload: JSON.parse(str(r.payload, "{}")),
    key_quote: str(r.key_quote),
    model: str(r.model),
    created_at: str(r.created_at),
  };
}

export async function saveContents(reviewId: number, entries: { kind: ContentKind; payload: unknown; key_quote: string; model: string }[]): Promise<ContentRow[]> {
  const db = await getDb();
  const now = new Date().toISOString();
  const results = await db.batch(
    entries.map((e) => ({
      sql: "INSERT INTO contents (review_id, kind, payload, key_quote, model, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: [reviewId, e.kind, JSON.stringify(e.payload), e.key_quote, e.model, now],
    })),
    "write"
  );
  const ids = results.map((r) => Number(r.lastInsertRowid));
  const rs = await q(`SELECT * FROM contents WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY id`, ids);
  return rs.rows.map((r) => rowToContent(rec(r)));
}

export async function listContents(reviewId: number): Promise<ContentRow[]> {
  const rs = await q("SELECT * FROM contents WHERE review_id = ? ORDER BY id DESC", [reviewId]);
  return rs.rows.map((r) => rowToContent(rec(r)));
}

/* ---------- 주간 베스트 ---------- */

function rowToWeekly(r: Rec): WeeklyRow {
  return {
    id: num(r.id),
    week_start: str(r.week_start),
    week_end: str(r.week_end),
    summary: JSON.parse(str(r.summary, "{}")) as WeeklySummary,
    review_count: num(r.review_count),
    model: str(r.model),
    created_at: str(r.created_at),
  };
}

export async function getWeekly(weekStart: string): Promise<WeeklyRow | null> {
  const rs = await q("SELECT * FROM weekly_best WHERE week_start = ?", [weekStart]);
  return rs.rows[0] ? rowToWeekly(rec(rs.rows[0])) : null;
}

export async function saveWeekly(weekStart: string, weekEnd: string, summary: WeeklySummary, reviewCount: number, model: string): Promise<WeeklyRow> {
  await q(
    `INSERT INTO weekly_best (week_start, week_end, summary, review_count, model, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(week_start) DO UPDATE SET week_end = excluded.week_end, summary = excluded.summary,
       review_count = excluded.review_count, model = excluded.model, created_at = excluded.created_at`,
    [weekStart, weekEnd, JSON.stringify(summary), reviewCount, model, new Date().toISOString()]
  );
  return (await getWeekly(weekStart))!;
}

export async function listWeekly(limit = 12): Promise<WeeklyRow[]> {
  const rs = await q("SELECT * FROM weekly_best ORDER BY week_start DESC LIMIT ?", [limit]);
  return rs.rows.map((r) => rowToWeekly(rec(r)));
}

/* ---------- 수집 작업 (클라우드 화면과 노트북 수집기가 공유) ---------- */

export type CrawlStatus = "pending" | "running" | "done" | "error" | "stopped";

export interface CrawlJobRow {
  id: number;
  platform: string;
  status: CrawlStatus;
  stopRequested: boolean;
  log: string[];
  result: { inserted: number; updated: number; total: number } | null;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
}

function rowToCrawlJob(r: Rec): CrawlJobRow {
  let log: string[] = [];
  try { log = JSON.parse(str(r.log, "[]")); } catch { log = []; }
  let result: CrawlJobRow["result"] = null;
  try { result = r.result ? JSON.parse(str(r.result)) : null; } catch { result = null; }
  return {
    id: num(r.id),
    platform: str(r.platform),
    status: str(r.status, "pending") as CrawlStatus,
    stopRequested: num(r.stop_requested) === 1,
    log,
    result,
    requestedAt: str(r.requested_at),
    startedAt: r.started_at ? str(r.started_at) : null,
    finishedAt: r.finished_at ? str(r.finished_at) : null,
    updatedAt: str(r.updated_at),
  };
}

export async function createCrawlJob(platform: string, status: CrawlStatus = "pending"): Promise<CrawlJobRow> {
  const now = new Date().toISOString();
  const rs = await q(
    "INSERT INTO crawl_jobs (platform, status, requested_at, started_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    [platform, status, now, status === "running" ? now : null, now]
  );
  return (await getCrawlJob(Number(rs.lastInsertRowid)))!;
}

export async function getCrawlJob(id: number): Promise<CrawlJobRow | null> {
  const rs = await q("SELECT * FROM crawl_jobs WHERE id = ?", [id]);
  return rs.rows[0] ? rowToCrawlJob(rec(rs.rows[0])) : null;
}

export async function updateCrawlJob(id: number, patch: { status?: CrawlStatus; log?: string[]; result?: CrawlJobRow["result"]; startedAt?: string | null; finishedAt?: string | null }): Promise<void> {
  const sets: string[] = ["updated_at = ?"];
  const args: InValue[] = [new Date().toISOString()];
  if (patch.status) { sets.push("status = ?"); args.push(patch.status); }
  if (patch.log) { sets.push("log = ?"); args.push(JSON.stringify(patch.log.slice(-400))); }
  if (patch.result !== undefined) { sets.push("result = ?"); args.push(patch.result ? JSON.stringify(patch.result) : null); }
  if (patch.startedAt !== undefined) { sets.push("started_at = ?"); args.push(patch.startedAt); }
  if (patch.finishedAt !== undefined) { sets.push("finished_at = ?"); args.push(patch.finishedAt); }
  args.push(id);
  await q(`UPDATE crawl_jobs SET ${sets.join(", ")} WHERE id = ?`, args);
}

export async function listCrawlJobs(limit = 6): Promise<CrawlJobRow[]> {
  const rs = await q("SELECT * FROM crawl_jobs ORDER BY id DESC LIMIT ?", [limit]);
  return rs.rows.map((r) => rowToCrawlJob(rec(r)));
}

/** 노트북 수집기가 가져갈 다음 작업 (가장 오래된 대기 건). 10분 넘게 방치된 대기 건은 실패 처리 */
export async function takePendingCrawlJob(): Promise<CrawlJobRow | null> {
  const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await q("UPDATE crawl_jobs SET status = 'error', log = ?, finished_at = ?, updated_at = ? WHERE status = 'pending' AND requested_at < ?", [
    JSON.stringify(["[오류] 노트북 앱이 응답하지 않아 10분 뒤 취소했습니다. 노트북에서 review-studio-start.bat 이 켜져 있는지 확인해주세요."]),
    new Date().toISOString(), new Date().toISOString(), stale,
  ]);
  const rs = await q("SELECT * FROM crawl_jobs WHERE status = 'pending' ORDER BY id ASC LIMIT 1");
  return rs.rows[0] ? rowToCrawlJob(rec(rs.rows[0])) : null;
}

export async function hasActiveCrawlJob(): Promise<boolean> {
  const rs = await q("SELECT COUNT(*) n FROM crawl_jobs WHERE status IN ('pending','running')");
  return num(rec(rs.rows[0]).n) > 0;
}

export async function requestCrawlStop(): Promise<number> {
  const rs = await q("SELECT id, status FROM crawl_jobs WHERE status IN ('pending','running') ORDER BY id DESC LIMIT 1");
  if (!rs.rows[0]) return 0;
  const id = num(rec(rs.rows[0]).id);
  if (str(rec(rs.rows[0]).status) === "pending") {
    await updateCrawlJob(id, { status: "stopped", finishedAt: new Date().toISOString(), log: ["[중단] 시작 전에 취소했습니다."] });
  } else {
    await q("UPDATE crawl_jobs SET stop_requested = 1, updated_at = ? WHERE id = ?", [new Date().toISOString(), id]);
  }
  return id;
}

export async function stopRequestedIds(): Promise<number[]> {
  const rs = await q("SELECT id FROM crawl_jobs WHERE status = 'running' AND stop_requested = 1");
  return rs.rows.map((r) => num(rec(r).id));
}

/* ---------- 설정 ---------- */

export async function getSettings(): Promise<Settings> {
  const rs = await q("SELECT value FROM settings WHERE key = 'store'");
  if (!rs.rows[0]) return SettingsSchema.parse({});
  try {
    return SettingsSchema.parse(JSON.parse(str(rec(rs.rows[0]).value, "{}")));
  } catch {
    return SettingsSchema.parse({});
  }
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const merged = SettingsSchema.parse({ ...(await getSettings()), ...patch });
  await q("INSERT INTO settings (key, value) VALUES ('store', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [JSON.stringify(merged)]);
  return merged;
}
