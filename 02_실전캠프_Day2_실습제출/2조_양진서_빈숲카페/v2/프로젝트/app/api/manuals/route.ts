import { getViewerSession } from "../../auth";
import { readPublishedContent } from "../../../db/recipe-store";
import { checkSectionAccess, lockedResponse } from "../../../db/portal-store";
import { isManualSection, readableManuals } from "../../manual/manual-data";

export const dynamic = "force-dynamic";

// 운영 매뉴얼 문서. 한 번에 한 영역(?section=open)만 준다 — 잠긴 영역의 문서는 나가지 않는다.
export async function GET(request: Request) {
  const section = new URL(request.url).searchParams.get("section") ?? "";
  if (!isManualSection(section)) return Response.json({ error: "어느 영역인지 없습니다." }, { status: 400 });
  try {
    const session = await getViewerSession();
    if (session.mode === "auth") {
      if (!session.viewer) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
      if (!session.viewer.active) return Response.json({ error: "사용이 중지된 계정입니다." }, { status: 403 });
    }
    if (!(await checkSectionAccess(session, section)).allowed) return lockedResponse();
    const content = await readPublishedContent(session.mode === "auth" ? session.db : null);
    return Response.json({ docs: readableManuals(content).filter((doc) => doc.sectionId === section), source: session.mode === "demo" ? "demo" : "database" });
  } catch {
    return Response.json({ error: "매뉴얼을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503 });
  }
}
