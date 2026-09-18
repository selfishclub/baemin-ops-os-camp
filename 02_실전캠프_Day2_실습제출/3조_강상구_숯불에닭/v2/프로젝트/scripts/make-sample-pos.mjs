// 시연용 가짜 포스 "상품ABC분석" 엑셀 (2026-09). 오케이포스 ASP 파일 모양을 흉내 낸다.
// 실행: npm run sample:pos  →  public/sample/가짜_상품ABC분석_2026-09.xlsx
import * as XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "lib", "costing", "sample.json"), "utf8"));
const lines = [...sample.posSales].sort((a, b) => b.amount - a.amount);
const total = lines.reduce((a, l) => a + l.amount, 0);
const totalQ = lines.reduce((a, l) => a + l.quantity, 0);
let cum = 0;
const body = lines.map((l, i) => {
  cum += l.amount;
  const share = (l.amount / total) * 100;
  const grade = cum / total <= 0.7 ? "A" : cum / total <= 0.9 ? "B" : "C";
  return [grade, i + 1, "가짜지점", l.code, l.name, l.amount, l.quantity, +share.toFixed(2), +((cum / total) * 100).toFixed(2)];
});
const grid = [
  ["상품ABC분석"],
  [],
  ["조회일자 : 2026-09-01 ~ 2026-09-30   누적판매비율 : A등급 70 %  B등급 90 %  (시연용 가짜 데이터)"],
  [],
  [" "],
  ["등급", "No.", "대분류", "상품코드", "상품명", "실매출액", "판매수량", "점유율 (%)", "누계 (%)"],
  ...body,
  ["합계", "", "", "", "", total, totalQ, "", ""],
];
const ws = XLSX.utils.aoa_to_sheet(grid);
ws["!cols"] = [{ wch: 6 }, { wch: 5 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "상품ABC분석");
const out = path.join(__dirname, "..", "public", "sample", "가짜_상품ABC분석_2026-09.xlsx");
fs.writeFileSync(out, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
console.log(`${lines.length}개 메뉴, 매출 ${total.toLocaleString()} → ${out}`);
