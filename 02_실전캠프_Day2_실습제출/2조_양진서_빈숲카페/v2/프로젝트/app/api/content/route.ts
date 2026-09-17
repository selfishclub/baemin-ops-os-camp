import { getViewerSession } from "../../auth";
import { readPublishedContent } from "../../../db/recipe-store";

export const dynamic = "force-dynamic";

// 직원 화면이 읽는 공식 레시피. 로그인한 재직 직원만. 열쇠가 없으면 시연용 가짜 데이터.
export async function GET() {
  try {
    const session = await getViewerSession();
    if (session.mode === "demo") {
      return Response.json({ content: await readPublishedContent(null), source: "demo" });
    }
    if (!session.viewer) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
    if (!session.viewer.active) return Response.json({ error: "사용이 중지된 계정입니다." }, { status: 403 });
    const content = await readPublishedContent(session.db);
    return Response.json({ content, source: "database" });
  } catch {
    return Response.json(
      { error: "공식 레시피 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 503 },
    );
  }
}
