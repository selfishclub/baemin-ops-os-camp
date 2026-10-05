"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./quest.module.css";
import { apiFetch } from "../preview/preview-api";
import PreviewBanner from "../preview/preview-banner";
import { isCleared, questsPerWeek, type QuestView } from "./quest-data";

type Mission = { user_id: string; user_name: string; week_start: string; note: string; done_at: string | null; status: string };
type Payload = { weekStart: string; quests: QuestView[]; cleared: number; lastWeek: { weekStart: string; cleared: number; total: number }; missions?: Mission[] };

const kindLabel: Record<QuestView["kind"], string> = { quiz: "문제", practice: "만들어 보기", read: "읽기", mission: "적용 미션" };

function formatWeek(weekStart: string) {
  const [, m, d] = weekStart.split("-");
  const end = new Date(`${weekStart}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return `${Number(m)}/${Number(d)} ~ ${end.getUTCMonth() + 1}/${end.getUTCDate()}`;
}

export default function QuestBoard({ preview = false, role }: { preview?: boolean; role: "owner" | "staff" }) {
  const [data, setData] = useState<Payload | null>(null);
  const [message, setMessage] = useState("이번 주 퀘스트를 불러오는 중입니다.");
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [missionText, setMissionText] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    try {
      const response = await apiFetch(preview, "/api/quest", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error ?? "퀘스트를 불러오지 못했습니다.");
        return;
      }
      setData(body);
      const mission = (body.quests as QuestView[]).find((quest) => quest.kind === "mission");
      setMissionText((current) => current || mission?.note || "");
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

  async function post(body: Record<string, unknown>, key: string) {
    setBusy(key);
    try {
      const response = await apiFetch(preview, "/api/quest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFeedback((current) => ({ ...current, [key]: result.error ?? "저장하지 못했어요." }));
        return null;
      }
      return result;
    } finally {
      setBusy("");
    }
  }

  async function answer(quest: QuestView) {
    const choice = picked[quest.id];
    if (!choice) return;
    const result = await post({ action: "answer", questId: quest.id, choice }, quest.id);
    if (!result) return;
    setFeedback((current) => ({ ...current, [quest.id]: result.correct ? "정답! 퀘스트를 깼어요 🎉" : "아쉽게도 틀렸어요. 레시피·매뉴얼을 다시 보고 한 번 더 골라 보세요." }));
    await load();
  }

  async function mission(claim: boolean) {
    const result = await post({ action: claim ? "claim" : "mission", note: missionText }, "mission");
    if (!result) return;
    setFeedback((current) => ({ ...current, mission: claim ? "‘해냈어요’를 보냈어요. 사장님이 확인하면 깨져요." : "적어 두었어요. 해냈으면 ‘해냈어요’를 눌러요." }));
    await load();
  }

  async function confirm(item: Mission) {
    const result = await post({ action: "confirm", userId: item.user_id, weekStart: item.week_start }, `confirm:${item.user_id}:${item.week_start}`);
    if (result) await load();
  }

  const cleared = data?.cleared ?? 0;
  const total = data?.quests.length ?? questsPerWeek;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/">← 빈숲 OS</Link>
        <h1>이번 주 퀘스트</h1>
        <p>매주 월요일에 새 퀘스트 {questsPerWeek}개가 생겨요. 사람마다 문제가 달라서 서로 베낄 수 없고, 내 것은 나만 보여요. 깬 퀘스트는 점수판에 더해집니다.</p>
      </header>

      {preview && <PreviewBanner what="이번 주 퀘스트 (가짜 기록 · 이 브라우저에만 저장)" role={role} />}
      {message && <p className={styles.message} role="status">{message}</p>}

      {data && (
        <section className={styles.progress} aria-label="진행">
          <div>
            <strong>{cleared} / {total}</strong>
            <span>{formatWeek(data.weekStart)} · {cleared >= total ? "이번 주 퀘스트를 다 깼어요! 🌳" : `${total - cleared}개 남았어요`}</span>
          </div>
          <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={cleared}><span style={{ width: `${total ? Math.round((cleared / total) * 100) : 0}%` }} /></div>
          <small>지난주 {data.lastWeek.cleared} / {data.lastWeek.total}</small>
        </section>
      )}

      <ol className={styles.list}>
        {data?.quests.map((quest, index) => {
          const done = isCleared(quest.status);
          return (
            <li key={quest.id} className={styles.quest} data-kind={quest.kind} data-done={done} data-pending={quest.status === "pending"}>
              <header>
                <span className={styles.num}>{done ? "✓" : index + 1}</span>
                <div>
                  <small>{kindLabel[quest.kind]} · {quest.points}점</small>
                  <h2>{quest.title}</h2>
                </div>
                <b className={styles.state}>{done ? "깼어요" : quest.status === "pending" ? "확인 대기" : "진행 중"}</b>
              </header>
              <p>{quest.detail}</p>

              {quest.kind === "quiz" && !done && (
                <div className={styles.choices} role="group" aria-label="보기">
                  {quest.choices?.map((choice) => (
                    <button key={choice} type="button" aria-pressed={picked[quest.id] === choice} onClick={() => setPicked((current) => ({ ...current, [quest.id]: choice }))}>{choice}</button>
                  ))}
                  <button type="button" className={styles.primary} disabled={!picked[quest.id] || busy === quest.id} onClick={() => void answer(quest)}>정답 제출{quest.attempts ? ` (${quest.attempts}번 틀림)` : ""}</button>
                </div>
              )}
              {quest.kind === "quiz" && done && <small className={styles.hint}>{quest.attempts <= 1 ? "한 번에 맞혔어요" : `${quest.attempts}번 만에 맞혔어요`}</small>}

              {(quest.kind === "practice" || quest.kind === "read") && !done && quest.href && (
                <Link href={quest.href} className={styles.go}>{quest.kind === "practice" ? "교육 경로에서 ‘만들어 봤음’ 누르러 가기 →" : "문서 읽으러 가기 →"}</Link>
              )}

              {quest.kind === "mission" && (
                <div className={styles.mission}>
                  <textarea value={missionText} maxLength={200} rows={2} placeholder="예: 라떼 스팀 때 피처 온도계 꼭 꽂기" disabled={done || quest.status === "pending"} onChange={(event) => setMissionText(event.target.value)} />
                  {!done && quest.status !== "pending" && (
                    <div className={styles.row}>
                      <button type="button" disabled={!missionText.trim() || busy === "mission"} onClick={() => void mission(false)}>적어 두기</button>
                      <button type="button" className={styles.primary} disabled={!missionText.trim() || busy === "mission"} onClick={() => void mission(true)}>해냈어요</button>
                    </div>
                  )}
                  {quest.status === "pending" && <small className={styles.hint}>사장님 확인을 기다리는 중이에요.</small>}
                  {done && <small className={styles.hint}>사장님이 확인했어요{quest.confirmed_by_name ? ` · ${quest.confirmed_by_name}` : ""}.</small>}
                </div>
              )}

              {feedback[quest.id] && <p className={styles.feedback} role="status">{feedback[quest.id]}</p>}
            </li>
          );
        })}
      </ol>

      {data?.missions && (
        <section className={styles.owner} aria-label="사장 확인">
          <h2>직원 적용 미션 <small>사장만 보여요</small></h2>
          {data.missions.length === 0 && <p className={styles.empty}>아직 ‘해냈어요’를 보낸 직원이 없어요.</p>}
          <ul>
            {data.missions.map((item) => (
              <li key={`${item.user_id}:${item.week_start}`} data-done={item.status === "confirmed"}>
                <div>
                  <b>{item.user_name}</b> <small>{formatWeek(item.week_start)}</small>
                  <p>{item.note}</p>
                </div>
                {item.status === "pending"
                  ? <button type="button" disabled={busy === `confirm:${item.user_id}:${item.week_start}`} onClick={() => void confirm(item)}>해냈다고 확인</button>
                  : <span>확인함</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
