import { requireActiveViewer } from "../../auth";
import { previewViewer, readPreviewRole } from "../../preview/preview-role";
import TrainingPage from "./training-page";
import { checkSectionAccess } from "../../../db/portal-store";
import LockedNotice from "../../locked-notice";

export const dynamic = "force-dynamic";

// 신입 메뉴 체크리스트 + 레시피 퀴즈. 직원은 내 것, 사장은 직원별로 본다.
export default async function TrainingRoute() {
  const session = await requireActiveViewer("/recipes/training");
  const access = await checkSectionAccess(session, "training");
  if (!access.allowed) return <LockedNotice title="신입 교육 경로" />;
  // 로그인이 꺼진 시연·둘러보기 모드: 가짜 사람으로, 이 브라우저에만 저장되는 미리보기
  if (session.mode === "demo") return <TrainingPage viewer={previewViewer(await readPreviewRole())} preview />;
  const viewer = session.viewer!;
  return <TrainingPage viewer={{ id: viewer.id, displayName: viewer.displayName, role: viewer.role }} />;
}
