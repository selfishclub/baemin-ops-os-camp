"use client";

import { useState } from "react";
import type { RecipeHistoryEntry } from "./history";
import styles from "./recipes.module.css";

// 레시피 상세의 "변경 이력": 버전마다 이전 값 → 지금 값. 눌렀을 때만 불러온다.
export default function HistoryPanel({ recipeId, demo }: { recipeId: string; demo: boolean }) {
  const [entries, setEntries] = useState<RecipeHistoryEntry[] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/history?recipe=${encodeURIComponent(recipeId)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error ?? "변경 이력을 불러오지 못했습니다.");
        return;
      }
      setEntries(body.history ?? []);
    } catch {
      setMessage("변경 이력을 불러오지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.historySection} aria-labelledby="history-title">
      <div className={styles.historyHead}>
        <div><small>CHANGE HISTORY</small><h3 id="history-title">변경 이력</h3></div>
        {entries === null && <button type="button" disabled={busy} onClick={() => void load()}>{busy ? "불러오는 중…" : "이전 값과 비교해 보기"}</button>}
      </div>
      {message && <p role="status">{message}</p>}
      {entries !== null && entries.length === 0 && (
        <p>{demo ? "시연 모드에서는 변경 이력이 없어요. 데이터 창고에 연결해 게시하면 버전마다 쌓여요." : "아직 기록된 변경이 없어요."}</p>
      )}
      {entries?.map((entry) => (
        <article key={entry.version} className={styles.historyEntry}>
          <header>
            <strong>Ver {entry.version}</strong>
            <span>{entry.publishedAt.slice(0, 10)} · {entry.changeReason || "변경"} · {entry.publishedBy}</span>
          </header>
          <ul>
            {entry.changes.map((line, index) => (
              <li key={`${line.where}-${line.label}-${index}`}>
                <em>{line.where} · {line.label}</em>
                <span><del>{line.before}</del> → <b>{line.after}</b></span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
}
