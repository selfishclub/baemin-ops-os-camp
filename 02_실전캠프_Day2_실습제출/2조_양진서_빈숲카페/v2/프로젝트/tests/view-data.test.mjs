import assert from "node:assert/strict";
import test from "node:test";
import {
  describeDevice,
  describeRow,
  groupByDate,
  isIdleExpired,
  isOutsideShop,
  matchesShopIp,
  parseIdleMinutes,
  parseShopIps,
  pickIp,
  seoulDate,
  summarizeByPerson,
} from "../app/manage/views/view-data.ts";

const headersOf = (map) => ({ get: (name) => map[name.toLowerCase()] ?? null });

test("picks the real visitor address from forwarding headers", () => {
  assert.equal(pickIp(headersOf({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" })), "203.0.113.5");
  assert.equal(pickIp(headersOf({ "x-real-ip": "::ffff:198.51.100.7" })), "198.51.100.7");
  assert.equal(pickIp(headersOf({})), "");
});

test("describes devices in plain Korean", () => {
  assert.equal(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"), "아이폰 · Safari");
  assert.equal(describeDevice("Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36"), "안드로이드 · Chrome");
  assert.equal(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0"), "윈도우 PC · Edge");
  assert.equal(describeDevice(""), "알 수 없는 기기");
});

test("shop address list: exact match or prefix ending with a dot; empty list means nobody is outside", () => {
  const patterns = parseShopIps(" 203.0.113.5 , 198.51.100. ");
  assert.deepEqual(patterns, ["203.0.113.5", "198.51.100."]);
  assert.equal(matchesShopIp("203.0.113.5", patterns), true);
  assert.equal(matchesShopIp("203.0.113.50", patterns), false);
  assert.equal(matchesShopIp("198.51.100.77", patterns), true);
  assert.equal(isOutsideShop("192.0.2.1", patterns), true);
  assert.equal(isOutsideShop("192.0.2.1", []), false);
  assert.equal(isOutsideShop("", patterns), true);
});

test("idle minutes: default 30, 0 turns it off, floor of 5", () => {
  assert.equal(parseIdleMinutes(undefined), 30);
  assert.equal(parseIdleMinutes(""), 30);
  assert.equal(parseIdleMinutes("0"), 0);
  assert.equal(parseIdleMinutes("2"), 5);
  assert.equal(parseIdleMinutes("45"), 45);
  assert.equal(parseIdleMinutes("abc"), 0);
  const now = Date.UTC(2026, 8, 24, 3, 0, 0);
  assert.equal(isIdleExpired(now - 31 * 60_000, now, 30), true);
  assert.equal(isIdleExpired(now - 29 * 60_000, now, 30), false);
  assert.equal(isIdleExpired(now - 999 * 60_000, now, 0), false);
  assert.equal(isIdleExpired(NaN, now, 30), false);
});

const row = (over) => ({ id: 1, user_id: "a", user_name: "직원 A", kind: "recipe", target_id: "demo-1", target_name: "(예시) 라떼", ip: "203.0.113.5", outside: false, device: "아이폰 · Safari", viewed_at: "2026-09-24T01:00:00.000Z", ...over });

test("summarizes per person with Seoul-day counts and outside/blocked counts", () => {
  const rows = [
    row({ id: 1, viewed_at: "2026-09-24T01:00:00.000Z" }),               // 9/24 10:00 KST
    row({ id: 2, kind: "manual", viewed_at: "2026-09-23T16:00:00.000Z" }), // 9/24 01:00 KST → 오늘
    row({ id: 3, kind: "media", outside: true, viewed_at: "2026-09-22T05:00:00.000Z" }),
    row({ id: 4, user_id: "b", user_name: "직원 B", kind: "blocked", outside: true, viewed_at: "2026-09-23T05:00:00.000Z" }),
  ];
  const staff = [{ id: "a", display_name: "직원 A", login_id: "a" }, { id: "b", display_name: "", login_id: "staff-b" }, { id: "c", display_name: "직원 C", login_id: "c" }];
  const summary = summarizeByPerson(rows, "2026-09-24", staff);
  assert.deepEqual(summary.map((item) => item.id), ["a", "b", "c"]);
  assert.equal(summary[0].todayCount, 2);
  assert.equal(summary[0].periodCount, 3);
  assert.equal(summary[0].outsideCount, 1);
  assert.equal(summary[0].lastKind, "recipe");
  assert.equal(summary[1].name, "staff-b");
  assert.equal(summary[1].blockedCount, 1);
  assert.equal(summary[2].lastAt, "");
});

test("groups rows by Seoul date, newest first", () => {
  const groups = groupByDate([
    row({ id: 1, viewed_at: "2026-09-22T05:00:00.000Z" }),
    row({ id: 2, viewed_at: "2026-09-23T16:30:00.000Z" }), // 9/24 01:30 KST
    row({ id: 3, viewed_at: "2026-09-23T05:00:00.000Z" }), // 9/23 14:00 KST
  ]);
  assert.deepEqual(groups.map((group) => group.date), ["2026-09-24", "2026-09-23", "2026-09-22"]);
  assert.equal(seoulDate("2026-09-23T15:30:00.000Z"), "2026-09-24");
  assert.equal(groups[0].rows[0].id, 2);
});

test("describes rows for the owner screen", () => {
  assert.equal(describeRow(row({})), "레시피 「(예시) 라떼」");
  assert.equal(describeRow(row({ kind: "chat", target_name: "라떼 얼마야" })), "물어보기: 라떼 얼마야");
  assert.equal(describeRow(row({ kind: "logout", target_name: "한동안 쓰지 않아 자동" })), "로그아웃 (한동안 쓰지 않아 자동)");
  assert.equal(describeRow(row({ kind: "blocked" })), "매장 밖에서 열려다 막힘");
});
