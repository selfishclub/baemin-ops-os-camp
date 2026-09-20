"use client";

import styles from "./preview.module.css";

// 서버의 preview-role.ts 와 같은 이름 (서버 전용 파일이라 여기서 불러오지 않는다)
const previewRoleCookie = "bs_preview_role";

function writePreviewRoleCookie(role: "owner" | "staff") {
  document.cookie = `${previewRoleCookie}=${role}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
}

// 미리보기 전용: 같은 화면을 직원 눈으로 / 사장 눈으로 바꿔 본다. 이 브라우저에서만 바뀐다.
export default function PreviewRoleSwitch({ role }: { role: "owner" | "staff" }) {
  function change(next: "owner" | "staff") {
    if (next === role) return;
    writePreviewRoleCookie(next);
    window.location.reload();
  }

  return (
    <div className={styles.roleSwitch} role="group" aria-label="미리보기에서 누구 눈으로 볼지">
      <span>미리보기</span>
      <button type="button" aria-pressed={role === "staff"} onClick={() => change("staff")}>직원 눈으로</button>
      <button type="button" aria-pressed={role === "owner"} onClick={() => change("owner")}>사장 눈으로</button>
    </div>
  );
}
