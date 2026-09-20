import { cookies } from "next/headers";

// 미리보기에서 "직원 눈으로 / 사장 눈으로" 바꿔 보기.
// 로그인이 꺼진 시연·둘러보기 모드(session.mode === "demo")에서만 읽는다. 로그인 모드에서는 어디서도 쓰지 않으므로
// 이 쿠키로 실제 권한이 바뀌는 일은 없다. 가짜 데이터 화면을 어느 쪽 눈으로 볼지만 정한다.

export const previewRoleCookie = "bs_preview_role";

export type PreviewRole = "owner" | "staff";

export async function readPreviewRole(): Promise<PreviewRole> {
  try {
    return (await cookies()).get(previewRoleCookie)?.value === "staff" ? "staff" : "owner";
  } catch {
    return "owner";
  }
}

// 미리보기 화면에 나오는 가짜 사람. 실제 직원 이름을 쓰지 않는다.
export function previewViewer(role: PreviewRole) {
  return role === "owner"
    ? { id: "preview-owner", displayName: "미리보기 사장", role }
    : { id: "preview-staff-a", displayName: "직원 A", role };
}
