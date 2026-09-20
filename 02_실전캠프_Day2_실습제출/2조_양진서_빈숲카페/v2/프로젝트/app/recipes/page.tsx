import { requireActiveViewer } from "../auth";
import { checkSectionAccess } from "../../db/portal-store";
import LockedNotice from "../locked-notice";
import RecipesPage from "./recipes-page";
import { previewViewer, readPreviewRole } from "../preview/preview-role";

export const dynamic = "force-dynamic";

// 로그인·재직 확인과 영역 잠금 확인을 서버에서 하고, 화면(클라이언트 컴포넌트)에는 보는 사람 정보만 넘긴다.
export default async function RecipesRoute() {
  const session = await requireActiveViewer("/recipes");
  const access = await checkSectionAccess(session, "recipes");
  if (!access.allowed) return <LockedNotice title="레시피" />;
  // 미리보기(로그인 꺼짐)에서는 가짜 사람(미리보기 사장 / 직원 A)으로 본다
  const person = session.mode === "demo" ? previewViewer(await readPreviewRole()) : session.viewer;
  const viewer = person ? { displayName: person.displayName, role: person.role } : null;
  return <RecipesPage viewer={viewer} demo={session.mode === "demo"} lockedForStaff={access.locked} />;
}
