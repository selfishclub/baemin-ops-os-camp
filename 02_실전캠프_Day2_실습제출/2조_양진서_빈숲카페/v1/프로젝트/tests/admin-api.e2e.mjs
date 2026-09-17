import assert from "node:assert/strict";

const baseUrl = process.env.RECIPE_TEST_URL ?? "http://localhost:3000";
const headers = {
  "content-type": "application/json",
  "x-beansoop-admin": "owner@local.test",
};

const initialResponse = await fetch(`${baseUrl}/api/admin/content`, { headers });
assert.equal(initialResponse.status, 200);
const initial = await initialResponse.json();
assert.ok(initial.content.recipes.length >= 1);

const saveResponse = await fetch(`${baseUrl}/api/admin/content`, {
  method: "PUT",
  headers,
  body: JSON.stringify({ content: initial.content, revision: initial.revision }),
});
assert.equal(saveResponse.status, 200);
const saved = await saveResponse.json();
assert.equal(saved.revision, initial.revision + 1);

const staleResponse = await fetch(`${baseUrl}/api/admin/content`, {
  method: "PUT",
  headers,
  body: JSON.stringify({ content: initial.content, revision: initial.revision }),
});
assert.equal(staleResponse.status, 409);

const publishResponse = await fetch(`${baseUrl}/api/admin/publish`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    revision: saved.revision,
    changeReason: "관리 API 통합 테스트",
    effectiveAt: "2026-08-19",
  }),
});
assert.equal(publishResponse.status, 200);
const published = await publishResponse.json();
assert.ok(published.version > initial.publishedVersion);

const publicResponse = await fetch(`${baseUrl}/api/content`);
assert.equal(publicResponse.status, 200);
const publicPayload = await publicResponse.json();
assert.equal(publicPayload.source, "database");
assert.equal(publicPayload.content.recipes.length, initial.content.recipes.length);

const restoreResponse = await fetch(`${baseUrl}/api/admin/restore`, {
  method: "POST",
  headers,
  body: JSON.stringify({ version: initial.publishedVersion, revision: published.revision }),
});
assert.equal(restoreResponse.status, 200);

console.log("Recipe admin API integration flow passed.");
