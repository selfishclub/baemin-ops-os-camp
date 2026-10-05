import { redirect } from "next/navigation";
import { requireActiveViewer } from "../../auth";
import OwnerOnlyNotice from "../../preview/owner-only-notice";
import { readPreviewRole } from "../../preview/preview-role";
import ViewBoard from "./view-board";

export const dynamic = "force-dynamic";

// 사장용: 열람 기록 — 누가 언제 어떤 레시피·매뉴얼·사진을 봤는지, 어디서 들어왔는지
export default async function ViewsPage() {
  const session = await requireActiveViewer("/manage/views");
  // 로그인이 꺼진 시연·둘러보기 모드: 가짜 기록으로 화면만 보여 준다
  if (session.mode === "demo") return (await readPreviewRole()) === "owner" ? <ViewBoard preview /> : <OwnerOnlyNotice title="열람 기록" />;
  if (session.viewer!.role !== "owner") redirect("/");
  return <ViewBoard />;
}
