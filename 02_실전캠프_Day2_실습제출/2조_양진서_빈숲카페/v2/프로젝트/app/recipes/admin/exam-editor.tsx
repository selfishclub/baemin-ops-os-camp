"use client";

import { defaultExams, getExams, type ExamDef } from "../../exam/exam-data";
import type { RecipeContent } from "../recipe-data";
import styles from "./studio.module.css";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className={styles.field}><span>{label}</span>{children}</label>;
}

// 관리자 편집의 "시험" 탭. 단계마다 필기 문제 수·합격 기준과 실기 항목을 정한다.
// 필기 문제는 레시피·매뉴얼에서 자동으로 만들어지므로 여기서 문제를 쓰지는 않는다.
export default function ExamEditor({ content, onChange }: { content: RecipeContent; onChange: (next: RecipeContent) => void }) {
  const exams = getExams(content);
  const setExams = (next: ExamDef[]) => onChange({ ...content, exams: next });
  const patch = (index: number, changes: Partial<ExamDef>) => setExams(exams.map((exam, itemIndex) => (itemIndex === index ? { ...exam, ...changes } : exam)));
  // 실기 항목은 한 줄에 하나. 줄 위치가 같으면 id 를 이어받아, 글만 고쳤을 때 이미 받은 합격 기록이 끊기지 않게 한다
  const setPractical = (index: number, text: string) => {
    const old = exams[index].practicalItems;
    patch(index, { practicalItems: text.split("\n").map((line, lineIndex) => ({ id: old[lineIndex]?.id ?? `p${Date.now()}-${lineIndex}`, text: line })) });
  };

  return (
    <section className={styles.wideEditor}>
      <div className={styles.sectionTitle}>
        <div><small>EXAMS · CERTIFICATION</small><h2>시험 · 인증 단계</h2></div>
        <span>필기는 레시피·매뉴얼에서 자동 출제·채점, 실기는 사장님이 직접 보고 항목마다 합격 처리합니다. 인증을 승급·시급과 어떻게 이을지는 매장에서 따로 정하세요 (노무 기준 확인 필요).</span>
      </div>

      {exams.map((exam, index) => (
        <article key={exam.id} className={styles.promptGuideCard}>
          <div className={styles.fieldGrid}>
            <Field label="단계 이름"><input value={exam.title} onChange={(event) => patch(index, { title: event.target.value })} /></Field>
            <Field label="무엇을 확인하는 단계인가요"><input value={exam.description} onChange={(event) => patch(index, { description: event.target.value })} /></Field>
            <Field label="필기 문제 수"><input type="number" min={1} max={40} value={exam.writtenCount} onChange={(event) => patch(index, { writtenCount: Math.max(1, Math.min(40, Number(event.target.value) || 1)) })} /></Field>
            <Field label="필기 합격 기준 (맞은 개수)"><input type="number" min={1} max={exam.writtenCount} value={exam.passScore} onChange={(event) => patch(index, { passScore: Math.max(1, Math.min(exam.writtenCount, Number(event.target.value) || 1)) })} /></Field>
          </div>
          <Field label="실기 항목 · 한 줄에 하나씩 (사장님이 직접 보고 합격 처리)">
            <textarea rows={5} value={exam.practicalItems.map((item) => item.text).join("\n")} onChange={(event) => setPractical(index, event.target.value)} />
          </Field>
          <Field label="직원에게 보이는 안내 (언제 보는지, 준비물 등)"><textarea rows={2} value={exam.note} onChange={(event) => patch(index, { note: event.target.value })} /></Field>
          <button type="button" onClick={() => { if (window.confirm("‘" + exam.title + "’ 단계를 지울까요? 직원의 점수·합격 기록은 지워지지 않지만 화면에는 더 이상 안 보여요.")) setExams(exams.filter((_, itemIndex) => itemIndex !== index)); }}>이 단계 삭제</button>
        </article>
      ))}

      <div className={styles.promptGuideActions}>
        <button type="button" onClick={() => setExams([...exams, { id: "exam-" + Date.now(), title: "새 단계", description: "", writtenCount: 10, passScore: 8, practicalItems: [{ id: "p1", text: "" }], note: "" }])}>+ 새 단계</button>
        <button type="button" onClick={() => { if (window.confirm("시험 단계를 처음의 예시(1단계 · 2단계)로 되돌릴까요?")) setExams(structuredClone(defaultExams)); }}>예시로 되돌리기</button>
      </div>
    </section>
  );
}
