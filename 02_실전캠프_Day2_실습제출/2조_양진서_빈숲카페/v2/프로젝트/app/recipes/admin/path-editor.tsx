"use client";

import { getManuals } from "../../manual/manual-data";
import { defaultTrainingPath, getTrainingPath, type PathItem, type TrainingStage } from "../../manual/training-path";
import { portalSections } from "../../portal-sections";
import type { RecipeContent } from "../recipe-data";
import styles from "./studio.module.css";

const sectionTitle = (id: string) => portalSections.find((section) => section.id === id)?.title ?? id;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className={styles.field}><span>{label}</span>{children}</label>;
}

// 관리자 편집의 "교육 경로" 탭. 단계(1일차, 1주차 …)마다 익힐 매뉴얼 문서·응대 카드·메뉴를 고른다.
export default function PathEditor({ content, onChange }: { content: RecipeContent; onChange: (next: RecipeContent) => void }) {
  const stages = getTrainingPath(content);
  const manuals = getManuals(content);
  const setStages = (next: TrainingStage[]) => onChange({ ...content, trainingPath: next });
  const patchStage = (index: number, changes: Partial<TrainingStage>) => setStages(stages.map((stage, itemIndex) => (itemIndex === index ? { ...stage, ...changes } : stage)));
  const has = (stage: TrainingStage, item: PathItem) => stage.items.some((entry) => entry.type === item.type && entry.id === item.id);
  const toggle = (index: number, item: PathItem) => {
    const stage = stages[index];
    patchStage(index, { items: has(stage, item) ? stage.items.filter((entry) => !(entry.type === item.type && entry.id === item.id)) : [...stage.items, item] });
  };
  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= stages.length) return;
    const next = [...stages];
    [next[index], next[target]] = [next[target], next[index]];
    setStages(next);
  };
  const sectionIds = [...new Set(manuals.map((doc) => doc.sectionId))];

  return (
    <section className={styles.wideEditor}>
      <div className={styles.sectionTitle}>
        <div><small>TRAINING PATH</small><h2>신입 교육 경로</h2></div>
        <span>단계마다 익힐 문서·응대 카드·메뉴를 고릅니다. 직원이 ‘읽었어요 / 만들어 봤음’을 누르고, 사장님이 직접 보고 ‘확인함’을 눌러야 끝납니다.</span>
      </div>

      {stages.map((stage, index) => (
        <article key={stage.id} className={styles.promptGuideCard}>
          <div className={styles.fieldGrid}>
            <Field label="단계 이름 (예: 1일차, 1주차)"><input value={stage.title} onChange={(event) => patchStage(index, { title: event.target.value })} /></Field>
            <Field label="이 단계가 끝나면 할 수 있어야 하는 것"><input value={stage.goal} onChange={(event) => patchStage(index, { goal: event.target.value })} /></Field>
          </div>
          <details className={styles.pathPicker}>
            <summary>이 단계에 넣을 것 고르기 · 지금 {stage.items.length}개</summary>
            {sectionIds.map((sectionId) => (
              <fieldset key={sectionId}>
                <legend>{sectionTitle(sectionId)}</legend>
                {manuals.filter((doc) => doc.sectionId === sectionId).map((doc) => (
                  <label key={doc.id}><input type="checkbox" checked={has(stage, { type: "manual", id: doc.id })} onChange={() => toggle(index, { type: "manual", id: doc.id })} /> {doc.title}</label>
                ))}
              </fieldset>
            ))}
            <fieldset>
              <legend>레시피 (만들어 봤음)</legend>
              {content.recipes.map((recipe) => (
                <label key={recipe.id}><input type="checkbox" checked={has(stage, { type: "recipe", id: recipe.id })} onChange={() => toggle(index, { type: "recipe", id: recipe.id })} /> {recipe.name}</label>
              ))}
            </fieldset>
          </details>
          <div className={styles.promptGuideActions}>
            <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>↑ 앞 단계로</button>
            <button type="button" disabled={index === stages.length - 1} onClick={() => move(index, 1)}>↓ 뒤 단계로</button>
            <button type="button" onClick={() => { if (window.confirm("‘" + stage.title + "’ 단계를 지울까요? 직원의 읽음·확인 기록은 지워지지 않아요.")) setStages(stages.filter((_, itemIndex) => itemIndex !== index)); }}>이 단계 삭제</button>
          </div>
        </article>
      ))}

      <div className={styles.promptGuideActions}>
        <button type="button" onClick={() => setStages([...stages, { id: "stage-" + Date.now(), title: "새 단계", goal: "", items: [] }])}>+ 새 단계</button>
        <button type="button" onClick={() => { if (window.confirm("교육 경로를 처음의 예시(1일차 · 1주차 · 2주차 · 30일차)로 되돌릴까요?")) setStages(structuredClone(defaultTrainingPath)); }}>예시 경로로 되돌리기</button>
      </div>
    </section>
  );
}
