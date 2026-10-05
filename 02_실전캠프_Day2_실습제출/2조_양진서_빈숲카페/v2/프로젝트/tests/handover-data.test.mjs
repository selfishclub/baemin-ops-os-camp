import assert from "node:assert/strict";
import test from "node:test";
import { buildHandoverViews, handoverMaxLength, unreadCount, validateHandover } from "../app/handover/handover-data.ts";

test("validates shift and text", () => {
  assert.match(validateHandover({ shift: "nope", text: "x" }), /교대/);
  assert.match(validateHandover({ shift: "open", text: "  " }), /적어/);
  assert.match(validateHandover({ shift: "close", text: "가".repeat(handoverMaxLength + 1) }), /까지/);
  assert.equal(validateHandover({ shift: "close", text: "우유 2팩 남음" }), null);
});

test("views: read-by-me, mine, and who has not read yet (active staff only, author excluded)", () => {
  const staff = [
    { id: "a", display_name: "직원 A", login_id: "a", active: true, role: "staff" },
    { id: "b", display_name: "", login_id: "staff-b", active: true, role: "staff" },
    { id: "c", display_name: "직원 C", login_id: "c", active: false, role: "staff" },
    { id: "o", display_name: "사장", login_id: "o", active: true, role: "owner" },
  ];
  const rows = [
    { id: 1, author_id: "a", author_name: "직원 A", shift: "close", text: "우유 2팩", created_at: "2026-10-05T12:00:00Z", reads: [{ user_id: "o", user_name: "사장", read_at: "2026-10-05T13:00:00Z" }] },
    { id: 2, author_id: "b", author_name: "직원 B", shift: "open", text: "원두 교체", created_at: "2026-10-05T01:00:00Z", reads: [] },
  ];
  const views = buildHandoverViews(rows, "a", staff);
  assert.equal(views[0].mine, true);
  assert.equal(views[0].readByMe, false);
  assert.deepEqual(views[0].unreadNames, ["staff-b"]);
  assert.equal(views[1].mine, false);
  assert.deepEqual(views[1].unreadNames, ["직원 A", "사장"]);
  assert.equal(unreadCount(views), 1);
  assert.equal(unreadCount(buildHandoverViews(rows, "o", staff)), 1);
});
