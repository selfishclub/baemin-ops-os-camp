import {
  getRecipeDb,
  getRecipeMediaBucket,
  requireRecipeAdmin,
} from "../../../../db/recipe-store";

export const dynamic = "force-dynamic";

const maxImageBytes = 8 * 1024 * 1024;
const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

function safeRecipeId(value: string) {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "menu";
}

function hasExpectedSignature(bytes: Uint8Array, contentType: string) {
  if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png") return bytes.slice(0, 4).every((byte, index) => byte === [0x89, 0x50, 0x4e, 0x47][index]);
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (contentType === "image/webp") return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  if (contentType === "image/avif") return ascii(4, 12) === "ftypavif" || ascii(4, 12) === "ftypavis";
  return false;
}

export async function POST(request: Request) {
  const db = getRecipeDb();
  const bucket = getRecipeMediaBucket();
  if (!db || !bucket) return Response.json({ error: "이미지 저장소가 아직 연결되지 않았습니다." }, { status: 503 });
  const actor = await requireRecipeAdmin(request, db);
  if (!actor) return Response.json({ error: "관리자 권한이 없습니다." }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  const recipeId = String(form.get("recipeId") ?? "");
  if (!(file instanceof File) || !recipeId) return Response.json({ error: "사진 파일과 메뉴 ID가 필요합니다." }, { status: 400 });
  const extension = extensions[file.type];
  if (!extension) return Response.json({ error: "JPG, PNG, WEBP, AVIF 사진만 올릴 수 있습니다." }, { status: 415 });
  if (file.size <= 0 || file.size > maxImageBytes) return Response.json({ error: "사진은 한 장당 8MB 이하여야 합니다." }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasExpectedSignature(bytes, file.type)) return Response.json({ error: "이미지 파일 형식을 확인해 주세요." }, { status: 415 });

  const objectId = crypto.randomUUID();
  const key = `recipes/${safeRecipeId(recipeId)}/${objectId}.${extension}`;
  await bucket.put(key, bytes, { httpMetadata: { contentType: file.type } });
  const alt = file.name.replace(/\.[^.]+$/, "").trim() || "음료 사진";
  await db.prepare(`INSERT INTO recipe_audit_log
    (action, actor_id, actor_email, details_json, created_at) VALUES ('image_uploaded', ?, ?, ?, ?)`).bind(
      actor.id,
      actor.email,
      JSON.stringify({ recipeId, key, size: file.size, contentType: file.type }),
      new Date().toISOString(),
    ).run();
  return Response.json({ image: { id: objectId, url: `/api/media?key=${encodeURIComponent(key)}`, alt, caption: "" } }, { status: 201 });
}
