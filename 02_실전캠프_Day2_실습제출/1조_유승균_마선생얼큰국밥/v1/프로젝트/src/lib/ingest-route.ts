import type { NextRequest } from "next/server";
import { ingestPayload } from "./ingest";
import { errorMessage, fail, ok } from "./http";
import { IngestPayloadSchema } from "./types";

/** 크롬 확장 '어드민 전송' 및 크롤러 스크립트가 호출하는 수집 API 처리 */
export async function handleIngest(req: NextRequest) {
  const expected = process.env.INGEST_TOKEN?.trim();
  if (expected) {
    const got = req.headers.get("x-extension-token") || "";
    if (got !== expected) return fail("연동 토큰이 올바르지 않습니다.", 401);
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("JSON 본문을 읽지 못했습니다.");
  }
  const parsed = IngestPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return fail("입력 형식이 올바르지 않습니다: " + parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join(", "));
  }
  try {
    const res = await ingestPayload(parsed.data);
    return ok({ ...res, message: `${res.total}개 중 새 리뷰 ${res.inserted}개 저장, ${res.updated}개 갱신` });
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}
