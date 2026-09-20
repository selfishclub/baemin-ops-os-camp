import assert from "node:assert/strict";
import test from "node:test";
import { buildExamStatus, defaultExams, examCheckKey } from "../app/exam/exam-data.ts";

// 인증 규칙을 실제로 돌려 본다: 필기 합격 + 실기 전부 "사장 합격"이어야 인증. 값은 전부 가짜다.

const exam = defaultExams[0];
const passedCheck = (itemId) => ({ recipe_id: examCheckKey(exam.id, itemId), practiced_at: "2026-01-01", confirmed_at: "2026-01-02", confirmed_by_name: "가짜 사장" });

test("certifies only when the written test is passed and the owner passed every practical item", () => {
  const written = [{ examId: exam.id, score: exam.passScore, total: exam.writtenCount, created_at: "2026-01-01" }];
  const allPassed = exam.practicalItems.map((item) => passedCheck(item.id));

  assert.equal(buildExamStatus([exam], written, allPassed)[0].certified, true);
  // 실기 하나가 빠지면 인증 아님
  assert.equal(buildExamStatus([exam], written, allPassed.slice(1))[0].certified, false);
  // 필기가 기준 미달이면 실기를 다 받아도 인증 아님
  const low = [{ examId: exam.id, score: exam.passScore - 1, total: exam.writtenCount, created_at: "2026-01-01" }];
  assert.equal(buildExamStatus([exam], low, allPassed)[0].certified, false);
  // 아무 기록이 없으면 당연히 아님
  assert.equal(buildExamStatus([exam], [], [])[0].certified, false);
});

test("a staff 'ready' mark alone never counts as a pass", () => {
  const readyOnly = exam.practicalItems.map((item) => ({ recipe_id: examCheckKey(exam.id, item.id), practiced_at: "2026-01-01", confirmed_at: null, confirmed_by_name: null }));
  const status = buildExamStatus([exam], [{ examId: exam.id, score: exam.writtenCount, total: exam.writtenCount, created_at: "2026-01-01" }], readyOnly)[0];
  assert.equal(status.writtenPassed, true);
  assert.equal(status.practical.every((item) => item.ready_at && !item.passed_at), true);
  assert.equal(status.certified, false);
});

test("keeps results of different stages apart and scales the pass line when fewer questions could be made", () => {
  const [first, second] = buildExamStatus(defaultExams, [{ examId: defaultExams[1].id, score: 10, total: 10, created_at: "2026-01-01" }], []);
  assert.equal(first.best, null);
  assert.equal(second.writtenPassed, true);
  // 10문제 중 8개 기준 → 5문제만 나왔으면 4개
  const short = buildExamStatus([exam], [{ examId: exam.id, score: 4, total: 5, created_at: "2026-01-01" }], [])[0];
  assert.equal(short.writtenPassed, true);
  assert.equal(buildExamStatus([exam], [{ examId: exam.id, score: 3, total: 5, created_at: "2026-01-01" }], [])[0].writtenPassed, false);
});

test("example stages stay fake and leave promotion and pay rules undecided", () => {
  const text = JSON.stringify(defaultExams);
  assert.match(text, /\(예시\)/);
  assert.match(text, /확인 필요/);
});
