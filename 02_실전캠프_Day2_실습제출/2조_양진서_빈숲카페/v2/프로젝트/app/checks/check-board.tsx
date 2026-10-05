"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../preview/preview-api";
import PreviewBanner from "../preview/preview-banner";
import { portalSections } from "../portal-sections";
import type { CheckDoc, CheckItem, DaySummary } from "./check-data";
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
  // 숫자 입력 항목: 누르면 입력 칸이 열린다 (문서:항목 → 입력값)
  const [measuring, setMeasuring] = useState<Record<string, string>>({});
  const [itemError, setItemError] = useState<Record<string, string>>({});

  async function call(url: string, init?: RequestInit, errorKey?: string) {
    try {
      const response = await apiFetch(preview, url, { cache: "no-store", ...init });
      const body = await response.json();
      if (!response.ok) {
        if (errorKey) setItemError((current) => ({ ...current, [errorKey]: body.error ?? "저장하지 못했어요." }));
        else setMessage(body.error ?? "불러오지 못했습니다.");
        return false;
      }
      setView(body);
      setMessage("");
      return true;
    } catch {
      setMessage("연결이 끊겼어요. 잠시 후 다시 눌러 주세요.");
      return false;
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

  const post = (payload: Record<string, unknown>, errorKey?: string) => call("/api/checks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }, errorKey);

  async function toggle(doc: CheckDoc, item: CheckItem, checked: boolean) {
    const key = `${doc.docId}:${item.key}`;
    // 숫자 항목을 체크할 때는 먼저 입력 칸을 연다
    if (checked && item.unit !== null && measuring[key] === undefined) {
      setMeasuring((current) => ({ ...current, [key]: "" }));
      return;
    }
    setBusyKey(key);
    setItemError((current) => ({ ...current, [key]: "" }));
    const ok = await post({ docId: doc.docId, itemKey: item.key, checked, value: measuring[key] }, key);
    if (ok) setMeasuring((current) => { const next = { ...current }; delete next[key]; return next; });
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
            ? "직원이 항목마다 누르면 누가 몇 시에 했는지 남아요. 온도·수량 항목은 숫자를 적어야 체크돼요. 사장님은 직접 보고 문서마다 ‘확인함’을 눌러 주세요. 아래에서 지난 14일도 볼 수 있어요."
            : "한 일을 항목마다 눌러 주세요. 누가 몇 시에 했는지 남아서, 다음 근무자와 사장님이 어디까지 했는지 알 수 있어요. 온도·수량 항목은 숫자를 적어요. 안 한 일은 누르지 않아요."}
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
            <span className={styles.count} data-done={doc.total > 0 && doc.done === doc.total}>{doc.done} / {doc.total}{doc.late > 0 && <b className={styles.lateCount}> · 지연 {doc.late}</b>}</span>
          </header>
          <div className={styles.bar} aria-hidden="true"><span style={{ width: `${doc.total ? Math.round((doc.done / doc.total) * 100) : 0}%` }} /></div>

          <ul>
            {doc.items.map((item) => {
              const checked = Boolean(item.checkedAt);
              const key = `${doc.docId}:${item.key}`;
              // 남이 한 체크는 직원이 풀 수 없다 (사장은 가능). 오늘 해당 없는 항목은 누를 수 없다
              const canToggle = isToday && !item.skipped && (!checked || item.mine || isOwner);
              const open = measuring[key] !== undefined && !checked;
              return (
                <li key={item.key} data-checked={checked} data-skipped={item.skipped} data-late={item.late}>
                  <button type="button" role="checkbox" aria-checked={checked} disabled={!canToggle || busyKey === key} onClick={() => void toggle(doc, item, !checked)}>
                    <span className={styles.box} aria-hidden="true">{checked ? "✓" : item.skipped ? "–" : ""}</span>
                    <span className={styles.text}>
                      {item.label}
                      {item.unit !== null && <em className={styles.tag}>숫자 입력{item.unit ? ` (${item.unit})` : ""}</em>}
                      {item.schedule && <em className={styles.tag}>{item.schedule}</em>}
                      {item.due && <em className={styles.tag} data-late={item.late}>{item.late ? `${item.due}까지 · 지연` : `${item.due}까지`}</em>}
                    </span>
                    {checked && <small>{item.value ? `${item.value}${item.unit ?? ""} · ` : ""}{item.checkedByName} · {clock(item.checkedAt)}</small>}
                    {!checked && item.skipped && <small>오늘은 아님</small>}
                  </button>
                  {open && (
                    <form className={styles.measure} onSubmit={(event) => { event.preventDefault(); void toggle(doc, item, true); }}>
                      <input inputMode="decimal" autoFocus value={measuring[key]} placeholder={item.unit ? `숫자 (${item.unit})` : "숫자"} aria-label={`${item.label} 숫자`} onChange={(event) => setMeasuring((current) => ({ ...current, [key]: event.target.value }))} />
                      <button type="submit" disabled={busyKey === key || !measuring[key]?.trim()}>기록</button>
                      <button type="button" className={styles.cancel} onClick={() => setMeasuring((current) => { const next = { ...current }; delete next[key]; return next; })}>취소</button>
                    </form>
                  )}
                  {itemError[key] && <p className={styles.itemError} role="alert">{itemError[key]}</p>}
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

      {isOwner && (
        <section className={styles.howto} aria-label="항목 표시 안내">
          <h2>항목에 붙이는 표시 (관리자 편집 → 매뉴얼 → 순서 줄에 그대로 적기)</h2>
          <ul>
            <li><code>[숫자: ℃]</code> 숫자를 적어야 체크되는 항목 (냉장고 온도, 폐기 수량 …). 단위는 자유</li>
            <li><code>(매주 월·목)</code> 그 요일에만 나타남 · <code>(매월 1일)</code> 그 날짜에만</li>
            <li><code>(~09:30)</code> 그 시각까지. 15분 지나도 안 했으면 ‘지연’</li>
          </ul>
        </section>
      )}
    </main>
  );
}
