"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../../preview/preview-api";
import PreviewRoleSwitch from "../../preview/preview-role-switch";
import ChatPanel from "../../recipes/chat-panel";
import { VideoRecipeCard, Watermark } from "../../recipes/media-parts";
import { todayInSeoul } from "../../checks/check-data";
import { manualLabels, manualNoticePrefix, responseGroups, type ManualDoc } from "../manual-data";
import styles from "../manual.module.css";

type Props = { sectionId: string; title: string; description: string; role: "owner" | "staff"; viewerName: string; demo: boolean; lockedForStaff: boolean };

// 운영 매뉴얼 한 영역의 화면: 왼쪽 문서 목록, 오른쪽 문서 내용. 모든 영역이 같은 문서 틀을 쓴다.
export default function ManualSection({ sectionId, title, description, role, viewerName, demo, lockedForStaff }: Props) {
  // 사진·영상 위에 얹는 워터마크: 누가 언제 봤는지 남는다 (레시피와 같은 규칙)
  const watermark = `빈숲카페 · ${viewerName} · ${todayInSeoul()}`;
  const [docs, setDocs] = useState<ManualDoc[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("문서를 불러오는 중입니다.");
  // 아직 확인하지 않은 "바뀐 문서" 알림 (문서 id → 알림)
  const [changed, setChanged] = useState<Record<string, { id: number; change_reason: string; version: number }>>({});
  const [ackBusy, setAckBusy] = useState(false);

  function keepPending(items: { id: number; recipe_id: string; change_reason: string; version: number; acked: boolean }[] | undefined) {
    const next: Record<string, { id: number; change_reason: string; version: number }> = {};
    for (const item of items ?? []) {
      if (!item.acked && item.recipe_id.startsWith(manualNoticePrefix)) next[item.recipe_id.slice(manualNoticePrefix.length)] ??= item;
    }
    setChanged(next);
  }

  async function ackChange(noticeId: number) {
    setAckBusy(true);
    try {
      const response = await apiFetch(demo, "/api/changes/ack", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ noticeId }) });
      if (response.ok) keepPending((await response.json()).notices);
    } finally {
      setAckBusy(false);
    }
  }

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
        // 바뀐 문서 표시는 못 읽어도 문서 보기는 그대로 된다
        apiFetch(demo, "/api/changes", { cache: "no-store" })
          .then((result) => (result.ok ? result.json() : null))
          .then((data) => { if (!cancelled && data) keepPending(data.notices); })
          .catch(() => {});
      } catch {
        if (!cancelled) setMessage("연결이 끊겼어요. 잠시 후 다시 열어 주세요.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [demo, sectionId]);

  // 폰처럼 좁은 화면에서는 목록 아래에 문서가 있으므로, 고르면 문서로 내려가 준다
  function choose(id: string) {
    setSelectedId(id);
    if (window.matchMedia("(max-width: 760px)").matches) {
      window.requestAnimationFrame(() => document.getElementById("manual-doc-title")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  const selected = docs.find((doc) => doc.id === selectedId) ?? null;
  const labels = manualLabels(selected?.kind);
  const isCard = selected?.kind === "response";
  // 응대북은 묶음(기본 흐름, 주문 상황 …)별로 보여 준다. 묶음이 없는 문서는 맨 위에 그냥 나열
  const groupNames = [...new Set(docs.map((doc) => doc.group ?? ""))].sort((a, b) => {
    const order = (name: string) => (name === "" ? -1 : (responseGroups as readonly string[]).indexOf(name) === -1 ? 99 : (responseGroups as readonly string[]).indexOf(name));
    return order(a) - order(b);
  });

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
            {groupNames.map((group) => (
              <div key={group || "none"} className={styles.listGroup}>
                {group && <h2>{group}</h2>}
                <div className={styles.listRow}>
                  {docs.filter((doc) => (doc.group ?? "") === group).map((doc) => (
                    <button key={doc.id} type="button" aria-pressed={doc.id === selectedId} onClick={() => choose(doc.id)}>
                      <strong>{doc.title}{changed[doc.id] && <span className={styles.changedDot}>바뀜</span>}</strong>
                      <small>{doc.summary}</small>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {selected && (
            <article className={styles.doc} data-kind={isCard ? "response" : "procedure"} aria-labelledby="manual-doc-title">
              {changed[selected.id] && (
                <div className={styles.changedBar} role="status">
                  <p><strong>이 문서가 바뀌었어요.</strong> {changed[selected.id].change_reason || "내용 변경"} · Ver {changed[selected.id].version}. 읽어 보고 눌러 주세요.</p>
                  <button type="button" disabled={ackBusy} onClick={() => void ackChange(changed[selected.id].id)}>확인했어요</button>
                </div>
              )}
              <header>
                {isCard && <p className={styles.cardTag}>응대 카드{selected.group ? ` · ${selected.group}` : ""}</p>}
                <h2 id="manual-doc-title">{selected.title}</h2>
                <small>최종 수정 {selected.updatedAt}{selected.change ? ` · ${selected.change}` : ""}</small>
              </header>

              {selected.dailyCheck && !isCard && <p className={styles.dailyLink}><a href="/checks">✓ 매일 체크하는 문서예요 — 오늘 체크하러 가기</a></p>}
              {selected.purpose && (
                <section>
                  <h3>{labels.purpose}</h3>
                  <p>{selected.purpose}</p>
                </section>
              )}
              {!isCard && selected.materials.length > 0 && (
                <section>
                  <h3>{labels.materials}</h3>
                  <ul>{selected.materials.map((item, index) => <li key={index}>{item}</li>)}</ul>
                </section>
              )}
              <section>
                <h3>{labels.steps}</h3>
                {isCard
                  ? <ul className={styles.say}>{selected.steps.map((item, index) => <li key={index}>{item}</li>)}</ul>
                  : <ol className={styles.steps}>{selected.steps.map((item, index) => <li key={index}>{item}</li>)}</ol>}
              </section>
              {selected.doneCriteria.length > 0 && (
                <section>
                  <h3>{labels.doneCriteria}</h3>
                  <ul className={styles.done}>{selected.doneCriteria.map((item, index) => <li key={index}>{item}</li>)}</ul>
                </section>
              )}
              {selected.donts.length > 0 && (
                <section className={styles.donts}>
                  <h3>{labels.donts}</h3>
                  <ul>{selected.donts.map((item, index) => <li key={index}>{item}</li>)}</ul>
                </section>
              )}
              {(selected.images?.length || selected.videos?.length) ? (
                <section className={styles.media}>
                  <h3>사진 · 영상</h3>
                  {selected.images?.length ? (
                    <div className={styles.photos}>
                      {selected.images.map((image) => (
                        <figure key={image.id}>
                          <div className={styles.photoStage}>
                            <Watermark label={watermark} />
                            <img src={image.url} alt={image.alt} loading="lazy" draggable={false} onContextMenu={(event) => event.preventDefault()} />
                          </div>
                          {(image.caption || image.alt) && <figcaption>{image.caption || image.alt}</figcaption>}
                        </figure>
                      ))}
                    </div>
                  ) : null}
                  {selected.videos?.map((video) => <VideoRecipeCard key={video.id} video={video} watermark={watermark} />)}
                </section>
              ) : null}
              {selected.reportWhen.length > 0 && (
                <section className={styles.report}>
                  <h3>{labels.reportWhen}</h3>
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
