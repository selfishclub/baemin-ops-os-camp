import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActiveViewer } from "../../auth";
import ChangeStatus from "./change-status";

export const dynamic = "force-dynamic";

// 사장용: 바뀐 레시피마다 누가 확인했고 누가 안 봤는지
export default async function ChangesPage() {
  const session = await requireActiveViewer("/recipes/changes");
  if (session.mode === "demo") {
    return (
      <main style={{ padding: 32, fontFamily: "system-ui", lineHeight: 1.7 }}>
        <h1>확인 현황</h1>
        <p>데이터 창고(Supabase)가 연결되지 않아 시연 모드로 도는 중입니다. 열쇠를 넣고 사장 계정으로 로그인하면 확인 현황이 보입니다.</p>
        <p><Link href="/recipes">← 레시피</Link></p>
      </main>
    );
  }
  if (session.viewer!.role !== "owner") redirect("/");
  return <ChangeStatus />;
}
