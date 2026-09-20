"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ManualDoc } from "../manual/manual-data";
import { buildManualQuiz } from "../manual/training-path";
import { apiFetch } from "../preview/preview-api";
import PreviewBanner from "../preview/preview-banner";
import { buildQuiz, type QuizQuestion } from "../recipes/quiz";
import type { RecipeContent } from "../recipes/recipe-data";
import type { ExamStatus } from "./exam-data";
import styles from "./exam.module.css";

type OverviewExam = { id: string; best: { score: number; total: number } | null; writtenPassed: boolean; practicalPassed: number; practicalTotal: number; waiting: number; certified: boolean };
type Overview = { exams: { id: string; title: string }[]; staff: { id: string; name: string; role: string; exams: OverviewExam[] }[] };
type Answer = { question: string; answer: string; chosen: string; correct: boolean };

function day(value: string | null) {
  return value ? `${new Date(value).getMonth() + 1}/${new Date(value).getDate()}` : "";
}

export default function ExamPage({ role, preview, lockedForStaff }: { role: "owner" | "staff"; preview: boolean; lockedForStaff: boolean }) {
  const isOwner = role === "owner";
  const [message, setMessage] = useState("불러오는 중입니다.");
  const [exams, setExams] = useState<ExamStatus[]>([]);
  const [manuals, setManuals] = useState<ManualDoc[]>([]);
  const [content, setContent] = useState<RecipeContent | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [busyKey, setBusyKey] = useState("");

  // 필기 시험 진행
  const [testing, setTesting] = useState<ExamStatus | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [current, setCurrent] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [finished, setFinished] = useState<{ score: number; total: number; passed: boolean } | null>(null);

  async function read(url: string, init?: RequestInit) {
    const response = await apiFetch(preview, url, { cache: "no-store", ...init });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "불러오지 못했습니다.");
      return null;
    }
    setMessage("");
    return body;
  }

  async function loadMine() {
    const body = await read("/api/exam");
    if (!body) return;
    setExams(body.exams ?? []);
    setManuals(body.manuals ?? []);
  }

  async function loadOverview() {
    const body = await read("/api/admin/exam");
    if (body) setOverview(body);
  }

  async function openStaff(person: { id: string; name: string }) {
    setSelected(person);
    setExams([]);
    const body = await read(`/api/admin/exam?user=${encodeURIComponent(person.id)}`);
    if (body) setExams(body.exams ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      void (isOwner ? loadOverview() : loadMine());
      if (!isOwner) {
        apiFetch(preview, "/api/content", { cache: "no-store" })
          .then((response) => (response.ok ? response.json() : null))
          .then((body) => { if (!cancelled && body?.content) setContent(body.content); })
          .catch(() => {});
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  async function ready(examId: string, itemId: string) {
    setBusyKey(`${examId}:${itemId}`);
    try {
      const body = await read("/api/exam", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "ready", examId, itemId }) });
      if (body) setExams(body.exams ?? []);
    } finally {
      setBusyKey("");
    }
  }

  async function pass(examId: string, itemId: string) {
    if (!selected) return;
    setBusyKey(`${examId}:${itemId}`);
    try {
      const body = await read("/api/admin/exam", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: selected.id, examId, itemId }) });
      if (body) {
        setExams(body.exams ?? []);
        void loadOverview();
      }
    } finally {
      setBusyKey("");
    }
  }

  function startWritten(exam: ExamStatus) {
    // 매뉴얼 문제를 40%쯤, 나머지는 레시피에서. 한쪽이 잠겨 있으면 열려 있는 쪽으로만 낸다
    const manualCount = content ? Math.round(exam.writtenCount * 0.4) : exam.writtenCount;
    const manualQuestions = buildManualQuiz(manuals, manualCount);
    const list = [...(content ? buildQuiz(content, exam.writtenCount - manualQuestions.length) : []), ...manualQuestions];
    if (!list.length) {
      setMessage("문제를 만들 레시피·매뉴얼이 열려 있지 않아요. 책임자에게 열어 달라고 요청해 주세요.");
      return;
    }
    setTesting(exam);
    setQuestions(list);
    setCurrent(0);
    setChosen(null);
    setAnswers([]);
    setFinished(null);
  }

  async function next() {
    if (!chosen || !testing) return;
    const question = questions[current];
    const all = [...answers, { question: question.question, answer: question.answer, chosen, correct: chosen === question.answer }];
    setAnswers(all);
    setChosen(null);
    if (current + 1 < questions.length) {
      setCurrent(current + 1);
      return;
    }
    const score = all.filter((item) => item.correct).length;
    // 문제 수가 모자라게 만들어졌으면 합격 기준도 같은 비율로 낮춘다
    const needed = Math.ceil((testing.passScore / testing.writtenCount) * all.length);
    setFinished({ score, total: all.length, passed: score >= needed });
    const body = await read("/api/exam", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "written", examId: testing.id, score, total: all.length, answers: all }) });
    if (body) setExams(body.exams ?? []);
  }

  const showCards = !isOwner || selected;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/">← 빈숲 OS 홈</Link>
        <h1>{isOwner ? (selected ? `${selected.name} · 시험 · 인증` : "시험 · 인증 현황") : "시험 · 인증"}</h1>
        <p>
          {isOwner
            ? "필기는 자동으로 채점되고, 실기는 사장님이 직접 보고 항목마다 ‘합격’을 눌러 주세요. 필기 합격 + 실기 전부 합격이면 그 단계 인증이에요. 평소엔 ‘메뉴 잠금 설정’에서 이 영역을 잠가 두고 시험 볼 때만 여세요."
            : "단계마다 필기(자동 채점)와 실기(책임자가 직접 보고 합격 처리)를 봐요. 실기는 준비되면 ‘볼 준비 됐어요’를 눌러 알려 주세요."}
        </p>
      </header>

      {preview && <PreviewBanner what={isOwner ? "시험 · 인증 현황 · 실기 합격 처리" : "필기 시험 · 실기 ‘볼 준비 됐어요’"} role={role} />}
      {lockedForStaff && <p className={styles.notice} role="status">지금 시험 영역은 직원에게 잠겨 있어요. 사장님만 보이는 상태예요.</p>}
      {message && <p className={styles.notice} role="status">{message}</p>}

      {isOwner && !selected && overview && (
        <table className={styles.table}>
          <thead><tr><th>직원</th>{overview.exams.map((exam) => <th key={exam.id}>{exam.title}</th>)}<th></th></tr></thead>
          <tbody>
            {overview.staff.map((person) => (
              <tr key={person.id}>
                <td><strong>{person.name}</strong>{person.role === "owner" && <small> 사장</small>}</td>
                {person.exams.map((exam) => (
                  <td key={exam.id}>
                    {exam.certified ? <b className={styles.certified}>인증 ✓</b> : (
                      <>
                        필기 {exam.best ? `${exam.best.score}/${exam.best.total}${exam.writtenPassed ? " 합격" : ""}` : "-"} · 실기 {exam.practicalPassed}/{exam.practicalTotal}
                        {exam.waiting > 0 && <em className={styles.waiting}> 실기 대기 {exam.waiting}</em>}
                      </>
                    )}
                  </td>
                ))}
                <td><button type="button" onClick={() => void openStaff(person)}>자세히 · 합격 처리</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected && <p className={styles.back}><button type="button" onClick={() => { setSelected(null); setExams([]); }}>← 직원 목록</button></p>}

      {showCards && !testing && exams.map((exam) => (
        <section key={exam.id} className={styles.exam} data-certified={exam.certified}>
          <header>
            <div>
              <h2>{exam.title}</h2>
              <p>{exam.description}</p>
            </div>
            <span className={styles.badge} data-on={exam.certified}>{exam.certified ? "인증 완료" : "진행 중"}</span>
          </header>
          {exam.note && <p className={styles.note}>{exam.note}</p>}

          <div className={styles.part}>
            <h3>필기 <small>{exam.writtenCount}문제 중 {exam.passScore}개 이상 맞으면 합격</small></h3>
            <p>
              {exam.best ? <>가장 좋은 점수 <strong>{exam.best.score} / {exam.best.total}</strong> · {exam.writtenPassed ? <b className={styles.certified}>합격</b> : "아직 기준 미달"}</> : "아직 안 봤어요."}
              {exam.attempts.length > 0 && <small> · 최근: {exam.attempts.map((row) => `${row.score}/${row.total} (${day(row.created_at)})`).join(" · ")}</small>}
            </p>
            {!isOwner && <button type="button" className={styles.primary} onClick={() => startWritten(exam)}>{exam.best ? "필기 다시 보기" : "필기 시험 보기"}</button>}
          </div>

          <div className={styles.part}>
            <h3>실기 <small>책임자가 직접 보고 항목마다 합격 처리해요</small></h3>
            <ul>
              {exam.practical.map((item) => (
                <li key={item.id} data-passed={Boolean(item.passed_at)}>
                  <div>
                    <strong>{item.text}</strong>
                    <small>
                      {item.passed_at ? `합격 ${day(item.passed_at)}${item.passed_by_name ? ` (${item.passed_by_name})` : ""}` : item.ready_at ? `볼 준비 됐어요 ${day(item.ready_at)} · 책임자 확인 대기` : "아직"}
                    </small>
                  </div>
                  {!isOwner && !item.passed_at && (
                    <button type="button" data-on={Boolean(item.ready_at)} disabled={busyKey === `${exam.id}:${item.id}`} onClick={() => void ready(exam.id, item.id)}>{item.ready_at ? "볼 준비 됐어요 ✓" : "볼 준비 됐어요"}</button>
                  )}
                  {isOwner && selected && (
                    <button type="button" data-on={Boolean(item.passed_at)} disabled={busyKey === `${exam.id}:${item.id}`} onClick={() => void pass(exam.id, item.id)}>{item.passed_at ? "합격 ✓ (취소)" : "합격"}</button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      {testing && (
        <section className={styles.test} aria-live="polite">
          <h2>{testing.title} · 필기</h2>
          {!finished && questions[current] && (
            <>
              <small>{current + 1} / {questions.length}</small>
              <h3>{questions[current].question}</h3>
              <div className={styles.choices}>
                {questions[current].choices.map((choice) => <button key={choice} type="button" data-chosen={chosen === choice} onClick={() => setChosen(choice)}>{choice}</button>)}
              </div>
              <button type="button" className={styles.primary} disabled={!chosen} onClick={() => void next()}>{current + 1 < questions.length ? "다음" : "제출하기"}</button>
            </>
          )}
          {finished && (
            <div className={styles.result}>
              <h3>{finished.score} / {finished.total} · {finished.passed ? "필기 합격이에요" : "아직 기준에 못 미쳤어요"}</h3>
              <ul>
                {answers.filter((item) => !item.correct).map((item) => <li key={item.question}><strong>{item.question}</strong><span>정답: {item.answer} · 내 답: {item.chosen}</span></li>)}
              </ul>
              <button type="button" className={styles.primary} onClick={() => setTesting(null)}>돌아가기</button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
