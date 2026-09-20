import { requireActiveViewer } from "../auth";
import { checkSectionAccess } from "../../db/portal-store";
import LockedNotice from "../locked-notice";
import { previewViewer, readPreviewRole } from "../preview/preview-role";
import ExamPage from "./exam-page";

export const dynamic = "force-dynamic";

// 시험 · 인증 · 승급. 평소에는 잠가 두고 시험 볼 때만 여는 영역 (관리의 "메뉴 잠금 설정").
export default async function ExamRoute() {
  const session = await requireActiveViewer("/exam");
  const access = await checkSectionAccess(session, "exam");
  if (!access.allowed) return <LockedNotice title="시험 · 인증" />;
  const person = session.mode === "demo" ? previewViewer(await readPreviewRole()) : session.viewer!;
  return <ExamPage role={person.role} preview={session.mode === "demo"} lockedForStaff={access.locked} />;
}
