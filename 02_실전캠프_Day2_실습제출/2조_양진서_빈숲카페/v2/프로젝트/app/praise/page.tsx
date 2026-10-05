import { requireActiveViewer } from "../auth";
import { checkSectionAccess } from "../../db/portal-store";
import LockedNotice from "../locked-notice";
import { previewViewer, readPreviewRole } from "../preview/preview-role";
import PraiseWall from "./praise-wall";

export const dynamic = "force-dynamic";

// 칭찬 릴레이: 하루 한 장, 이름으로. 로그인·재직·잠금을 서버에서 확인한다.
export default async function PraisePage() {
  const session = await requireActiveViewer("/praise");
  const access = await checkSectionAccess(session, "praise");
  if (!access.allowed) return <LockedNotice title="칭찬 릴레이" />;
  const person = session.mode === "demo" ? previewViewer(await readPreviewRole()) : session.viewer!;
  return <PraiseWall preview={session.mode === "demo"} role={person.role} />;
}
