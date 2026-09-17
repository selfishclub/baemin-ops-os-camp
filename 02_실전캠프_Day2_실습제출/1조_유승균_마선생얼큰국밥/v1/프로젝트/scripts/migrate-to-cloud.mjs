// 노트북의 로컬 DB(data/studio.db) 내용을 클라우드 DB(Turso)로 복사합니다.
// 사용: node scripts/migrate-to-cloud.mjs   (.env.local 의 TURSO_DATABASE_URL / TURSO_AUTH_TOKEN 사용)
import { createClient } from "@libsql/client";
import path from "node:path";
import { SCHEMA_SQL, TABLES } from "../src/lib/schema.mjs";
import { loadEnvLocal, ROOT } from "./lib/common.mjs";

loadEnvLocal();
const url = process.env.TURSO_DATABASE_URL?.trim();
const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
if (!url) {
  console.error(".env.local 에 TURSO_DATABASE_URL 이 없습니다. Vercel(또는 Turso)에서 받은 값을 넣어주세요.");
  process.exit(1);
}

const localPath = path.join(ROOT, "data", "studio.db").replace(/\\/g, "/");
const local = createClient({ url: "file:" + localPath });
const remote = createClient({ url, authToken });

console.log("클라우드 DB 테이블 준비…");
await remote.executeMultiple(SCHEMA_SQL);

for (const table of TABLES) {
  const rs = await local.execute(`SELECT * FROM ${table}`);
  const cols = rs.columns;
  if (!rs.rows.length) { console.log(`${table}: 0건 (건너뜀)`); continue; }
  const sql = `INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
  const stmts = rs.rows.map((row) => ({ sql, args: cols.map((c) => (row[c] === undefined ? null : row[c])) }));
  for (let i = 0; i < stmts.length; i += 100) await remote.batch(stmts.slice(i, i + 100), "write");
  console.log(`${table}: ${rs.rows.length}건 복사 완료`);
}

const check = await remote.execute("SELECT COUNT(*) n FROM reviews");
console.log(`\n완료 ✅ 클라우드 DB 리뷰 수: ${check.rows[0].n}`);
