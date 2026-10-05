import { requireActiveViewer } from "../auth";
import { previewViewer, readPreviewRole } from "../preview/preview-role";
import PasswordForm from "./password-form";

export const dynamic = "force-dynamic";

// 내 계정: 비밀번호 바꾸기 (본인만). 로그인이 꺼진 미리보기에서는 안내만.
export default async function AccountPage() {
  const session = await requireActiveViewer("/account");
  const person = session.mode === "demo" ? previewViewer(await readPreviewRole()) : session.viewer!;
  return <PasswordForm demo={session.mode === "demo"} loginId={"loginId" in person ? person.loginId : person.id} displayName={person.displayName} />;
}
