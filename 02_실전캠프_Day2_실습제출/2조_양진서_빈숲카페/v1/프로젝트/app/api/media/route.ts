import { getRecipeMediaBucket } from "../../../db/recipe-store";

export const dynamic = "force-dynamic";

function validKey(value: string) {
  return /^recipes\/[a-zA-Z0-9._-]+\/[a-f0-9-]+\.(?:jpe?g|png|webp|avif)$/.test(value);
}

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!validKey(key)) return Response.json({ error: "올바르지 않은 이미지 주소입니다." }, { status: 400 });
  const bucket = getRecipeMediaBucket();
  if (!bucket) return Response.json({ error: "이미지 저장소가 연결되지 않았습니다." }, { status: 503 });
  const object = await bucket.get(key);
  if (!object) return Response.json({ error: "이미지를 찾을 수 없습니다." }, { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}
