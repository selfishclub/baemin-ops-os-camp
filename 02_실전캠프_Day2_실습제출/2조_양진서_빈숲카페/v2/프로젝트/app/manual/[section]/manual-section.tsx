"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../../preview/preview-api";
import PreviewRoleSwitch from "../../preview/preview-role-switch";
import ChatPanel from "../../recipes/chat-panel";
import { manualFieldLabels, type ManualDoc } from "../manual-data";
import styles from "../manual.module.css";

type Props = { sectionId: string; title: string; description: string; role: "owner" | "staff"; demo: boolean; lockedForStaff: boolean };

// 운영 매뉴얼 한 영역의 화면: 왼쪽 문서 목록, 오른쪽 문서 내용. 모든 영역이 같은 문서 틀을 쓴다.
export default function ManualSection({ sectionId, title, description, role, demo, lockedForStaff }: Props) {
  const [docs, setDocs] = useState<ManualDoc[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("문서를 불러오는 중입니다.");

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      try {
        const response = await apiFetch(demo, `/api/manuals?section=${encodeURIComponent(sectionId)}`, { cache: "no-store" });
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setMessage(body.error ?? "문서를 불러오지 못했습니다.");
          return;
        }
        const list: ManualDoc[] = body.docs ?? [];
        const wanted = new URLSearchParams(window.location.search).get("doc");
        setDocs(list);
        setSelectedId(list.find((doc) => doc.id === wanted)?.id ?? list[0]?.id ?? "");
        setMessage("");
      } catch {
        if (!cancelled) setMessage("연결이 끊겼어요. 잠시 후 다시 열어 주세요.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [demo, sectionId]);

  const selected = docs.find((doc) => doc.id === selectedId) ?? null;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/">← 빈숲 OS 홈</Link>
          <p className={styles.eyebrow}>운영 매뉴얼</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className={styles.headerActions}>
          {role === "owner" && <a href="/recipes/admin?tab=manuals">{demo ? "문서 고치기 (미리보기)" : "문서 고치기"}</a>}
          {demo && <PreviewRoleSwitch role={role} />}
        </div>
      </header>

      {lockedForStaff && <p className={styles.notice} role="status">지금 이 영역은 직원에게 잠겨 있어요. 사장님만 보이는 상태예요. 관리의 ‘메뉴 잠금 설정’에서 열어 줄 수 있어요.</p>}
      {demo && <p className={styles.notice}>공개용 버전이라 아래 문서는 전부 <strong>가짜 예시</strong>예요. ○○ 자리에 매장 기준을 적는 빈 양식입니다.</p>}
      {message && <p className={styles.notice} role="status">{message}</p>}

      {!message && docs.length === 0 && <p className={styles.empty}>아직 이 영역에 문서가 없어요.{role === "owner" ? " ‘문서 고치기’에서 새 문서를 추가해 보세요." : ""}</p>}

      {docs.length > 0 && (
        <div className={styles.layout}>
          <nav className={styles.list} aria-label={`${title} 문서 목록`}>
            {docs.map((doc) => (
              <button key={doc.id} type="button" aria-pressed={doc.id === selectedId} onClick={() => setSelectedId(doc.id)}>
                <strong>{doc.title}</strong>
                <small>{doc.summary}</small>
              </button>
            ))}
          </nav>

          {selected && (
            <article className={styles.doc} aria-labelledby="manual-doc-title">
              <header>
                <h2 id="manual-doc-title">{selected.title}</h2>
                <small>최종 수정 {selected.updatedAt}{selected.change ? ` · ${selected.change}` : ""}</small>
              </header>

              {selected.purpose && (
                <section>
                  <h3>{manualFieldLabels.purpose}</h3>
                  <p>{selected.purpose}</p>
                </section>
              )}
              {selected.materials.length > 0 && (
                <section>
                  <h3>{manualFieldLabels.materials}</h3>
                  <ul>{selected.materials.map((item, index) => <li key={index}>{item}</li>)}</ul>
                </section>
              )}
              <section>
                <h3>{manualFieldLabels.steps}</h3>
                <ol className={styles.steps}>{selected.steps.map((item, index) => <li key={index}>{item}</li>)}</ol>
              </section>
              {selected.doneCriteria.length > 0 && (
                <section>
                  <h3>{manualFieldLabels.doneCriteria}</h3>
                  <ul className={styles.done}>{selected.doneCriteria.map((item, index) => <li key={index}>{item}</li>)}</ul>
                </section>
              )}
              {selected.donts.length > 0 && (
                <section className={styles.donts}>
                  <h3>{manualFieldLabels.donts}</h3>
                  <ul>{selected.donts.map((item, index) => <li key={index}>{item}</li>)}</ul>
                </section>
              )}
              {selected.reportWhen.length > 0 && (
                <section className={styles.report}>
                  <h3>{manualFieldLabels.reportWhen}</h3>
                  <ul>{selected.reportWhen.map((item, index) => <li key={index}>{item}</li>)}</ul>
                </section>
              )}
            </article>
          )}
        </div>
      )}

      <ChatPanel />
    </main>
  );
}
