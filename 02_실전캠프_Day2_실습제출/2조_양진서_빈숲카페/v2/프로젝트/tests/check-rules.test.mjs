import assert from "node:assert/strict";
import test from "node:test";
import { buildCheckDocs, checkItemKey, isLate, isScheduledOn, normalizeMeasure, parseCheckStep } from "../app/checks/check-data.ts";

test("parses number, weekly, monthly and deadline markers out of a step", () => {
  assert.deepEqual(parseCheckStep("(예시) 냉장고 온도 확인 [숫자: ℃]"), { label: "(예시) 냉장고 온도 확인", unit: "℃", schedule: null, due: null });
  assert.deepEqual(parseCheckStep("폐기 수량 기록 [숫자]"), { label: "폐기 수량 기록", unit: "", schedule: null, due: null });
  const weekly = parseCheckStep("(매주 월·목) 그라인더 분해 청소");
  assert.equal(weekly.label, "그라인더 분해 청소");
  assert.deepEqual(weekly.schedule, { kind: "weekly", days: [1, 4], note: "매주 월·목" });
  const monthly = parseCheckStep("(매월 1일, 15일) 소화기 압력 확인");
  assert.deepEqual(monthly.schedule, { kind: "monthly", dates: [1, 15], note: "매월 1·15일" });
  const due = parseCheckStep("(~09:30) 영업 시작 전 책임자에게 확인받는다");
  assert.equal(due.due, "09:30");
  assert.equal(due.label, "영업 시작 전 책임자에게 확인받는다");
  assert.equal(parseCheckStep("(9:05까지) 간판 켜기").due, "09:05");
  assert.deepEqual(parseCheckStep("그냥 글"), { label: "그냥 글", unit: null, schedule: null, due: null });
});

test("schedule matches Seoul date; deadline is late only today after grace", () => {
  const weekly = parseCheckStep("(매주 월) x").schedule;
  assert.equal(isScheduledOn(weekly, "2026-10-05"), true); // 월
  assert.equal(isScheduledOn(weekly, "2026-10-06"), false);
  const monthly = parseCheckStep("(매월 1일) x").schedule;
  assert.equal(isScheduledOn(monthly, "2026-10-01"), true);
  assert.equal(isScheduledOn(monthly, "2026-10-02"), false);
  assert.equal(isScheduledOn(null, "2026-10-02"), true);
  assert.equal(isLate("09:30", "2026-10-06", "2026-10-06", "09:40"), false); // 여유 15분
  assert.equal(isLate("09:30", "2026-10-06", "2026-10-06", "09:46"), true);
  assert.equal(isLate("09:30", "2026-10-05", "2026-10-06", "23:00"), false); // 지난 날짜는 지연 아님
  assert.equal(isLate(null, "2026-10-06", "2026-10-06", "23:00"), false);
});

test("measure input accepts numbers only", () => {
  assert.equal(normalizeMeasure(" 4.5 "), "4.5");
  assert.equal(normalizeMeasure("1,200"), "1200");
  assert.equal(normalizeMeasure("-18"), "-18");
  assert.equal(normalizeMeasure("많이"), null);
  assert.equal(normalizeMeasure(""), null);
});

test("buildCheckDocs: skipped items leave the total, late flag set, value shown", () => {
  const doc = { id: "d", title: "마감", sectionId: "close", kind: "procedure", dailyCheck: true, steps: ["(~20:00) 재료 정리", "냉장고 온도 [숫자: ℃]", "(매주 수) 제빙기 청소"], materials: [], doneCriteria: [], donts: [], reportWhen: [], summary: "", purpose: "", updatedAt: "", change: "" };
  const rows = [{ doc_id: "d", item_key: checkItemKey("냉장고 온도 [숫자: ℃]"), item_text: "냉장고 온도 [숫자: ℃]", checked_by: "a", checked_by_name: "직원 A", checked_at: "2026-10-05T10:00:00Z", value: "4" }];
  const [view] = buildCheckDocs([doc], rows, "a", { date: "2026-10-05", today: "2026-10-05", nowClock: "21:00" }); // 월요일
  assert.equal(view.total, 2);
  assert.equal(view.done, 1);
  assert.equal(view.late, 1);
  assert.equal(view.items[0].late, true);
  assert.equal(view.items[0].due, "20:00");
  assert.equal(view.items[1].value, "4");
  assert.equal(view.items[1].unit, "℃");
  assert.equal(view.items[2].skipped, true);
  assert.equal(view.items[2].schedule, "매주 수");
  const [wed] = buildCheckDocs([doc], [], "a", { date: "2026-10-07", today: "2026-10-07", nowClock: "09:00" });
  assert.equal(wed.total, 3);
  assert.equal(wed.late, 0);
});
