import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActiveViewer } from "../../auth";
import { envLockedSections } from "../../../db/portal-store";
import MenuLocks from "./menu-locks";

export const dynamic = "force-dynamic";

// 관리자 화면: 큰 메뉴마다 직원에게 열림/잠김을 정한다 (사장만)
export default async function MenuLockPage() {
  const session = await requireActiveViewer("/manage/menus");
  if (session.mode === "demo") {
    const fixed = envLockedSections();
    return (
      <main style={{ maxWidth: 720, margin: "0 auto", padding: 32, fontFamily: "system-ui", lineHeight: 1.7, color: "#29332c" }}>
        <h1>메뉴 잠금 설정</h1>
        <p>지금은 로그인이 꺼진 둘러보기(시연) 모드라 이 화면에서 바꿀 수 없어요. 메뉴별 잠금은 사장 계정으로 로그인했을 때 여기서 정합니다.</p>
        <p>로그인이 꺼진 상태에서 잠그려면 서버 설정 <code>LOCKED_SECTIONS</code>에 메뉴 이름을 넣고 다시 배포하면 됩니다. 지금 고정 잠금: <strong>{fixed.length ? fixed.join(", ") : "없음 (전부 열림)"}</strong></p>
        <p><Link href="/">← 빈숲 OS 홈</Link></p>
      </main>
    );
  }
  if (session.viewer!.role !== "owner") redirect("/");
  return <MenuLocks />;
}
