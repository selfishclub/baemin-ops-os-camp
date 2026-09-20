import type { SupabaseClient } from "@supabase/supabase-js";
import type { Viewer } from "../app/auth";
import { manualNoticePrefix, manualSectionIds, readableManuals } from "../app/manual/manual-data";
import { allowedSections } from "./portal-store";
import { listMyChangeNotices, readPublishedContent } from "./recipe-store";

// 직원이 받는 "바뀐 내용" 알림: 레시피와 매뉴얼 문서·응대 카드가 한 목록에 나온다.
// 그 사람에게 잠긴 영역의 것은 뺀다 — 문서 제목만으로도 잠근 내용이 드러나지 않게. 지워진 문서의 알림도 뺀다.
export async function listVisibleNotices(db: SupabaseClient, viewer: Viewer) {
  const [mine, content, allowed] = await Promise.all([
    listMyChangeNotices(db, viewer.id),
    readPublishedContent(db),
    allowedSections({ mode: "auth", viewer, db }, ["recipes", ...manualSectionIds]),
  ]);
  const sectionOf = new Map(readableManuals(content).map((doc) => [doc.id, doc.sectionId]));
  const notices = mine.notices
    .map((notice) => {
      if (!notice.recipe_id.startsWith(manualNoticePrefix)) return allowed.has("recipes") ? { ...notice, kind: "recipe" as const, href: "/recipes" } : null;
      const docId = notice.recipe_id.slice(manualNoticePrefix.length);
      const sectionId = sectionOf.get(docId);
      return sectionId && allowed.has(sectionId) ? { ...notice, kind: "manual" as const, href: `/manual/${sectionId}?doc=${encodeURIComponent(docId)}` } : null;
    })
    .filter((notice) => notice !== null);
  return { notices, pending: notices.filter((notice) => !notice.acked).length };
}
