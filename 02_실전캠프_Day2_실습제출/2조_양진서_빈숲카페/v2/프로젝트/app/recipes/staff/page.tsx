import { redirect } from "next/navigation";
import { requireActiveViewer } from "../../auth";
import OwnerOnlyNotice from "../../preview/owner-only-notice";
import { readPreviewRole } from "../../preview/preview-role";
import StaffManager from "./staff-manager";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const session = await requireActiveViewer("/recipes/staff");
  // 로그인이 꺼진 시연·둘러보기 모드: 가짜 직원으로, 이 브라우저에만 저장되는 미리보기
  if (session.mode === "demo") return (await readPreviewRole()) === "owner" ? <StaffManager preview /> : <OwnerOnlyNotice title="직원 계정 관리" />;
  if (session.viewer!.role !== "owner") redirect("/");
  return <StaffManager />;
}
