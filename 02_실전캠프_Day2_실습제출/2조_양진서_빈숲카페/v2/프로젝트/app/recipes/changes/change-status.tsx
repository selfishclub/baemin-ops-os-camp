"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./changes.module.css";

type Person = { id: string; name: string; at?: string };
type NoticeStatus = {
  id: number;
  version: number;
  recipe_id: string;
  recipe_name: string;
  change_reason: string;
  published_by: string;
  created_at: string;
  acked: Person[];
  pending: Person[];
};
type Staff = { id: string; login_id: string; display_name: string; role: string; active: boolean };

function formatDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function ChangeStatus() {
  const [notices, setNotices] = useState<NoticeStatus[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [message, setMessage] = useState("확인 현황을 불러오는 중입니다.");

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      const response = await fetch("/api/admin/changes", { cache: "no-store" });
      const body = await response.json();
      if (cancelled) return;
      if (!response.ok) {
        setMessage(body.error ?? "확인 현황을 불러오지 못했습니다.");
        return;
      }
      setNotices(body.notices ?? []);
      setStaff(body.staff ?? []);
      setMessage("");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeCount = staff.filter((person) => person.active).length;
  const unfinished = notices.filter((notice) => notice.pending.length > 0);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/">← 레시피 홈</Link>
        <h1>바뀐 레시피 확인 현황</h1>
        <p>
          레시피를 고쳐 게시하면 바뀐 메뉴마다 알림이 생기고, 직원이 ‘확인했어요’를 누르면 여기 표시돼요.
          재직 직원 {activeCount}명 기준. 최근 60일.
        </p>
      </header>

      {message && <p className={styles.message} role="status">{message}</p>}

      {!message && notices.length === 0 && (
        <p className={styles.empty}>아직 알림이 없어요. 관리자 편집에서 레시피를 고치고 ‘직원 확인 필요’를 켠 채 게시하면 여기 나타나요.</p>
      )}

      {unfinished.length > 0 && (
        <p className={styles.summary}>아직 다 확인되지 않은 변경 <strong>{unfinished.length}건</strong></p>
      )}

      <ul className={styles.list}>
        {notices.map((notice) => (
          <li key={notice.id} data-done={notice.pending.length === 0}>
            <div className={styles.noticeHead}>
              <div>
                <strong>{notice.recipe_name}</strong>
                <small>{notice.change_reason || "레시피 변경"} · Ver {notice.version} · {formatDate(notice.created_at)} · {notice.published_by}</small>
              </div>
              <span className={styles.count}>{notice.acked.length} / {notice.acked.length + notice.pending.length} 확인</span>
            </div>
            <div className={styles.people}>
              {notice.pending.length > 0 && (
                <p><em>안 본 사람</em>{notice.pending.map((person) => <b key={person.id}>{person.name}</b>)}</p>
              )}
              {notice.acked.length > 0 && (
                <p><em>확인함</em>{notice.acked.map((person) => <span key={person.id}>{person.name} <small>{formatDate(person.at ?? "")}</small></span>)}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
