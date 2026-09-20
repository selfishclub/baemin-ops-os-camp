import { redirect } from "next/navigation";
import { requireActiveViewer } from "../../auth";
import OwnerOnlyNotice from "../../preview/owner-only-notice";
import { readPreviewRole } from "../../preview/preview-role";
import ChangeStatus from "./change-status";

export const dynamic = "force-dynamic";

// 사장용: 바뀐 레시피마다 누가 확인했고 누가 안 봤는지
export default async function ChangesPage() {
  const session = await requireActiveViewer("/recipes/changes");
  // 로그인이 꺼진 시연·둘러보기 모드: 이 브라우저에만 저장되는 미리보기
  if (session.mode === "demo") return (await readPreviewRole()) === "owner" ? <ChangeStatus preview /> : <OwnerOnlyNotice title="확인 현황" />;
  if (session.viewer!.role !== "owner") redirect("/");
  return <ChangeStatus />;
}
