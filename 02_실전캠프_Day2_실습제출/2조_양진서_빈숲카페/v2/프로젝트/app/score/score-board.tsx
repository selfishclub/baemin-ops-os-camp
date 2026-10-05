"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./score.module.css";
import { apiFetch } from "../preview/preview-api";
import PreviewBanner from "../preview/preview-banner";
import { periodLabels, scoreCategories, type ActivityCounts, type BoardRow, type BreakdownItem, type Highlight, type LevelDef, type LevelStatus, type Period } from "./score-data";

type Me = { id: string; name: string; role: "owner" | "staff"; allTime: number; period: number; level: LevelStatus; breakdown: BreakdownItem[]; breakdownAll: BreakdownItem[] };
type Payload = { period: Period; levels: LevelDef[]; me: Me; board: BoardRow[]; stats?: { rows: ActivityCounts[]; highlights: Highlight[] } };

const statColumns: { key: keyof ActivityCounts; label: string }[] = [
  { key: "checks", label: "오늘 체크" },
  { key: "acks", label: "확인했어요" },
  { key: "docs_read", label: "매뉴얼 읽음" },
  { key: "practiced_recipes", label: "메뉴 해 봄" },
  { key: "confirmed_recipes", label: "메뉴 확인됨" },
  { key: "quiz_passed", label: "퀴즈 통과" },
  { key: "exam_items", label: "실기 합격" },
  { key: "exam_written", label: "필기 합격" },
  { key: "quests_done", label: "퀘스트" },
  { key: "missions_done", label: "미션" },
  { key: "reads", label: "열람" },
];

export default function ScoreBoard({ preview = false, role }: { preview?: boolean; role: "owner" | "staff" }) {
  const [period, setPeriod] = useState<Period>("month");
  const [data, setData] = useState<Payload | null>(null);
  const [message, setMessage] = useState("점수판을 불러오는 중입니다.");

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      try {
        const response = await apiFetch(preview, `/api/score?period=${period}`, { cache: "no-store" });
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setMessage(body.error ?? "점수판을 불러오지 못했습니다.");
          return;
        }
        setData(body);
        setMessage("");
      } catch {
        if (!cancelled) setMessage("연결이 끊겼어요. 잠시 후 다시 열어 주세요.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [preview, period]);

  const me = data?.me;
  const myRow = data?.board.find((row) => row.id === me?.id);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/">← 빈숲 OS</Link>
        <h1>레벨 · 점수판</h1>
        <p>오늘 체크, 매뉴얼 읽기, 메뉴 연습, 퀴즈·시험, 바뀐 내용 확인 — 한 일이 그대로 점수가 되고 레벨이 올라갑니다. 점수는 재미와 격려용이에요. 급여·승급은 시험·인증에서 따로 정합니다.</p>
      </header>

      {preview && <PreviewBanner what="레벨 · 점수판 (가짜 기록으로 계산)" role={role} />}
      {message && <p className={styles.message} role="status">{message}</p>}

      {me && (
        <section className={styles.me} aria-label="내 레벨">
          <div className={styles.levelMark} aria-hidden="true">{me.level.level.mark}</div>
          <div className={styles.levelBody}>
            <p className={styles.levelName}>{me.name} · <strong>{me.level.level.name}</strong> <small>{me.level.level.note}</small></p>
            <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(me.level.progress * 100)}>
              <span style={{ width: `${Math.round(me.level.progress * 100)}%` }} />
            </div>
            <p className={styles.levelHint}>
              누적 {me.allTime}점{me.level.next ? ` · ${me.level.next.name}까지 ${me.level.toNext}점` : " · 최고 레벨이에요"}
              {me.role !== "owner" && myRow ? ` · ${periodLabels[period]} ${myRow.rank}위` : ""}
            </p>
          </div>
        </section>
      )}

      {data && (
        <nav className={styles.levels} aria-label="레벨 단계">
          {data.levels.map((level) => (
            <span key={level.name} data-on={me ? me.allTime >= level.min : false}>{level.mark} {level.name} <small>{level.min}점~</small></span>
          ))}
        </nav>
      )}

      <section className={styles.controls}>
        <div role="group" aria-label="기간">
          {(["week", "month", "all"] as Period[]).map((item) => (
            <button key={item} type="button" aria-pressed={period === item} onClick={() => setPeriod(item)}>{periodLabels[item]}</button>
          ))}
        </div>
      </section>

      {data && (
        <section className={styles.board} aria-label="점수판">
          <h2>{periodLabels[period]} 점수판</h2>
          {data.board.length === 0 && <p className={styles.empty}>아직 직원 계정이 없어요. 직원이 생기면 여기 줄이 생깁니다.</p>}
          <ol>
            {data.board.map((row) => (
              <li key={row.id} data-me={row.id === me?.id} data-rank={row.rank}>
                <span className={styles.rank}>{row.rank}</span>
                <span className={styles.who}><b>{row.name}</b><small>{row.level.level.mark} {row.level.level.name} · 누적 {row.allTime}점</small></span>
                <span className={styles.points}>{row.period}점</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {me && (
        <section className={styles.detail} aria-label="내 점수 내역">
          <h2>내 점수 내역 <small>{periodLabels[period]}</small></h2>
          <table>
            <tbody>
              {me.breakdown.map((item) => (
                <tr key={item.key} data-zero={item.count === 0}>
                  <th scope="row">{item.label}</th>
                  <td>{item.count}{item.unit} × {item.each}점</td>
                  <td>{item.points}점</td>
                </tr>
              ))}
              <tr className={styles.sum}><th scope="row">합계</th><td /><td>{me.period}점</td></tr>
            </tbody>
          </table>
          <p className={styles.rule}>점수 규칙: {scoreCategories.map((item) => `${item.label} ${item.points}점`).join(" · ")}</p>
        </section>
      )}

      {data?.stats && (
        <section className={styles.stats} aria-label="사장 통계">
          <h2>누가 무엇을 제일 많이 했나 <small>{periodLabels[period]} · 사장만 보여요</small></h2>
          {data.stats.highlights.length ? (
            <ul className={styles.highlights}>
              {data.stats.highlights.map((item) => <li key={item.key}><span>{item.label}</span><b>{item.name}</b><small>{item.count}건</small></li>)}
            </ul>
          ) : <p className={styles.empty}>이 기간에는 아직 기록이 없어요.</p>}
          <div className={styles.tableWrap}>
            <table className={styles.statTable}>
              <thead>
                <tr><th>이름</th>{statColumns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
              </thead>
              <tbody>
                {data.stats.rows.map((row) => (
                  <tr key={row.user_id} data-owner={row.role === "owner"}>
                    <th scope="row">{row.display_name || row.login_id}{row.role === "owner" ? " (사장)" : ""}</th>
                    {statColumns.map((column) => <td key={column.key} data-zero={Number(row[column.key]) === 0}>{Number(row[column.key])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.rule}>사장 ‘확인함’ 도장은 점수에 넣지 않고 사장 줄에만 표시됩니다. 열람은 점수가 아니라 참고용입니다.</p>
        </section>
      )}
    </main>
  );
}
