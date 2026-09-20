"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../preview/preview-api";
import PreviewBanner from "../preview/preview-banner";
import styles from "./notices.module.css";

export type NoticeItem = {
  id: number;
  version: number;
  recipe_id: string;
  recipe_name: string;
  change_reason: string;
  published_by: string;
  created_at: string;
  acked: boolean;
  kind: "recipe" | "manual";
  href: string;
};

function when(value: string) {
  const date = new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// 공지 · 변경 이력 화면. 위에는 아직 확인하지 않은 변경, 아래에는 지난 변경(최근 60일).
export default function NoticeBoard({ role, demo }: { role: "owner" | "staff"; demo: boolean }) {
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [message, setMessage] = useState("불러오는 중입니다.");
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      try {
        const response = await apiFetch(demo, "/api/changes", { cache: "no-store" });
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setMessage(body.error ?? "불러오지 못했습니다.");
          return;
        }
        setNotices(body.notices ?? []);
        setMessage("");
      } catch {
        if (!cancelled) setMessage("연결이 끊겼어요. 잠시 후 다시 열어 주세요.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [demo]);

  async function ack(noticeId: number) {
    setBusyId(noticeId);
    try {
      const response = await apiFetch(demo, "/api/changes/ack", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ noticeId }) });
      const body = await response.json();
      if (response.ok) setNotices(body.notices ?? []);
      else setMessage(body.error ?? "확인을 저장하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  const pending = notices.filter((notice) => !notice.acked);
  const done = notices.filter((notice) => notice.acked);

  const row = (notice: NoticeItem) => (
    <li key={notice.id} data-acked={notice.acked}>
      <div>
        <span className={styles.kind} data-kind={notice.kind}>{notice.kind === "manual" ? "매뉴얼 · 응대" : "레시피"}</span>
        <strong>{notice.recipe_name}</strong>
        <small>{notice.change_reason || "내용 변경"} · Ver {notice.version} · {when(notice.created_at)} · {notice.published_by}</small>
      </div>
      <div className={styles.actions}>
        <a href={notice.href}>보기</a>
        {!notice.acked && <button type="button" disabled={busyId === notice.id} onClick={() => void ack(notice.id)}>확인했어요</button>}
        {notice.acked && <em>확인함 ✓</em>}
      </div>
    </li>
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/">← 빈숲 OS 홈</Link>
        <h1>공지 · 변경 이력</h1>
        <p>레시피나 매뉴얼이 바뀌면 여기에 모여요. 바뀐 내용을 열어 보고 ‘확인했어요’를 눌러 주세요. 누가 확인했는지는 사장님 화면에 보여요.</p>
        {role === "owner" && <a className={styles.ownerLink} href="/recipes/changes">누가 확인했는지 보기 (확인 현황) →</a>}
      </header>

      {demo && <PreviewBanner what="공지 · 변경 이력 (사장 눈으로 게시 → 직원 눈으로 여기서 확인했어요)" role={role} />}
      {message && <p className={styles.message} role="status">{message}</p>}

      {!message && (
        <>
          <section aria-labelledby="pending-title">
            <h2 id="pending-title">확인이 필요한 변경 <span>{pending.length}건</span></h2>
            {pending.length === 0 ? <p className={styles.empty}>전부 확인했어요.</p> : <ul className={styles.list}>{pending.map(row)}</ul>}
          </section>
          <section aria-labelledby="done-title">
            <h2 id="done-title">지난 변경 (최근 60일)</h2>
            {done.length === 0 ? <p className={styles.empty}>아직 없어요.</p> : <ul className={styles.list}>{done.map(row)}</ul>}
          </section>
        </>
      )}
    </main>
  );
}
