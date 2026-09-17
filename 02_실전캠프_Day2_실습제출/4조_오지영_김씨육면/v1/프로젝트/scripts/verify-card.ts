/**
 * 카드 내역서 대조. 정답을 코드에 박지 않고 파일 하단 집계와 맞춰본다.
 *   npx tsx scripts/verify-card.ts <파일>
 */
import fs from "node:fs";
import path from "node:path";
import { won } from "../lib/csv";
import { decodeBytes } from "../lib/decode";
import { NoHeaderError, parseCardCsv } from "../lib/parseCard";

const file = process.argv[2] ?? "data/2026-07-hyundai.csv";
if (!fs.existsSync(path.resolve(file))) {
  console.error(`\n파일이 없습니다: ${file}`);
  console.error("실제 카드·가계부 자료는 공개 저장소에 올리지 않습니다. data/ 폴더에 직접 넣고 다시 돌려 주세요.");
  console.error("가짜 시연 파일로 먼저 보시려면: npm run verify:card fixtures/hyundai-2026-08.csv\n");
  process.exit(1);
}

// Node의 Buffer는 공용 풀을 공유한다. 그대로 .buffer를 쓰면 옆 데이터까지 딸려온다.
const buf = fs.readFileSync(path.resolve(file));
const { text, encoding } = decodeBytes(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
);

let r;
try {
  r = parseCardCsv(text);
} catch (e) {
  if (e instanceof NoHeaderError) {
    console.error("머리글(날짜 / 가맹점 / 금액)을 찾지 못했습니다. 파일 앞부분:");
    for (const row of e.head) console.error("  " + row.join(" | "));
    process.exit(1);
  }
  throw e;
}

const line = (c = "─") => console.log(c.repeat(64));
const row = (a: string, b: string, c = "") => console.log(a.padEnd(26) + b.padStart(16) + (c ? "   " + c : ""));

console.log(`\n■ 카드 내역 ${r.month ?? "?"}  (${file}, ${encoding})`);
line();
row("머리글 행", `${r.headerRow}행`);
console.log(
  "찾은 열: " +
    Object.entries(r.map)
      .map(([k, v]) => `${k}=${(v as number) + 1}`)
      .join(", ")
);
row("거래 행", `${r.rows.length}건`);
row("  유효", `${r.valid.length}건`, won(r.valid.reduce((a, b) => a + b.amount, 0)));
row("  취소", `${r.cancelled.length}건`, won(r.cancelled.reduce((a, b) => a + b.amount, 0)));
row("  할부", `${r.installments.length}건`, won(r.installments.reduce((a, b) => a + b.amount, 0)));
row("날짜 없는 건", `${r.undated}건`, r.undated === 0 ? "정상" : "확인 필요");
row("집계 행 (거래 제외)", `${r.summaries.length}개`);
for (const s of r.summaries) row(`  ${s.label}`, won(s.amount));

if (r.recon) {
  const c = r.recon;
  line("━");
  console.log("대조");
  row("  파일 합계", c.fileAmount != null ? won(c.fileAmount) : "—", "취소 차감 기준");
  row("  파서 집계", won(c.parsedAmount), `유효 ${c.parsedCount}건`);
  row("  금액 차이", c.diffAmount != null ? won(c.diffAmount) : "—");
  line();
  row("  파일 건수", c.fileCount != null ? `${c.fileCount}건` : "—", "취소 포함 기준");
  row("  파서 건수", `${c.approvedCount}건`, `유효 ${c.parsedCount} + 취소 ${r.cancelled.length}`);
  row("  건수 차이", c.diffCount != null ? `${c.diffCount > 0 ? "+" : ""}${c.diffCount}건` : "—");

  if (c.diffCount === -1 && c.diffAmount != null && c.diffAmount !== 0) {
    console.log(`\n  → 파일에 ${won(-c.diffAmount)}원짜리 1건이 빠져 있습니다.`);
  }
  // 건수는 맞는데 금액만 어긋나고 판독 불가가 딱 1건이면 그 금액을 역산할 수 있다
  if (c.diffCount === 0 && c.diffAmount != null && c.diffAmount !== 0 && r.unreadable.length === 1) {
    const u = r.unreadable[0];
    console.log(
      `\n  → ${u.date} ${u.merchant} 의 금액이 ${won(-c.diffAmount)}원으로 보입니다 (건수는 맞고 이 건만 못 읽었습니다).`
    );
  }
  if (r.unreadable.length > 1) {
    console.log(`\n  → 금액을 못 읽은 건이 ${r.unreadable.length}건이라 역산할 수 없습니다:`);
    for (const u of r.unreadable) console.log(`     ${u.date}  ${u.merchant}`);
  }
  if (c.partsAmount != null && c.fileAmount != null && c.partsAmount !== c.fileAmount) {
    line();
    console.log("파일 안에서도 집계가 안 맞습니다");
    row("  개별 집계 합", won(c.partsAmount));
    row("  전체 합계", won(c.fileAmount));
    row(
      "  차이",
      won(c.partsAmount - c.fileAmount),
      c.partsAmount - c.fileAmount === c.cancelledAmount ? "= 취소 합계" : ""
    );
  }

  if (!c.matched) {
    line("━");
    if (r.cancelled.length) {
      console.log(`취소 ${r.cancelled.length}건`);
      for (const t of r.cancelled) console.log(`  ${t.date}  ${won(t.amount).padStart(11)}  ${t.merchant}`);
    }
    if (r.installments.length) {
      console.log(`\n할부 ${r.installments.length}건`);
      for (const t of r.installments)
        console.log(`  ${t.date}  ${won(t.amount).padStart(11)}  ${t.months || "-"}개월  ${t.merchant}`);
    }
  }
}

if (r.warnings.length) {
  line("━");
  console.log("경고");
  for (const w of r.warnings) console.log(`  ! ${w}`);
}
console.log();
