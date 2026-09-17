import { requireActiveViewer } from "../auth";
import RecipesPage from "./recipes-page";

export const dynamic = "force-dynamic";

// 로그인·재직 확인을 서버에서 하고, 화면(클라이언트 컴포넌트)에는 보는 사람 정보만 넘긴다.
export default async function RecipesRoute() {
  const session = await requireActiveViewer("/");
  const viewer = session.viewer
    ? { displayName: session.viewer.displayName, role: session.viewer.role }
    : null;
  return <RecipesPage viewer={viewer} demo={session.mode === "demo"} />;
}
