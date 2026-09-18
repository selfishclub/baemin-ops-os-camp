// 시연용 가짜 일별 자료(2026-09-01 ~ 09-17)와, 그 매출이 정산 규칙대로 통장에 찍힌 가짜 9월 은행 엑셀을 만든다.
// 실행: npm run sample:daily  →  lib/sampleDaily.json, public/sample/가짜_거래내역_2026-09.xlsx
import * as XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONTH = "2026-09";
const LAST_DAY = 17; // 9/17까지 입력했다고 가정 (오늘 = 9/18)
const LAST_BANK = "2026-09-18";

// 규칙 (lib/settlement.ts 의 DEFAULT_RULES 와 같게 유지)
const RULES = {
  hall_card: { mode: "days", days: 2 },
  baemin: { mode: "days", days: 3 },
  coupang: { mode: "days", days: 4 },
  yogiyo: { mode: "days", days: 5 },
  etc: { mode: "days", days: 1 },
};
const FEE = { hall_card: 0.012, baemin: 0.15, coupang: 0.18, yogiyo: 0.14, etc: 0.07 };
const PAYEE = { hall_card: "BC카드매출", baemin: "우아한형제들", coupang: "쿠팡이츠정산", yogiyo: "요기요정산", etc: "땡겨요정산" };

const shift = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const dow = (d) => (new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7;
const biz = (d) => dow(d) < 5;
const addBiz = (d, n) => { let x = d, left = n; while (left > 0) { x = shift(x, 1); if (biz(x)) left -= 1; } while (!biz(x)) x = shift(x, 1); return x; };
const payout = (d, r) => (r.mode === "days" ? addBiz(d, r.days) : (() => { let p = shift(shift(d, -dow(d)), 7 + r.weekday); while (!biz(p)) p = shift(p, 1); return p; })());

// 요일에 따라 매출이 다르게 (금·토 높게), 결정론적 흔들림
let seed = 7;
const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
const base = { hall_card: 520000, hall_cash: 70000, baemin: 380000, coupang: 210000, yogiyo: 90000, etc: 45000 };
const dowFactor = [0.85, 0.8, 0.9, 0.95, 1.25, 1.4, 1.1];

const sales = [];
const shifts = [];
const staffIds = { holA: "seed-staff-holA", holB: "seed-staff-holB", hwadeokA: "seed-staff-hwadeokA" };
for (let day = 1; day <= LAST_DAY; day++) {
  const date = `${MONTH}-${String(day).padStart(2, "0")}`;
  const f = dowFactor[dow(date)] * (0.9 + rnd() * 0.2);
  for (const [ch, b] of Object.entries(base)) sales.push({ date, channel: ch, amount: Math.round((b * f) / 1000) * 1000 });
  shifts.push({ date, staffId: staffIds.hwadeokA, hours: 8, start: "16:00", end: "00:00" });
  shifts.push(dow(date) >= 4 ? { date, staffId: staffIds.holA, hours: 6, start: "17:00", end: "23:00" } : { date, staffId: staffIds.holA, hours: 4, start: "18:00", end: "22:00" });
  if (dow(date) >= 4) shifts.push({ date, staffId: staffIds.holB, hours: 5, start: "18:00", end: "23:00" });
}
const staff = [
  { id: staffIds.hwadeokA, alias: "화덕A", wage: 12000, active: true },
  { id: staffIds.holA, alias: "홀A", wage: 11000, active: true },
  { id: staffIds.holB, alias: "홀B", wage: 11000, active: true },
];
fs.writeFileSync(path.join(__dirname, "..", "lib", "sampleDaily.json"), JSON.stringify({ _note: "시연용 가짜 자료. 실제 매출·직원 아님", month: MONTH, sales, shifts, staff }, null, 0));

// 입금: 묶음별로 수수료를 뗀 금액. 쿠팡이츠 한 건은 일부러 3만 원 덜 넣어 "차이"가 보이게.
const groups = new Map();
for (const s of sales) {
  const r = RULES[s.channel];
  if (!r) continue;
  const p = payout(s.date, r);
  const k = s.channel + "|" + p;
  groups.set(k, (groups.get(k) ?? 0) + s.amount);
}
const rows = [];
for (const [k, amt] of groups) {
  const [ch, p] = k.split("|");
  if (p > LAST_BANK) continue; // 아직 안 들어옴
  let dep = Math.round(amt * (1 - FEE[ch]));
  if (ch === "coupang" && rows.filter((r) => r[1] === PAYEE.coupang).length === 1) dep -= 30000;
  rows.push([p, PAYEE[ch], 0, dep]);
}
// 지난달(8월) 말 주문분이 9월 초에 들어온 것 (짝이 없는 입금으로 보이면 안 되므로 8/31 매출로 설명됨 — 시연에선 그냥 둔다)
rows.push(["2026-09-01", "BC카드매출", 0, 610000], ["2026-09-02", "BC카드매출", 0, 450000]);
// 비용 몇 줄 (9월 손익이 비지 않게)
rows.push(["2026-09-01", "월세(건물주)", 2000000, 0], ["2026-09-01", "관리비(상가)", 230000, 0], ["2026-09-03", "가나식품", 1500000, 0], ["2026-09-10", "가나식품", 1450000, 0], ["2026-09-10", "급여(주방)", 2800000, 0], ["2026-09-05", "숯닭본사(가맹)", 1200000, 0], ["2026-09-08", "참숯나라", 450000, 0], ["2026-09-15", "생활비이체", 2500000, 0]);
rows.sort((a, b) => a[0].localeCompare(b[0]));

let balance = 9_000_000;
const body = rows.map(([d, payee, out, inn], i) => { balance += inn - out; return [`${d} ${String(9 + (i % 9)).padStart(2, "0")}:${String((i * 11) % 60).padStart(2, "0")}:00`, inn > 0 ? "타행이체" : "인터넷", payee, out || "", inn || "", balance, "가짜지점"]; });
const grid = [["거래내역조회 (시연용 가짜 데이터)"], ["계좌번호: 000-00-000000", "", `조회기간: ${MONTH}-01 ~ ${LAST_BANK}`], [], ["거래일시", "적요", "기재내용", "출금액", "입금액", "잔액", "거래점"], ...body];
const ws = XLSX.utils.aoa_to_sheet(grid);
ws["!cols"] = [{ wch: 20 }, { wch: 10 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 10 }];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "거래내역");
const out = path.join(__dirname, "..", "public", "sample", `가짜_거래내역_${MONTH}.xlsx`);
fs.writeFileSync(out, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
console.log(`일별 ${sales.length}줄, 근무 ${shifts.length}줄, 은행 ${rows.length}줄 → ${out}`);
