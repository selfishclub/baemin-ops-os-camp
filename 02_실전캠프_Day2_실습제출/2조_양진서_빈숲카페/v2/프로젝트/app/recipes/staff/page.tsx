import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActiveViewer } from "../../auth";
import StaffManager from "./staff-manager";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const session = await requireActiveViewer("/recipes/staff");
  if (session.mode === "demo") {
    return (
      <main style={{ padding: 32, fontFamily: "system-ui" }}>
        <h1>직원 계정 관리</h1>
        <p>데이터 창고(Supabase)가 연결되지 않아 시연 모드로 도는 중입니다. `.env.local`에 열쇠를 넣으면 로그인·직원 관리가 켜집니다.</p>
        <p><Link href="/">← 레시피 홈</Link></p>
      </main>
    );
  }
  if (session.viewer!.role !== "owner") redirect("/");
  return <StaffManager />;
}
