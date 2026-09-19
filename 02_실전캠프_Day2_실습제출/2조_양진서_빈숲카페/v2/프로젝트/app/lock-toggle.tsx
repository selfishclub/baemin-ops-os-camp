"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./portal.module.css";

// 사장만 보이는 잠그기/열기 단추 (빈숲 OS 홈의 영역 버튼 아래)
export default function LockToggle({ sectionId, locked, fixed }: { sectionId: string; locked: boolean; fixed: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (fixed) return <p className={styles.lockNote}>서버 설정으로 고정 잠금됨</p>;

  async function toggle() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sectionId, locked: !locked }),
      });
      const body = await response.json();
      if (!response.ok) setMessage(body.error ?? "저장하지 못했습니다.");
      else router.refresh();
    } catch {
      setMessage("연결이 끊겼어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.lockRow}>
      <button type="button" className={styles.lockButton} data-locked={locked} disabled={busy} onClick={() => void toggle()}>
        {locked ? "잠김 · 직원에게 열어 주기" : "열림 · 직원에게 잠그기"}
      </button>
      {message && <span role="status">{message}</span>}
    </div>
  );
}
