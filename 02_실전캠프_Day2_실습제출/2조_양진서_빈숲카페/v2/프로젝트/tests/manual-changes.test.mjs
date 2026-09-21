import assert from "node:assert/strict";
import test from "node:test";
import { changedManuals, defaultManuals, stableStringify } from "../app/manual/manual-data.ts";

// 로그인 모드 점검에서 찾은 버그를 다시 못 나오게: 데이터 창고(Postgres jsonb)는 저장하면서 항목 순서를 바꾼다.
// 문서 1장만 고쳤는데 "바뀐 문서" 알림이 전부(25장) 나갔었다.

// jsonb 가 하듯이 항목 순서를 뒤섞는다 (길이순·가나다순)
function likeJsonb(value) {
  if (Array.isArray(value)) return value.map(likeJsonb);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort((a, b) => a.length - b.length || (a < b ? -1 : 1)).map((key) => [key, likeJsonb(value[key])]));
  }
  return value;
}

test("the same content in a different key order is not a change", () => {
  assert.equal(stableStringify({ b: 1, a: [{ y: 2, x: 1 }] }), stableStringify({ a: [{ x: 1, y: 2 }], b: 1 }));
  assert.notEqual(stableStringify({ a: [1, 2] }), stableStringify({ a: [2, 1] }));
  // 빈 칸은 없는 것과 같다 (편집기가 빈 사진 목록을 undefined 로, 창고가 아예 빼고 돌려준다)
  assert.equal(stableStringify({ a: 1, images: undefined, videos: [] }), stableStringify({ a: 1 }));
});

test("publishing after one edited document notifies exactly that document, even after a database round trip", () => {
  const stored = likeJsonb(JSON.parse(JSON.stringify(defaultManuals)));
  // 아무것도 안 고침: 코드의 예시(처음 상태) ↔ 창고에서 돌아온 같은 내용
  assert.deepEqual(changedManuals({}, { manuals: stored }), []);
  // 한 장만 고침
  const edited = stored.map((doc) => (doc.id === "demo-open-prep" ? { ...doc, title: `${doc.title} (고침)` } : doc));
  assert.deepEqual(changedManuals({}, { manuals: edited }).map((doc) => doc.id), ["demo-open-prep"]);
  // 새 문서는 알림 대상
  const added = [...stored, { ...stored[0], id: "fake-new", title: "가짜 새 문서" }];
  assert.deepEqual(changedManuals({ manuals: stored }, { manuals: added }).map((doc) => doc.id), ["fake-new"]);
});
