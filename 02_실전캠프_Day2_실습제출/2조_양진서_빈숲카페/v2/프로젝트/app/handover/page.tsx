import { requireActiveViewer } from "../auth";
import { checkSectionAccess } from "../../db/portal-store";
import LockedNotice from "../locked-notice";
import { previewViewer, readPreviewRole } from "../preview/preview-role";
import HandoverBoard from "./handover-board";

export const dynamic = "force-dynamic";

// 인수인계: 교대할 때 다음 근무자에게 남기는 메모 + 읽음 확인
export default async function HandoverPage() {
  const session = await requireActiveViewer("/handover");
  const access = await checkSectionAccess(session, "handover");
  if (!access.allowed) return <LockedNotice title="인수인계" />;
  const person = session.mode === "demo" ? previewViewer(await readPreviewRole()) : session.viewer!;
  return <HandoverBoard preview={session.mode === "demo"} role={person.role} />;
}
