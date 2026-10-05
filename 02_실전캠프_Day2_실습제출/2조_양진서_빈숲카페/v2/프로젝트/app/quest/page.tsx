import { requireActiveViewer } from "../auth";
import { checkSectionAccess } from "../../db/portal-store";
import LockedNotice from "../locked-notice";
import { previewViewer, readPreviewRole } from "../preview/preview-role";
import QuestBoard from "./quest-board";

export const dynamic = "force-dynamic";

// 이번 주 퀘스트: 사람마다 다른 문제·미션. 로그인·재직·잠금을 서버에서 확인한다.
export default async function QuestPage() {
  const session = await requireActiveViewer("/quest");
  const access = await checkSectionAccess(session, "quest");
  if (!access.allowed) return <LockedNotice title="이번 주 퀘스트" />;
  const person = session.mode === "demo" ? previewViewer(await readPreviewRole()) : session.viewer!;
  return <QuestBoard preview={session.mode === "demo"} role={person.role} />;
}
