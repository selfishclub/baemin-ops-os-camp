import assert from "node:assert/strict";
import test from "node:test";
import { breakdown, buildBoard, defaultLevels, emptyCounts, highlights, levelFor, periodStart, totalPoints } from "../app/score/score-data.ts";

const person = (id, name, over = {}, role = "staff", active = true) => ({ ...emptyCounts({ id, display_name: name, login_id: id, role, active }), ...over });

test("points add up per category with the published weights", () => {
  const a = person("a", "직원 A", { checks: 10, acks: 2, docs_read: 3, practiced_recipes: 2, quiz_passed: 1, exam_written: 1, reads: 50 });
  // 10 + 2 + 3 + 4 + 3 + 10 = 32 (열람 reads 는 점수가 아니다)
  assert.equal(totalPoints(a), 32);
  const items = breakdown(a);
  assert.equal(items.find((item) => item.key === "exam_written").points, 10);
  assert.equal(items.some((item) => item.key === "reads"), false);
});

test("levels: thresholds, progress and distance to the next level", () => {
  assert.equal(levelFor(0).level.name, "새싹");
  assert.equal(levelFor(29).next.name, "원두");
  assert.equal(levelFor(29).toNext, 1);
  assert.equal(levelFor(30).level.name, "원두");
  assert.equal(levelFor(55).progress, 0.5);
  const top = levelFor(999);
  assert.equal(top.level.name, defaultLevels.at(-1).name);
  assert.equal(top.next, null);
  assert.equal(top.progress, 1);
});

test("board ranks staff by period points, ties share a rank, owner and inactive are excluded", () => {
  const all = [
    person("owner", "사장", { checks: 99 }, "owner"),
    person("a", "직원 A", { checks: 40 }),
    person("b", "직원 B", { checks: 10, exam_written: 1 }),
    person("c", "직원 C", { checks: 5 }),
    person("d", "직원 D", { checks: 300 }, "staff", false),
  ];
  const period = [person("a", "직원 A", { checks: 4 }), person("b", "직원 B", { checks: 4 }), person("c", "직원 C", { checks: 1 })];
  const board = buildBoard(all, period);
  assert.deepEqual(board.map((row) => row.name), ["직원 A", "직원 B", "직원 C"]);
  assert.deepEqual(board.map((row) => row.rank), [1, 1, 3]);
  assert.equal(board[0].level.level.name, "원두");
  assert.equal(board[1].allTime, 20);
});

test("highlights name the top person per category and skip zero", () => {
  const rows = [person("a", "직원 A", { checks: 3, reads: 9 }), person("b", "직원 B", { checks: 7 }), person("o", "사장", { checks: 100 }, "owner")];
  const result = highlights(rows);
  assert.equal(result.find((item) => item.key === "checks").name, "직원 B");
  assert.equal(result.find((item) => item.key === "reads").name, "직원 A");
  assert.equal(result.some((item) => item.key === "quiz_passed"), false);
});

test("period start is Seoul-based: month = 1st 00:00 KST, week = Monday 00:00 KST", () => {
  const now = new Date("2026-10-05T03:00:00.000Z"); // 10/5(월) 12:00 KST
  assert.equal(periodStart("month", now), "2026-09-30T15:00:00.000Z");
  assert.equal(periodStart("week", now), "2026-10-04T15:00:00.000Z");
  const sunday = new Date("2026-10-04T10:00:00.000Z"); // 10/4(일) 19:00 KST → 그 주 월요일 9/28
  assert.equal(periodStart("week", sunday), "2026-09-27T15:00:00.000Z");
  assert.equal(periodStart("all", now), null);
});
