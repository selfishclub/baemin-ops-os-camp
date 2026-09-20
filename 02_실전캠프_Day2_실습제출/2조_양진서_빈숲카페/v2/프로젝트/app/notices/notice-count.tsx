"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../preview/preview-api";
import styles from "./notices.module.css";

// 홈의 "공지 · 변경 이력" 버튼에 붙는 안 읽은 건수. 못 읽으면 조용히 아무것도 안 보인다.
export default function NoticeCount({ demo }: { demo: boolean }) {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiFetch(demo, "/api/changes", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!cancelled && body) setPending(Number(body.pending) || 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [demo]);

  return pending > 0 ? <span className={styles.count}>확인할 것 {pending}</span> : null;
}
