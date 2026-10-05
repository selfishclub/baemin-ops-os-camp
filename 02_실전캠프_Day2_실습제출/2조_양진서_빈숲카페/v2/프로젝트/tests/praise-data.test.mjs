import assert from "node:assert/strict";
import test from "node:test";
import { praiseMaxLength, sentToday, shouldRelay, summarizePraise, validatePraise } from "../app/praise/praise-data.ts";

const row = (id, from, to, created_at, text = "고마워요") => ({ id, from_user: from, from_name: from, to_user: to, to_name: to, text, created_at });

test("validates praise: target, not self, non-empty, length", () => {
  assert.equal(validatePraise({ fromUser: "a", toUser: "", text: "x" }), "누구를 칭찬할지 골라 주세요.");
  assert.match(validatePraise({ fromUser: "a", toUser: "a", text: "x" }), /자기 자신/);
  assert.match(validatePraise({ fromUser: "a", toUser: "b", text: "   " }), /한 줄/);
  assert.match(validatePraise({ fromUser: "a", toUser: "b", text: "가".repeat(praiseMaxLength + 1) }), /까지/);
  assert.equal(validatePraise({ fromUser: "a", toUser: "b", text: "좋아요" }), null);
});

test("one praise per Seoul day", () => {
  const rows = [row(1, "a", "b", "2026-10-05T14:59:00.000Z")]; // 10/5 23:59 KST
  assert.equal(sentToday(rows, "a", "2026-10-05"), true);
  assert.equal(sentToday(rows, "a", "2026-10-06"), false);
  assert.equal(sentToday(rows, "b", "2026-10-05"), false);
});

test("summary counts received and given per person, sorted by received", () => {
  const rows = [row(1, "a", "b", "2026-10-05T01:00:00Z"), row(2, "c", "b", "2026-10-05T02:00:00Z"), row(3, "b", "a", "2026-10-05T03:00:00Z")];
  const staff = [{ id: "a", display_name: "직원 A", login_id: "a" }, { id: "b", display_name: "", login_id: "staff-b" }, { id: "c", display_name: "직원 C", login_id: "c" }];
  const summary = summarizePraise(rows, staff);
  assert.deepEqual(summary.map((item) => [item.name, item.received, item.given]), [["staff-b", 2, 1], ["직원 A", 1, 1], ["직원 C", 0, 1]]);
  assert.equal(summary[0].lastReceived, "2026-10-05T02:00:00Z");
});

test("relay nudge: received today but not yet sent", () => {
  const rows = [row(1, "a", "b", "2026-10-05T01:00:00Z")];
  assert.equal(shouldRelay(rows, "b", "2026-10-05"), true);
  assert.equal(shouldRelay(rows, "a", "2026-10-05"), false);
  assert.equal(shouldRelay([...rows, row(2, "b", "c", "2026-10-05T02:00:00Z")], "b", "2026-10-05"), false);
});
