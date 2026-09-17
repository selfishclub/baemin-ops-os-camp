import { requireChatGPTUser } from "../../chatgpt-auth";
import AdminStudio from "./studio";

export const dynamic = "force-dynamic";

export default async function RecipeAdminPage() {
  const user = await requireChatGPTUser("/recipes/admin");
  return <AdminStudio userName={user.displayName} />;
}
