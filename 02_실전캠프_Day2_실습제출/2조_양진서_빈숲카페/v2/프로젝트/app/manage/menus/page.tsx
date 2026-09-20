import { redirect } from "next/navigation";
import { requireActiveViewer } from "../../auth";
import { previewLockCookie, readPreviewMenuTable } from "../../../db/portal-store";
import MenuLocks from "./menu-locks";
import OwnerOnlyNotice from "../../preview/owner-only-notice";
import { readPreviewRole } from "../../preview/preview-role";

export const dynamic = "force-dynamic";

// 관리자 화면: 큰 메뉴마다 직원에게 열림/잠김을 정한다 (사장만)
export default async function MenuLockPage() {
  const session = await requireActiveViewer("/manage/menus");
  // 로그인이 꺼진 시연·둘러보기 모드: 이 브라우저(쿠키)에만 저장되는 미리보기
  if (session.mode === "demo" && (await readPreviewRole()) === "staff") return <OwnerOnlyNotice title="메뉴 잠금 설정" />;
  if (session.mode === "demo") return <MenuLocks preview previewCookie={previewLockCookie} initialMenus={await readPreviewMenuTable()} />;
  if (session.viewer!.role !== "owner") redirect("/");
  return <MenuLocks />;
}
