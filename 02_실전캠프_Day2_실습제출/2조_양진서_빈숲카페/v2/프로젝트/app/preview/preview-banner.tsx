"use client";

import { useEffect, useState } from "react";
import { hasPreviewEdits, resetPreview } from "./preview-api";
import PreviewRoleSwitch from "./preview-role-switch";
import styles from "./preview.module.css";

// 미리보기 표시. 고친 내용이 이 브라우저에만 저장된다는 걸 분명히 알리고, 처음 상태로 되돌리는 단추를 둔다.
export default function PreviewBanner({ what, role }: { what: string; role?: "owner" | "staff" }) {
  const [edited, setEdited] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setEdited(hasPreviewEdits());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.banner} role="note">
      <span className={styles.badge}>미리보기</span>
      <p>
        로그인 없이 직접 눌러 볼 수 있는 화면이에요: <strong>{what}</strong>. 고친 내용은 <strong>이 브라우저에만</strong> 저장되고,
        실제 데이터와 다른 사람 화면은 바뀌지 않아요.
      </p>
      {role && <PreviewRoleSwitch role={role} />}
      {edited && (
        <button
          type="button"
          onClick={() => {
            if (window.confirm("미리보기에서 고친 내용(레시피·교육 기록·확인 기록·잠금)을 모두 지우고 처음 상태로 되돌릴까요?")) {
              resetPreview();
              window.location.reload();
            }
          }}
        >
          처음 상태로
        </button>
      )}
    </div>
  );
}
