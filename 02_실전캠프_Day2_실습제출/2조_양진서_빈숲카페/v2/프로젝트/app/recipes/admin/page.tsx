import { redirect } from "next/navigation";
import { requireActiveViewer } from "../../auth";
import AdminStudio from "./studio";
import OwnerOnlyNotice from "../../preview/owner-only-notice";
import { readPreviewRole } from "../../preview/preview-role";

export const dynamic = "force-dynamic";

export default async function RecipeAdminPage() {
  const session = await requireActiveViewer("/recipes/admin");
  // 로그인이 꺼진 시연·둘러보기 모드: 이 브라우저에만 저장되는 미리보기로 연다 (데이터 창고는 건드리지 않는다)
  if (session.mode === "demo" && (await readPreviewRole()) === "staff") return <OwnerOnlyNotice title="관리자 편집" />;
  if (session.mode === "demo") return <AdminStudio userName="미리보기 사장" preview />;
  if (session.viewer!.role !== "owner") redirect("/");
  return <AdminStudio userName={session.viewer!.displayName} />;
}
