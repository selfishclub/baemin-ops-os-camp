/**
 * Phase 1 검증 — 7월 가계부 CSV를 넣어 계정과목별 합계가 나오는지 확인한다.
 * PRD §8: "숫자가 맞는지가 아니라 기존 시트의 오류를 툴이 잡아내는지를 본다."
 *   실행: npm run verify
 */
import fs from "node:fs";
import path from "node:path";
import { parseLedgerCsv } from "../lib/parseLedger";
import { summarize } from "../lib/summary";
import { won } from "../lib/csv";

const file = process.argv[2] ?? "data/2026-07-ledger.csv";
if (!fs.existsSync(path.resolve(file))) {
  console.error(`\n파일이 없습니다: ${file}`);
  console.error("실제 카드·가계부 자료는 공개 저장소에 올리지 않습니다. data/ 폴더에 직접 넣고 다시 돌려 주세요.");
  console.error("가짜 시연 파일로 먼저 보시려면: npm run verify:card fixtures/hyundai-2026-08.csv\n");
  process.exit(1);
}

const text = fs.readFileSync(path.resolve(file), "utf8");
const parsed = parseLedgerCsv(text);
const s = summarize(parsed.month, parsed.transactions, parsed.revenue);

const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;
const line = (c = "─") => console.log(c.repeat(72));
const row = (a: string, b: string, c = "") =>
  console.log(a.padEnd(22) + b.padStart(16) + (c ? "   " + c : ""));

console.log(`\n■ ${parsed.month} 정산  (${file})`);
line();
console.log("파싱한 블록");
for (const b of parsed.blocks) console.log(`  · ${b.kind}  ${b.rows}건  (${b.headerRow}행 ${b.col}열)`);
console.log(`  · 매출 채널 ${parsed.revenue.length}개`);
console.log(`  · 거래 합계 ${s.txCount}건, 검수 필요 ${s.reviewCount}건`);

line();
console.log("매출");
for (const c of s.revenue.byChannel)
  row(`  ${c.channel}`, won(c.gross), `입금 ${won(c.deposit).padStart(12)}  수수료 ${pct(c.feeRate)}`);
row("  매출액 합계", won(s.revenue.gross), `입금 ${won(s.revenue.deposit).padStart(12)}  수수료 ${pct(s.revenue.feeRate)}`);

line();
console.log("계정과목별 합계 (사업 지출)");
for (const a of s.expense.byAccount) {
  const flag = a.behavior === "fixed" ? "고정" : a.behavior === "variable" ? "변동" : a.account === "인건비" ? "혼합" : "—";
  row(`  ${a.account}${a.derived ? " *" : ""}`, won(a.amount), `${pct(a.ratio).padStart(6)}  ${flag}  ${a.count}건`);
  for (const sub of a.subs) row(`      ${sub.sub}`, won(sub.amount));
}
row("  비용 합계", won(s.expense.total));
console.log("  * 수수료는 매출액−입금액으로 계산된 파생 계정");

line();
row("매출", won(s.revenue.gross));
row("비용", won(s.expense.total));
row("영업이익", won(s.operatingProfit), pct(s.operatingMargin));
row("프라임코스트", won(s.primeCost), pct(s.primeCostRatio));
row("  고정비", won(s.fixedTotal), pct(s.fixedTotal / s.revenue.gross));
row("  변동비", won(s.variableTotal), pct(s.variableTotal / s.revenue.gross));
if (s.unflaggedTotal) row("  플래그 없음", won(s.unflaggedTotal));

line();
row("개인지출 (손익 제외)", won(s.personal.total));
for (const a of s.personal.byAccount) row(`  ${a.account}`, won(a.amount), `${a.count}건`);
row("기타수입 (손익 제외)", won(s.otherIncome.total), `${s.otherIncome.count}건`);
if (s.unclassified.count) row("미분류", won(s.unclassified.total), `${s.unclassified.count}건`);

// ── 기존 시트와 대조 ────────────────────────────────────────────────
line("━");
console.log("기존 시트 대조");

const bySheetLabel = new Map<string, { amount: number; row: number }[]>();
for (const t of parsed.sheetTotals) {
  const list = bySheetLabel.get(t.label) ?? [];
  list.push({ amount: t.amount, row: t.row });
  bySheetLabel.set(t.label, list);
}

const findings: string[] = [];

for (const a of s.expense.byAccount) {
  if (a.derived) continue;
  const hits = bySheetLabel.get(`${a.account} 소계`) ?? [];
  if (hits.length === 0) {
    row(`  ${a.account}`, won(a.amount), "시트에 소계 행 없음");
    findings.push(`'${a.account} 소계' 행이 시트에 없습니다 (툴 집계 ${won(a.amount)}).`);
    continue;
  }
  if (hits.length > 1) {
    const detail = hits.map((h) => `${won(h.amount)}(${h.row}행)`).join(" / ");
    row(`  ${a.account}`, won(a.amount), `라벨 중복 — ${detail}`);
    findings.push(`'${a.account} 소계' 라벨이 시트에 ${hits.length}번 나옵니다 — ${detail}.`);
    continue;
  }
  const v = hits[0].amount;
  const ok = v === a.amount;
  row(`  ${a.account}`, won(a.amount), `시트 ${won(v).padStart(12)}  ${ok ? "일치" : "차이 " + won(a.amount - v)}`);
  if (!ok) findings.push(`${a.account}: 툴 ${won(a.amount)} vs 시트 ${won(v)} (차이 ${won(a.amount - v)}).`);
}

const one = (label: string): number | undefined => {
  const hits = bySheetLabel.get(label);
  return hits && hits.length === 1 ? hits[0].amount : undefined;
};

const sheetFixed = one("고정지출 총 소계");
const sheetVarSub = one("변동비 소계");
const sheetSpend = one("지출 총 합계");
const sheetPersonal = one("개인지출 총 합계");
const sheetRevenue = one("총매출액 (A)");

line();
console.log("시트 총계 대조");
const cmp = (label: string, tool: number, sheetVal: number | undefined) => {
  if (sheetVal === undefined) return;
  const ok = tool === sheetVal;
  row(`  ${label}`, won(tool), `시트 ${won(sheetVal).padStart(12)}  ${ok ? "일치" : "차이 " + won(tool - sheetVal)}`);
  if (!ok) findings.push(`${label}: 툴 ${won(tool)} vs 시트 ${won(sheetVal)} (차이 ${won(tool - sheetVal)}).`);
};

const fixedTx = parsed.transactions
  .filter((t) => t.source === "ledger-fixed")
  .reduce((a, b) => a + b.amount, 0);
const bizTotalNoFee = s.expense.byAccount.filter((a) => !a.derived).reduce((acc, a) => acc + a.amount, 0);

cmp("고정비내역", fixedTx, sheetFixed);
cmp("변동지출", bizTotalNoFee - fixedTx, sheetVarSub);
cmp("지출 총합(수수료 제외)", bizTotalNoFee, sheetSpend);
cmp("개인지출", s.personal.total, sheetPersonal);
cmp("총매출액", s.revenue.gross, sheetRevenue);

// PRD §3 상단 표시 기대값
line("━");
console.log("PRD §3 상단 표시 기대값 대조");
const expect = { 매출: 23296011, 비용: 22514628, 영업이익: 781383, 프라임코스트: 0.541 };
row("  매출", won(s.revenue.gross), s.revenue.gross === expect.매출 ? "일치" : `기대 ${won(expect.매출)}`);
row("  비용", won(s.expense.total), s.expense.total === expect.비용 ? "일치" : `기대 ${won(expect.비용)}`);
row("  영업이익", won(s.operatingProfit), s.operatingProfit === expect.영업이익 ? "일치" : `기대 ${won(expect.영업이익)}`);
row("  프라임코스트", pct(s.primeCostRatio), Math.abs(s.primeCostRatio - expect.프라임코스트) < 0.0005 ? "일치" : "차이");

// §8 — 숫자가 맞는지가 아니라, 시트의 오류를 툴이 잡아내는지를 본다
const dated = parsed.transactions.filter((t) => t.date).length;
findings.push(
  `날짜 입력률 ${((dated / parsed.transactions.length) * 100).toFixed(1)}% (${parsed.transactions.length}건 중 ${dated}건) — 일별 집계 불가.`
);

line("━");
console.log(`툴이 잡아낸 기존 시트의 문제 ${findings.length}건`);
for (const f of findings) console.log(`  ! ${f}`);

if (parsed.warnings.length) {
  line("━");
  console.log("경고");
  for (const w of parsed.warnings) console.log(`  ! ${w}`);
}

const review = parsed.transactions.filter((t) => t.needsReview);
if (review.length) {
  line("━");
  console.log(`검수 필요 ${review.length}건 (전체 ${s.txCount}건)`);
  const byReason = new Map<string, number>();
  for (const t of review) {
    const k = (t.reviewReason ?? "").replace(/'.*'/, "'…'");
    byReason.set(k, (byReason.get(k) ?? 0) + 1);
  }
  for (const [k, v] of [...byReason].sort((a, b) => b[1] - a[1])) console.log(`  · ${k} — ${v}건`);
}
console.log();
