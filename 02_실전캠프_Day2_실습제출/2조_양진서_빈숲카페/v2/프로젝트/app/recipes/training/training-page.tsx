"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { RecipeContent } from "../recipe-data";
import { buildQuiz, type QuizQuestion } from "../quiz";
import styles from "./training.module.css";
import { apiFetch } from "../../preview/preview-api";
import PreviewBanner from "../../preview/preview-banner";

type Viewer = { id: string; displayName: string; role: "owner" | "staff" };
type Row = { recipe_id: string; recipe_name: string; category: string; practiced_at: string | null; confirmed_at: string | null; confirmed_by_name: string | null };
type Training = { rows: Row[]; total: number; practiced: number; confirmed: number };
type QuizRecord = { id: number; score: number; total: number; created_at: string };
type StaffSummary = { id: string; name: string; role: string; active: boolean; practiced: number; confirmed: number; quiz: { score: number; total: number; created_at: string } | null };

function day(value: string | null) {
  return value ? `${new Date(value).getMonth() + 1}/${new Date(value).getDate()}` : "";
}

export default function TrainingPage({ viewer, preview = false }: { viewer: Viewer; preview?: boolean }) {
  const isOwner = viewer.role === "owner";
  const [message, setMessage] = useState("불러오는 중입니다.");
  const [training, setTraining] = useState<Training | null>(null);
  const [quizHistory, setQuizHistory] = useState<QuizRecord[]>([]);
  const [overview, setOverview] = useState<{ total: number; staff: StaffSummary[] } | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffSummary | null>(null);
  const [busyRecipe, setBusyRecipe] = useState("");

  // 퀴즈
  const [content, setContent] = useState<RecipeContent | null>(null);
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [current, setCurrent] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [answers, setAnswers] = useState<{ question: string; answer: string; chosen: string; correct: boolean }[]>([]);
  const [quizDone, setQuizDone] = useState(false);

  async function loadMine() {
    const response = await apiFetch(preview, "/api/training", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "불러오지 못했습니다.");
      return;
    }
    setTraining({ rows: body.rows, total: body.total, practiced: body.practiced, confirmed: body.confirmed });
    setQuizHistory(body.quiz ?? []);
    setMessage("");
  }

  async function loadOverview() {
    const response = await apiFetch(preview, "/api/admin/training", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "불러오지 못했습니다.");
      return;
    }
    setOverview(body);
    setMessage("");
  }

  async function loadStaff(person: StaffSummary) {
    setSelectedStaff(person);
    setTraining(null);
    const response = await apiFetch(preview, `/api/admin/training?user=${encodeURIComponent(person.id)}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "불러오지 못했습니다.");
      return;
    }
    setTraining(body);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      void (isOwner ? loadOverview() : loadMine());
      apiFetch(preview, "/api/content", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((body) => {
          if (!cancelled && body?.content) setContent(body.content);
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  async function practiced(recipeId: string) {
    setBusyRecipe(recipeId);
    try {
      const response = await apiFetch(preview, "/api/training", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipeId }) });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error ?? "기록하지 못했습니다.");
        return;
      }
      setTraining({ rows: body.rows, total: body.total, practiced: body.practiced, confirmed: body.confirmed });
    } finally {
      setBusyRecipe("");
    }
  }

  async function confirm(recipeId: string) {
    if (!selectedStaff) return;
    setBusyRecipe(recipeId);
    try {
      const response = await apiFetch(preview, "/api/admin/training", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: selectedStaff.id, recipeId }) });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error ?? "저장하지 못했습니다.");
        return;
      }
      setTraining(body);
      void loadOverview();
    } finally {
      setBusyRecipe("");
    }
  }

  function startQuiz() {
    if (!content) return;
    const questions = buildQuiz(content, 10);
    setQuiz(questions);
    setCurrent(0);
    setChosen(null);
    setAnswers([]);
    setQuizDone(false);
  }

  async function nextQuestion() {
    if (!chosen) return;
    const question = quiz[current];
    const record = { question: question.question, answer: question.answer, chosen, correct: chosen === question.answer };
    const nextAnswers = [...answers, record];
    setAnswers(nextAnswers);
    setChosen(null);
    if (current + 1 < quiz.length) {
      setCurrent(current + 1);
      return;
    }
    setQuizDone(true);
    const score = nextAnswers.filter((item) => item.correct).length;
    const response = await apiFetch(preview, "/api/quiz", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ score, total: nextAnswers.length, detail: nextAnswers }) });
    if (response.ok) {
      const body = await response.json();
      setQuizHistory(body.quiz ?? []);
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of training?.rows ?? []) map.set(row.category, [...(map.get(row.category) ?? []), row]);
    return [...map.entries()];
  }, [training]);

  const score = answers.filter((item) => item.correct).length;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/">← 빈숲 OS 홈</Link>
        <h1>{isOwner && !selectedStaff ? "직원 교육 현황" : selectedStaff ? `${selectedStaff.name} 메뉴 체크리스트` : "내 메뉴 체크리스트"}</h1>
        <p>
          {isOwner
            ? "직원이 메뉴를 만들어 보고 ‘만들어 봤음’을 누르면, 사장님이 직접 보고 ‘확인함’을 눌러 주세요. 퀴즈 점수도 같이 보여요."
            : "메뉴를 직접 만들어 봤으면 ‘만들어 봤음’을 누르세요. 사장님이 보고 ‘확인함’을 눌러 주면 완료예요."}
        </p>
      </header>

      {preview && <PreviewBanner what={isOwner ? "직원 교육 현황 · 직원별 체크리스트 ‘확인함’ · 퀴즈" : "내 메뉴 체크리스트 ‘만들어 봤음’ · 퀴즈"} role={viewer.role} />}
      {message && <p className={styles.message} role="status">{message}</p>}

      {isOwner && !selectedStaff && overview && (
        <table className={styles.table}>
          <thead><tr><th>직원</th><th>만들어 봤음</th><th>확인함</th><th>최근 퀴즈</th><th></th></tr></thead>
          <tbody>
            {overview.staff.filter((person) => person.active).map((person) => (
              <tr key={person.id}>
                <td><strong>{person.name}</strong>{person.role === "owner" && <small> 사장</small>}</td>
                <td>{person.practiced} / {overview.total}</td>
                <td><b className={person.confirmed === overview.total && overview.total > 0 ? styles.done : ""}>{person.confirmed} / {overview.total}</b></td>
                <td>{person.quiz ? `${person.quiz.score} / ${person.quiz.total} (${day(person.quiz.created_at)})` : "-"}</td>
                <td><button type="button" onClick={() => void loadStaff(person)}>체크리스트 보기</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selectedStaff && (
        <p className={styles.back}><button type="button" onClick={() => { setSelectedStaff(null); setTraining(null); }}>← 직원 목록</button></p>
      )}

      {training && (
        <>
          <div className={styles.progress} aria-label="진행률">
            <span style={{ width: `${training.total ? Math.round((training.confirmed / training.total) * 100) : 0}%` }} />
          </div>
          <p className={styles.progressText}>
            만들어 봤음 {training.practiced} · 확인함 {training.confirmed} · 전체 {training.total}
          </p>
          {grouped.map(([category, rows]) => (
            <section key={category} className={styles.group}>
              <h2>{category}</h2>
              <ul>
                {rows.map((row) => (
                  <li key={row.recipe_id} data-confirmed={Boolean(row.confirmed_at)}>
                    <div>
                      <strong>{row.recipe_name}</strong>
                      <small>
                        {row.practiced_at ? `만들어 봤음 ${day(row.practiced_at)}` : "아직"}
                        {row.confirmed_at ? ` · 확인함 ${day(row.confirmed_at)}${row.confirmed_by_name ? ` (${row.confirmed_by_name})` : ""}` : ""}
                      </small>
                    </div>
                    <div>
                      {!selectedStaff && (
                        <button type="button" data-on={Boolean(row.practiced_at)} disabled={busyRecipe === row.recipe_id} onClick={() => void practiced(row.recipe_id)}>
                          {row.practiced_at ? "만들어 봤음 ✓" : "만들어 봤음"}
                        </button>
                      )}
                      {selectedStaff && (
                        <button type="button" data-on={Boolean(row.confirmed_at)} disabled={busyRecipe === row.recipe_id} onClick={() => void confirm(row.recipe_id)}>
                          {row.confirmed_at ? "확인함 ✓ (취소)" : "확인함"}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      {!selectedStaff && (
        <section className={styles.quiz} aria-labelledby="quiz-title">
          <div className={styles.quizHead}>
            <div>
              <p>RECIPE QUIZ</p>
              <h2 id="quiz-title">레시피 퀴즈</h2>
              <span>레시피 정량·순서로 문제 10개를 자동으로 만들어요. 신입 교육 마무리용.</span>
              {!content && <span> · 레시피 영역이 잠겨 있으면 퀴즈를 만들 수 없어요.</span>}
            </div>
            {quiz.length === 0 || quizDone ? (
              <button type="button" className={styles.primary} disabled={!content} onClick={startQuiz}>{quizDone ? "다시 풀기" : "퀴즈 시작"}</button>
            ) : null}
          </div>

          {quiz.length > 0 && !quizDone && (
            <div className={styles.question}>
              <small>{current + 1} / {quiz.length}</small>
              <h3>{quiz[current].question}</h3>
              <div className={styles.choices}>
                {quiz[current].choices.map((choice) => (
                  <button key={choice} type="button" data-chosen={chosen === choice} onClick={() => setChosen(choice)}>{choice}</button>
                ))}
              </div>
              <button type="button" className={styles.primary} disabled={!chosen} onClick={() => void nextQuestion()}>
                {current + 1 < quiz.length ? "다음" : "결과 보기"}
              </button>
            </div>
          )}

          {quizDone && (
            <div className={styles.result}>
              <h3>{score} / {answers.length} 맞았어요</h3>
              <ul>
                {answers.filter((item) => !item.correct).map((item) => (
                  <li key={item.question}><strong>{item.question}</strong><span>정답: {item.answer} · 내 답: {item.chosen}</span></li>
                ))}
              </ul>
              {answers.every((item) => item.correct) && <p>전부 맞았어요. 사장님 화면에 점수가 기록됐어요.</p>}
            </div>
          )}

          {quizHistory.length > 0 && (
            <p className={styles.history}>
              최근 기록: {quizHistory.slice(0, 5).map((record) => `${record.score}/${record.total} (${day(record.created_at)})`).join(" · ")}
            </p>
          )}
        </section>
      )}
    </main>
  );
}
