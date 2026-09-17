import { getRecipeDb, readPublishedContent } from "../../../db/recipe-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const content = await readPublishedContent(getRecipeDb());
    return Response.json({ content, source: getRecipeDb() ? "database" : "verified-seed" });
  } catch {
    return Response.json(
      { error: "공식 레시피 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 503 },
    );
  }
}
