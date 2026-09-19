import Link from "next/link";
import { requireActiveViewer } from "../../auth";
import TrainingPage from "./training-page";
import { checkSectionAccess } from "../../../db/portal-store";
import LockedNotice from "../../locked-notice";

export const dynamic = "force-dynamic";

// 신입 메뉴 체크리스트 + 레시피 퀴즈. 직원은 내 것, 사장은 직원별로 본다.
export default async function TrainingRoute() {
  const session = await requireActiveViewer("/recipes/training");
  const access = await checkSectionAccess(session, "training");
  if (!access.allowed) return <LockedNotice title="신입 교육 체크" />;
  if (session.mode === "demo") {
    return (
      <main style={{ padding: 32, fontFamily: "system-ui", lineHeight: 1.7 }}>
        <h1>교육 체크</h1>
        <p>데이터 창고(Supabase)가 연결되지 않아 시연 모드로 도는 중입니다. 로그인하면 메뉴 체크리스트와 퀴즈가 켜집니다.</p>
        <p><Link href="/">← 빈숲 OS 홈</Link></p>
      </main>
    );
  }
  const viewer = session.viewer!;
  return <TrainingPage viewer={{ id: viewer.id, displayName: viewer.displayName, role: viewer.role }} />;
}
