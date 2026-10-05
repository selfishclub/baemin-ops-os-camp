"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./handover.module.css";
import { apiFetch } from "../preview/preview-api";
import PreviewBanner from "../preview/preview-banner";
import { handoverMaxLength, shiftLabels, type HandoverShift, type HandoverView } from "./handover-data";

type Payload = { notes: HandoverView[]; unread: number; me: { id: string; role: "owner" | "staff" } };

function formatWhen(iso: string) {
  const date = new Date(iso);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function HandoverBoard({ preview = false, role }: { preview?: boolean; role: "owner" | "staff" }) {
  const [data, setData] = useState<Payload | null>(null);
  const [message, setMessage] = useState("인수인계를 불러오는 중입니다.");
  const [shift, setShift] = useState<HandoverShift>("close");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  async function load() {
    try {
      const response = await apiFetch(preview, "/api/handover", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error ?? "인수인계를 불러오지 못했습니다.");
        return;
      }
      setData(body);
      setMessage("");
    } catch {
      setMessage("연결이 끊겼어요. 잠시 후 다시 열어 주세요.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy("write");
    setNote("");
    try {
      const response = await apiFetch(preview, "/api/handover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ shift, text }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNote(body.error ?? "남기지 못했어요.");
        return;
      }
      setNote("남겼어요. 다음 근무자가 ‘읽었어요’를 누르면 여기 이름이 보여요.");
      setText("");
      await load();
    } finally {
      setBusy("");
    }
  }

  async function markRead(id: number) {
    setBusy(`read:${id}`);
    try {
      const response = await apiFetch(preview, "/api/handover", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      if (response.ok) await load();
    } finally {
      setBusy("");
    }
  }

  async function remove(id: number) {
    if (!window.confirm("이 인수인계를 지울까요? (사장만)")) return;
    const response = await apiFetch(preview, `/api/handover?id=${id}`, { method: "DELETE" });
    if (response.ok) await load();
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/">← 빈숲 OS</Link>
        <h1>인수인계</h1>
        <p>교대할 때 다음 근무자에게 남길 것을 적어요 — 남은 재료, 고장, 예약, 손님 특이사항. 다음 사람은 읽고 ‘읽었어요’. 누가 읽었고 누가 아직 안 읽었는지 보여요. 쓴 사람 2점, 읽은 사람 1점.</p>
      </header>

      {preview && <PreviewBanner what="인수인계 (가짜 기록 · 이 브라우저에만 저장)" role={role} />}
      {message && <p className={styles.message} role="status">{message}</p>}
      {data && data.unread > 0 && <p className={styles.unread} role="status">📌 아직 안 읽은 인수인계가 {data.unread}건 있어요. 읽고 ‘읽었어요’를 눌러 주세요.</p>}

      <form className={styles.form} onSubmit={submit} aria-label="인수인계 남기기">
        <h2>지금 남기기</h2>
        <div className={styles.shifts} role="group" aria-label="교대">
          {(Object.keys(shiftLabels) as HandoverShift[]).map((item) => (
            <button key={item} type="button" aria-pressed={shift === item} onClick={() => setShift(item)}>{shiftLabels[item]}</button>
          ))}
        </div>
        <textarea value={text} maxLength={handoverMaxLength} rows={4} placeholder={"예: 우유 2팩 남음(내일 아침 발주 필요) · 2번 그라인더 분쇄도 한 칸 굵게 조정함 · 15시 단체 예약 6명"} onChange={(event) => setText(event.target.value)} />
        <div className={styles.row}>
          <small>{text.length}/{handoverMaxLength}</small>
          <button type="submit" className={styles.primary} disabled={busy === "write" || !text.trim()}>{busy === "write" ? "남기는 중…" : "남기기"}</button>
        </div>
        {note && <p className={styles.note} role="status">{note}</p>}
      </form>

      <section className={styles.list} aria-label="최근 인수인계">
        <h2>최근 7일</h2>
        {data && data.notes.length === 0 && <p className={styles.empty}>아직 인수인계가 없어요. 교대할 때 첫 메모를 남겨 보세요.</p>}
        <ul>
          {data?.notes.map((item) => (
            <li key={item.id} data-unread={!item.mine && !item.readByMe} data-mine={item.mine}>
              <header>
                <span className={styles.shift}>{shiftLabels[item.shift]}</span>
                <b>{item.author_name}</b>
                <time dateTime={item.created_at}>{formatWhen(item.created_at)}</time>
              </header>
              <p className={styles.text}>{item.text}</p>
              <footer>
                <small>
                  {item.reads.length ? `읽음: ${item.reads.map((read) => read.user_name).join(", ")}` : "아직 아무도 안 읽음"}
                  {item.unreadNames.length ? ` · 안 읽음: ${item.unreadNames.join(", ")}` : ""}
                </small>
                {!item.mine && !item.readByMe && <button type="button" disabled={busy === `read:${item.id}`} onClick={() => void markRead(item.id)}>읽었어요</button>}
                {data.me.role === "owner" && <button type="button" className={styles.remove} onClick={() => void remove(item.id)}>지우기</button>}
              </footer>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
