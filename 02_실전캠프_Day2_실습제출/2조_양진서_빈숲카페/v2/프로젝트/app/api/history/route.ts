import { getViewerSession } from "../../auth";
import { buildRecipeHistory } from "../../recipes/history";
import type { RecipeContent } from "../../recipes/recipe-data";

export const dynamic = "force-dynamic";

// 한 메뉴의 변경 이력 (버전 사이 이전 값 → 지금 값). 로그인한 재직 직원만.
export async function GET(request: Request) {
  const recipeId = new URL(request.url).searchParams.get("recipe") ?? "";
  if (!recipeId) return Response.json({ error: "어떤 메뉴인지 없습니다." }, { status: 400 });
  const session = await getViewerSession();
  if (session.mode === "demo") return Response.json({ history: [], demo: true });
  if (!session.viewer) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!session.viewer.active) return Response.json({ error: "사용이 중지된 계정입니다." }, { status: 403 });

  const { data, error } = await session.db
    .from("recipe_versions")
    .select("version, content_json, change_reason, published_by, published_at")
    .order("version", { ascending: false })
    .limit(30);
  if (error) return Response.json({ error: `변경 이력을 읽지 못했습니다: ${error.message}` }, { status: 503 });

  const versions = (data ?? [])
    .map((row) => ({
      version: row.version as number,
      published_at: row.published_at as string,
      change_reason: row.change_reason as string,
      published_by: row.published_by as string,
      recipes: ((row.content_json as RecipeContent | null)?.recipes ?? []),
    }))
    .reverse();
  return Response.json({ history: buildRecipeHistory(recipeId, versions) });
}
