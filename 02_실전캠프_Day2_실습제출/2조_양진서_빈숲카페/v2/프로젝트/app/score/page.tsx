import { requireActiveViewer } from "../auth";
import { checkSectionAccess } from "../../db/portal-store";
import LockedNotice from "../locked-notice";
import { previewViewer, readPreviewRole } from "../preview/preview-role";
import ScoreBoard from "./score-board";

export const dynamic = "force-dynamic";

// 레벨 · 점수판: 직원은 내 레벨과 점수판, 사장은 통계까지. 로그인·재직·잠금을 서버에서 확인한다.
export default async function ScorePage() {
  const session = await requireActiveViewer("/score");
  const access = await checkSectionAccess(session, "score");
  if (!access.allowed) return <LockedNotice title="레벨 · 점수판" />;
  const person = session.mode === "demo" ? previewViewer(await readPreviewRole()) : session.viewer!;
  return <ScoreBoard preview={session.mode === "demo"} role={person.role} />;
}
