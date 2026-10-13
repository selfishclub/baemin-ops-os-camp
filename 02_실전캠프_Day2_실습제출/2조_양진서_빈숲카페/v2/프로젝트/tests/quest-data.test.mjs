import assert from "node:assert/strict";
import test from "node:test";
import { defaultRecipeContent } from "../app/recipes/recipe-data.ts";
import { readableManuals } from "../app/manual/manual-data.ts";
import { buildWeeklyQuests, countCleared, isCorrect, mergeProgress, previousWeekStart, publicQuest, seedOf, weekStartSeoul } from "../app/quest/quest-data.ts";

const content = defaultRecipeContent;
const docs = readableManuals(content);
const ctx = (userId, weekStart = "2026-10-05", practiced = [], read = []) => ({ userId, weekStart, content, docs, practicedRecipeIds: new Set(practiced), readDocIds: new Set(read) });

test("week start is Monday in Seoul time", () => {
  assert.equal(weekStartSeoul(new Date("2026-10-05T03:00:00.000Z")), "2026-10-05"); // 월 12:00 KST
  assert.equal(weekStartSeoul(new Date("2026-10-04T16:00:00.000Z")), "2026-10-05"); // 월 01:00 KST
  assert.equal(weekStartSeoul(new Date("2026-10-04T10:00:00.000Z")), "2026-09-28"); // 일 19:00 KST
  assert.equal(previousWeekStart("2026-10-05"), "2026-09-28");
});

test("same person + same week → same quests; different person or week → different", () => {
  const a1 = buildWeeklyQuests(ctx("staff-a"));
  const a2 = buildWeeklyQuests(ctx("staff-a"));
  const b = buildWeeklyQuests(ctx("staff-b"));
  const next = buildWeeklyQuests(ctx("staff-a", "2026-10-12"));
  assert.deepEqual(a1, a2);
  assert.equal(a1.length, 5);
  assert.deepEqual(a1.map((q) => q.kind), ["quiz", "quiz", "practice", "read", "mission"]);
  const sig = (list) => list.map((q) => q.id).join("|");
  assert.notEqual(sig(a1), sig(b));
  assert.notEqual(sig(a1), sig(next));
  assert.notEqual(seedOf("staff-a|2026-10-05"), seedOf("staff-b|2026-10-05"));
});

test("quiz quests carry 4 choices including the answer, and the public view drops the answer", () => {
  const quests = buildWeeklyQuests(ctx("staff-c"));
  for (const quiz of quests.filter((q) => q.kind === "quiz")) {
    assert.equal(quiz.choices.length, 4);
    assert.ok(quiz.choices.includes(quiz.answer));
    assert.equal(new Set(quiz.choices).size, 4);
    assert.equal(isCorrect(quiz, quiz.answer), true);
    assert.equal(isCorrect(quiz, quiz.choices.find((c) => c !== quiz.answer)), false);
    assert.equal("answer" in publicQuest(quiz), false);
  }
});

test("practice/read quests prefer things not yet done, and auto-complete from training records", () => {
  const all = buildWeeklyQuests(ctx("staff-a"));
  const practice = all.find((q) => q.kind === "practice");
  const read = all.find((q) => q.kind === "read");
  // 그 메뉴를 이미 만들어 봤다고 기록하면 다른 메뉴가 나온다
  const again = buildWeeklyQuests(ctx("staff-a", "2026-10-05", [practice.checkKey]));
  assert.notEqual(again.find((q) => q.kind === "practice").checkKey, practice.checkKey);
  // 전부 해 봤으면 "다시 만들어 보기"
  const everything = buildWeeklyQuests(ctx("staff-a", "2026-10-05", content.recipes.map((r) => r.id)));
  assert.match(everything.find((q) => q.kind === "practice").title, /다시 만들어 보기/);
  // 진행 합치기: 기록이 없어도 교육 체크가 있으면 done
  const views = mergeProgress(all, [{ quest_id: all[0].id, status: "done", attempts: 2, note: "", done_at: "2026-10-05T01:00:00Z", confirmed_at: null }], { practicedRecipeIds: new Set([practice.checkKey]), readDocIds: new Set([read.checkKey.replace(/^manual:/, "")]) });
  assert.equal(views[0].status, "done");
  assert.equal(views[0].attempts, 2);
  assert.equal(views.find((v) => v.kind === "practice").status, "done");
  assert.equal(views.find((v) => v.kind === "read").status, "done");
  assert.equal(views.find((v) => v.kind === "mission").status, "open");
  assert.equal(countCleared(views), 3);
  assert.ok(views.every((v) => !("answer" in v)));
});

test("done sets: before-week records pick quests, all records complete them", async () => {
  const { splitDoneSets } = await import("../db/quest-store.ts");
  const rows = [
    { recipe_id: "r-old", practiced_at: "2026-10-03T05:00:00Z" },   // 지난주
    { recipe_id: "r-new", practiced_at: "2026-10-06T05:00:00Z" },   // 이번 주
    { recipe_id: "manual:d-old", practiced_at: "2026-10-04T14:59:00Z" }, // 10/4 23:59 KST → 지난주
    { recipe_id: "manual:d-edge", practiced_at: "2026-10-04T15:00:00Z" }, // 10/5 00:00 KST → 이번 주
    { recipe_id: "exam:x:1", practiced_at: "2026-10-01T00:00:00Z" },
    { recipe_id: "r-none", practiced_at: null },
  ];
  const sets = splitDoneSets(rows, "2026-10-05");
  assert.deepEqual([...sets.before.practicedRecipeIds], ["r-old"]);
  assert.deepEqual([...sets.before.readDocIds], ["d-old"]);
  assert.deepEqual([...sets.all.practicedRecipeIds].sort(), ["r-new", "r-old"]);
  assert.deepEqual([...sets.all.readDocIds].sort(), ["d-edge", "d-old"]);
});
