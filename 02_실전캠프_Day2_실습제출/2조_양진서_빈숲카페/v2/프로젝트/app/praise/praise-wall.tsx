"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./praise.module.css";
import { apiFetch } from "../preview/preview-api";
import PreviewBanner from "../preview/preview-banner";
import { praiseMaxLength, praiseTemplates, type PraiseRow, type PraiseSummary } from "./praise-data";

type Payload = {
  wall: PraiseRow[];
  summary: PraiseSummary[];
  people: { id: string; name: string; role: string }[];
  me: { id: string; sentToday: boolean; relay: boolean; role: "owner" | "staff" };
};

function formatWhen(iso: string) {
  const date = new Date(iso);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function PraiseWall({ preview = false, role }: { preview?: boolean; role: "owner" | "staff" }) {
  const [data, setData] = useState<Payload | null>(null);
  const [message, setMessage] = useState("칭찬 벽을 불러오는 중입니다.");
  const [toUserId, setToUserId] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function load() {
    try {
      const response = await apiFetch(preview, "/api/praise", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error ?? "칭찬 벽을 불러오지 못했습니다.");
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

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNote("");
    try {
      const response = await apiFetch(preview, "/api/praise", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ toUserId, text }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNote(body.error ?? "보내지 못했어요.");
        return;
      }
      setNote("칭찬을 보냈어요! 받은 사람 점수판에 2점, 내 점수판에 1점이 더해져요.");
      setText("");
      setToUserId("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!window.confirm("이 칭찬을 지울까요? (사장만, 부적절한 글일 때)")) return;
    const response = await apiFetch(preview, `/api/praise?id=${id}`, { method: "DELETE" });
    if (response.ok) await load();
  }

  const top = data?.summary.filter((item) => item.received > 0).slice(0, 3) ?? [];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/">← 빈숲 OS</Link>
        <h1>칭찬 릴레이</h1>
        <p>하루에 한 장, 동료 한 사람에게 이름으로 칭찬을 보내요. 받은 사람은 2점, 보낸 사람은 1점. 칭찬을 받았으면 다른 사람에게 이어 주세요 — 그게 릴레이예요.</p>
      </header>

      {preview && <PreviewBanner what="칭찬 릴레이 (가짜 기록 · 이 브라우저에만 저장)" role={role} />}
      {message && <p className={styles.message} role="status">{message}</p>}

      {data?.me.relay && <p className={styles.relay} role="status">🎉 오늘 칭찬을 받았어요! 릴레이를 이어서 누군가에게 칭찬 한 장 보내 볼까요?</p>}

      {data && (
        <form className={styles.form} onSubmit={send} aria-label="칭찬 보내기">
          <h2>{data.me.sentToday ? "오늘 칭찬은 이미 보냈어요 · 내일 또 이어가요" : "오늘의 칭찬 한 장"}</h2>
          <label>
            누구에게
            <select value={toUserId} disabled={data.me.sentToday} onChange={(event) => setToUserId(event.target.value)}>
              <option value="">고르기</option>
              {data.people.map((person) => <option key={person.id} value={person.id}>{person.name}{person.role === "owner" ? " (사장)" : ""}</option>)}
            </select>
          </label>
          <label>
            어떤 점이 좋았나요 ({text.length}/{praiseMaxLength})
            <textarea value={text} maxLength={praiseMaxLength} rows={2} disabled={data.me.sentToday} placeholder="예: 피크 때 먼저 설거지 맡아 줘서 고마워요" onChange={(event) => setText(event.target.value)} />
          </label>
          {!data.me.sentToday && (
            <div className={styles.templates} aria-label="자주 쓰는 칭찬">
              {praiseTemplates.map((template) => <button key={template} type="button" onClick={() => setText(template)}>{template}</button>)}
            </div>
          )}
          <button type="submit" className={styles.primary} disabled={busy || data.me.sentToday || !toUserId || !text.trim()}>{busy ? "보내는 중…" : "칭찬 보내기"}</button>
          {note && <p className={styles.note} role="status">{note}</p>}
        </form>
      )}

      {top.length > 0 && (
        <section className={styles.top} aria-label="이달 칭찬 많이 받은 사람">
          <h2>이달 칭찬을 많이 받은 사람</h2>
          <ol>
            {top.map((item, index) => <li key={item.id}><span>{["🥇", "🥈", "🥉"][index]}</span><b>{item.name}</b><small>받음 {item.received} · 보냄 {item.given}</small></li>)}
          </ol>
        </section>
      )}

      <section className={styles.wall} aria-label="칭찬 벽">
        <h2>칭찬 벽 <small>이달</small></h2>
        {data && data.wall.length === 0 && <p className={styles.empty}>아직 칭찬이 없어요. 첫 칭찬을 보내 릴레이를 시작해 보세요.</p>}
        <ul>
          {data?.wall.map((row) => (
            <li key={row.id} data-mine={row.to_user === data.me.id}>
              <p className={styles.who}><b>{row.to_name}</b>에게 <span>· {row.from_name}</span><time dateTime={row.created_at}>{formatWhen(row.created_at)}</time></p>
              <p className={styles.text}>{row.text}</p>
              {data.me.role === "owner" && <button type="button" className={styles.remove} onClick={() => void remove(row.id)} aria-label="이 칭찬 지우기">지우기</button>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
