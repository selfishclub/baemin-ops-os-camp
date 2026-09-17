import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActiveViewer } from "../../auth";
import AdminStudio from "./studio";

export const dynamic = "force-dynamic";

export default async function RecipeAdminPage() {
  const session = await requireActiveViewer("/recipes/admin");
  if (session.mode === "demo") {
    return (
      <main style={{ padding: 32, fontFamily: "system-ui", lineHeight: 1.7 }}>
        <h1>관리자 편집</h1>
        <p>데이터 창고(Supabase)가 연결되지 않아 시연 모드로 도는 중입니다. 편집은 <code>.env.local</code>에 열쇠를 넣고 사장 계정으로 로그인하면 됩니다.</p>
        <p><Link href="/">← 레시피 홈</Link></p>
      </main>
    );
  }
  if (session.viewer!.role !== "owner") redirect("/");
  return <AdminStudio userName={session.viewer!.displayName} />;
}
