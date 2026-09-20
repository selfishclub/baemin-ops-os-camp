import assert from "node:assert/strict";
import test from "node:test";
import { buildCheckDocs, buildDaySummaries, checkItemKey, isCheckDate, lastDates, signoffItemKey, todayInSeoul } from "../app/checks/check-data.ts";

// 오늘 체크의 규칙을 실제로 돌려 본다. 문서와 이름은 전부 가짜다.

const doc = { id: "fake-open", dailyCheck: true, sectionId: "open", title: "가짜 오픈 체크", summary: "", purpose: "", materials: [], steps: ["가짜 전원 켜기", "가짜 재료 확인", "가짜 청결 확인"], doneCriteria: [], donts: [], reportWhen: [], updatedAt: "", change: "" };
const row = (text, by, name, key = checkItemKey(text)) => ({ doc_id: doc.id, item_key: key, item_text: text, checked_by: by, checked_by_name: name, checked_at: "2026-01-01T00:10:00.000Z" });

test("shows who checked what, marks my own checks, and counts progress", () => {
  const [view] = buildCheckDocs([doc], [row("가짜 전원 켜기", "u1", "가짜 직원 A"), row("가짜 재료 확인", "u2", "가짜 직원 B")], "u1");
  assert.equal(view.done, 2);
  assert.equal(view.total, 3);
  assert.deepEqual(view.items.map((item) => [item.checkedByName, item.mine]), [["가짜 직원 A", true], ["가짜 직원 B", false], [null, false]]);
  assert.equal(view.signoff, null);
});

test("only documents switched on for daily checks appear, never response cards", () => {
  const plain = { ...doc, id: "plain", dailyCheck: undefined };
  const card = { ...doc, id: "card", kind: "response" };
  assert.deepEqual(buildCheckDocs([plain, card, doc], [], "u1").map((view) => view.docId), ["fake-open"]);
});

test("the owner's sign-off is separate from the items and never counts as a done item", () => {
  const [view] = buildCheckDocs([doc], [row("확인함", "owner", "가짜 사장", signoffItemKey)], "u1");
  assert.equal(view.done, 0);
  assert.deepEqual(view.signoff, { name: "가짜 사장", at: "2026-01-01T00:10:00.000Z" });
});

test("reordering steps keeps today's checks on the right items; rewording keeps the old record visible", () => {
  const checked = [row("가짜 재료 확인", "u1", "가짜 직원 A")];
  const reordered = { ...doc, steps: ["가짜 재료 확인", "가짜 전원 켜기", "가짜 청결 확인"] };
  assert.deepEqual(buildCheckDocs([reordered], checked, "u1")[0].items.map((item) => Boolean(item.checkedAt)), [true, false, false]);
  const reworded = { ...doc, steps: ["가짜 전원 켜기", "가짜 재료와 날짜 확인", "가짜 청결 확인"] };
  const [view] = buildCheckDocs([reworded], checked, "u1");
  assert.equal(view.done, 0);
  assert.deepEqual(view.earlier.map((item) => item.text), ["가짜 재료 확인"]);
});

test("summarises past days per document and cuts the day in Korean time", () => {
  const dates = lastDates("2026-03-02", 3);
  assert.deepEqual(dates, ["2026-03-02", "2026-03-01", "2026-02-28"]);
  const rows = [
    ...doc.steps.map((text) => ({ ...row(text, "u1", "가짜 직원 A"), check_date: "2026-03-01" })),
    { ...row("확인함", "owner", "가짜 사장", signoffItemKey), check_date: "2026-03-01" },
    { ...row("가짜 전원 켜기", "u2", "가짜 직원 B"), check_date: "2026-03-02" },
  ];
  const summary = buildDaySummaries([doc], rows, dates);
  assert.deepEqual(summary.map((day) => [day.docs[0].done, day.docs[0].signedOff]), [[1, false], [3, true], [0, false]]);
  // 한국은 UTC+9: UTC 로 전날 15:30 은 한국 날짜로 다음 날 00:30
  assert.equal(todayInSeoul(new Date("2026-03-01T15:30:00Z")), "2026-03-02");
  assert.equal(isCheckDate("2026-03-02"), true);
  assert.equal(isCheckDate("어제"), false);
});
