import { requireActiveViewer } from "../auth";
import { checkSectionAccess } from "../../db/portal-store";
import LockedNotice from "../locked-notice";
import { previewViewer, readPreviewRole } from "../preview/preview-role";
import CheckBoard from "./check-board";

export const dynamic = "force-dynamic";

// 오늘 체크: 오픈·마감처럼 매일 하는 일을 항목마다 누르고, 누가 언제 했는지 남긴다.
export default async function ChecksRoute() {
  const session = await requireActiveViewer("/checks");
  const access = await checkSectionAccess(session, "checks");
  if (!access.allowed) return <LockedNotice title="오늘 체크" />;
  const person = session.mode === "demo" ? previewViewer(await readPreviewRole()) : session.viewer!;
  return <CheckBoard role={person.role} preview={session.mode === "demo"} />;
}
