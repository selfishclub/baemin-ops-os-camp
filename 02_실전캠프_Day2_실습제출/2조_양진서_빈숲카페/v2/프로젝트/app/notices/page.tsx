import { requireActiveViewer } from "../auth";
import { checkSectionAccess } from "../../db/portal-store";
import LockedNotice from "../locked-notice";
import { previewViewer, readPreviewRole } from "../preview/preview-role";
import NoticeBoard from "./notice-board";

export const dynamic = "force-dynamic";

// 공지 · 변경 이력: 레시피와 매뉴얼이 바뀌면 여기 모이고, 직원이 하나씩 "확인했어요"를 누른다.
export default async function NoticesRoute() {
  const session = await requireActiveViewer("/notices");
  const access = await checkSectionAccess(session, "notice");
  if (!access.allowed) return <LockedNotice title="공지 · 변경 이력" />;
  const person = session.mode === "demo" ? previewViewer(await readPreviewRole()) : session.viewer!;
  return <NoticeBoard role={person.role} demo={session.mode === "demo"} />;
}
