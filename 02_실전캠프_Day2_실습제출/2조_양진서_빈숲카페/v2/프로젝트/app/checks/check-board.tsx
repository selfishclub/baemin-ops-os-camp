"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../preview/preview-api";
import PreviewBanner from "../preview/preview-banner";
import { portalSections } from "../portal-sections";
import type { CheckDoc, DaySummary } from "./check-data";
import styles from "./checks.module.css";

type View = { date: string; today: string; docs: CheckDoc[]; history: DaySummary[] };

const sectionTitle = (id: string) => portalSections.find((section) => section.id === id)?.title ?? id;
const clock = (value: string | null) => (value ? new Date(value).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }) : "");
const shortDate = (value: string) => `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`;

export default function CheckBoard({ role, preview }: { role: "owner" | "staff"; preview: boolean }) {
  const isOwner = role === "owner";
  const [view, setView] = useState<View | null>(null);
  const [message, setMessage] = useState("불러오는 중입니다.");
  const [busyKey, setBusyKey] = useState("");

  async function call(url: string, init?: RequestInit) {
    try {
      const response = await apiFetch(preview, url, { cache: "no-store", ...init });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error ?? "불러오지 못했습니다.");
        return;
      }
      setView(body);
      setMessage("");
    } catch {
      setMessage("연결이 끊겼어요. 잠시 후 다시 눌러 주세요.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) void call("/api/checks");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const post = (payload: Record<string, unknown>) => call("/api/checks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });

  async function toggle(doc: CheckDoc, itemKey: string, checked: boolean) {
    setBusyKey(`${doc.docId}:${itemKey}`);
    await post({ docId: doc.docId, itemKey, checked });
    setBusyKey("");
  }

  async function signoff(doc: CheckDoc, on: boolean) {
    if (!view) return;
    setBusyKey(`${doc.docId}:signoff`);
    await post({ docId: doc.docId, date: view.date, signoff: on });
    setBusyKey("");
  }

  const isToday = view ? view.date === view.today : true;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/">← 빈숲 OS 홈</Link>
        <h1>오늘 체크{view && <small> {shortDate(view.date)}{isToday ? " (오늘)" : ""}</small>}</h1>
        <p>
          {isOwner
            ? "직원이 항목마다 누르면 누가 몇 시에 했는지 남아요. 사장님은 직접 보고 문서마다 ‘확인함’을 눌러 주세요. 아래에서 지난 14일도 볼 수 있어요."
            : "한 일을 항목마다 눌러 주세요. 누가 몇 시에 했는지 남아서, 다음 근무자와 사장님이 어디까지 했는지 알 수 있어요. 안 한 일은 누르지 않아요."}
        </p>
      </header>

      {preview && <PreviewBanner what={isOwner ? "오늘 체크 · 확인함 · 지난 기록" : "오늘 체크 (항목 누르기)"} role={role} />}
      {message && <p className={styles.notice} role="status">{message}</p>}
      {view && !isToday && <p className={styles.notice}>지난 날짜예요. 체크는 그날에만 할 수 있고, 지금은 보기와 ‘확인함’만 돼요. <button type="button" onClick={() => void call("/api/checks")}>오늘로 돌아가기</button></p>}
      {view && view.docs.length === 0 && !message && <p className={styles.notice}>매일 체크하는 문서가 아직 없어요.{isOwner ? " 관리자 편집의 ‘매뉴얼’ 탭에서 문서에 ‘매일 체크하는 문서’를 켜 주세요." : ""}</p>}

      {view?.docs.map((doc) => (
        <section key={doc.docId} className={styles.card} data-done={doc.total > 0 && doc.done === doc.total}>
          <header>
            <div>
              <small>{sectionTitle(doc.sectionId)}</small>
              <h2>{doc.title}</h2>
            </div>
            <span className={styles.count} data-done={doc.total > 0 && doc.done === doc.total}>{doc.done} / {doc.total}</span>
          </header>
          <div className={styles.bar} aria-hidden="true"><span style={{ width: `${doc.total ? Math.round((doc.done / doc.total) * 100) : 0}%` }} /></div>

          <ul>
            {doc.items.map((item) => {
              const checked = Boolean(item.checkedAt);
              // 남이 한 체크는 직원이 풀 수 없다 (사장은 가능)
              const canToggle = isToday && (!checked || item.mine || isOwner);
              return (
                <li key={item.key} data-checked={checked}>
                  <button type="button" role="checkbox" aria-checked={checked} disabled={!canToggle || busyKey === `${doc.docId}:${item.key}`} onClick={() => void toggle(doc, item.key, !checked)}>
                    <span className={styles.box} aria-hidden="true">{checked ? "✓" : ""}</span>
                    <span className={styles.text}>{item.text}</span>
                    {checked && <small>{item.checkedByName} · {clock(item.checkedAt)}</small>}
                  </button>
                </li>
              );
            })}
          </ul>

          {doc.earlier.length > 0 && (
            <p className={styles.earlier}>문서를 고치기 전에 한 체크: {doc.earlier.map((row) => `${row.text} (${row.checkedByName} ${clock(row.checkedAt)})`).join(" · ")}</p>
          )}

          <footer>
            <a href={`/manual/${doc.sectionId}?doc=${encodeURIComponent(doc.docId)}`}>문서 보기</a>
            {doc.signoff
              ? <em>사장 확인 ✓ {doc.signoff.name} · {clock(doc.signoff.at)}{isOwner && <button type="button" disabled={busyKey === `${doc.docId}:signoff`} onClick={() => void signoff(doc, false)}>취소</button>}</em>
              : isOwner
                ? <button type="button" className={styles.signoff} disabled={busyKey === `${doc.docId}:signoff`} onClick={() => void signoff(doc, true)}>확인함</button>
                : <span>사장 확인 전</span>}
          </footer>
        </section>
      ))}

      {isOwner && view && view.history.length > 0 && (
        <section className={styles.history} aria-labelledby="history-title">
          <h2 id="history-title">지난 14일</h2>
          <div className={styles.historyScroll}>
            <table>
              <thead><tr><th>날짜</th>{view.history[0].docs.map((doc) => <th key={doc.docId}>{doc.title}</th>)}</tr></thead>
              <tbody>
                {view.history.map((day) => (
                  <tr key={day.date} data-selected={day.date === view.date}>
                    <td><button type="button" onClick={() => void call(`/api/checks?date=${day.date}`)}>{shortDate(day.date)}{day.date === view.today ? " 오늘" : ""}</button></td>
                    {day.docs.map((doc) => (
                      <td key={doc.docId} data-state={doc.total > 0 && doc.done === doc.total ? "done" : doc.done > 0 ? "part" : "none"}>
                        {doc.done} / {doc.total}{doc.signedOff ? " · 확인 ✓" : ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
