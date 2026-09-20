"use client";

import { useState } from "react";
import { defaultManuals, getManuals, manualLabels, manualSectionIds, newManualDoc, responseGroups, type ManualDoc, type ManualKind, type ManualSectionId } from "../../manual/manual-data";
import { portalSections } from "../../portal-sections";
import type { RecipeContent } from "../recipe-data";
import styles from "./studio.module.css";

const sectionTitle = (id: string) => portalSections.find((section) => section.id === id)?.title ?? id;

const lines = (value: string[]) => value.join("\n");
const fromLines = (value: string) => value.split("\n");

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className={styles.field}><span>{label}</span>{children}</label>;
}

// 관리자 편집의 "매뉴얼" 탭. 운영 매뉴얼 문서와 응대 카드를 영역별로 고친다 — 레시피와 같은 초안·게시·버전 흐름을 탄다.
export default function ManualEditor({ content, onChange }: { content: RecipeContent; onChange: (next: RecipeContent) => void }) {
  const docs = getManuals(content);
  const [sectionId, setSectionId] = useState<ManualSectionId>("open");
  const [selectedId, setSelectedId] = useState("");
  const inSection = docs.filter((doc) => doc.sectionId === sectionId);
  const selected = inSection.find((doc) => doc.id === selectedId) ?? inSection[0] ?? null;
  const isCard = selected?.kind === "response";
  const labels = manualLabels(selected?.kind);

  const setDocs = (next: ManualDoc[]) => onChange({ ...content, manuals: next });
  const patch = (changes: Partial<ManualDoc>) => {
    if (selected) setDocs(docs.map((doc) => (doc.id === selected.id ? { ...doc, ...changes } : doc)));
  };
  const addDoc = (kind: ManualKind) => {
    const doc = newManualDoc(sectionId, kind);
    setDocs([...docs, doc]);
    setSelectedId(doc.id);
  };
  const listField = (key: "materials" | "steps" | "doneCriteria" | "donts" | "reportWhen", rows: number) => (
    <Field label={`${labels[key]} · 한 줄에 하나씩`}>
      <textarea rows={rows} value={lines(selected![key])} onChange={(event) => patch({ [key]: fromLines(event.target.value) })} />
    </Field>
  );

  return (
    <section className={styles.wideEditor}>
      <div className={styles.sectionTitle}>
        <div><small>OPERATION MANUALS</small><h2>운영 매뉴얼 · 응대북</h2></div>
        <span>절차 문서와 응대 카드 두 가지 틀이 있습니다. 고친 뒤 ‘초안 저장’ → ‘공식 게시’를 해야 직원 화면에 나갑니다.</span>
      </div>

      <div className={styles.fieldGrid}>
        <Field label="영역">
          <select value={sectionId} onChange={(event) => { setSectionId(event.target.value as ManualSectionId); setSelectedId(""); }}>
            {manualSectionIds.map((id) => <option key={id} value={id}>{sectionTitle(id)} ({docs.filter((doc) => doc.sectionId === id).length})</option>)}
          </select>
        </Field>
        <Field label="문서">
          <select value={selected?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)} disabled={!inSection.length}>
            {inSection.length === 0 && <option value="">이 영역에는 아직 문서가 없어요</option>}
            {inSection.map((doc) => <option key={doc.id} value={doc.id}>{doc.group ? `[${doc.group}] ` : ""}{doc.title}</option>)}
          </select>
        </Field>
      </div>

      <div className={styles.promptGuideActions}>
        <button type="button" onClick={() => addDoc("procedure")}>+ 새 절차 문서</button>
        <button type="button" onClick={() => addDoc("response")}>+ 새 응대 카드</button>
        <button type="button" onClick={() => { if (window.confirm("매뉴얼 문서를 전부 처음의 예시 문서로 되돌릴까요? 공식 게시 전까지는 초안에서만 바뀝니다.")) { setDocs(structuredClone(defaultManuals)); setSelectedId(""); } }}>예시 문서로 되돌리기</button>
      </div>

      {selected && (
        <article className={styles.promptGuideCard}>
          <div className={styles.fieldGrid}>
            <Field label={isCard ? "카드 제목 (어떤 상황)" : "문서 제목"}><input value={selected.title} onChange={(event) => patch({ title: event.target.value })} /></Field>
            <Field label="목록에 보이는 한 줄 설명"><input value={selected.summary} onChange={(event) => patch({ summary: event.target.value })} /></Field>
            <Field label="문서 종류">
              <select value={selected.kind ?? "procedure"} onChange={(event) => patch({ kind: event.target.value as ManualKind })}>
                <option value="procedure">절차 문서 (순서대로 하는 일)</option>
                <option value="response">응대 카드 (이렇게 말해요)</option>
              </select>
            </Field>
            <Field label="옮길 영역">
              <select value={selected.sectionId} onChange={(event) => { patch({ sectionId: event.target.value }); setSectionId(event.target.value as ManualSectionId); setSelectedId(selected.id); }}>
                {manualSectionIds.map((id) => <option key={id} value={id}>{sectionTitle(id)}</option>)}
              </select>
            </Field>
            {isCard && (
              <Field label="응대북 묶음">
                <select value={selected.group ?? ""} onChange={(event) => patch({ group: event.target.value || undefined })}>
                  <option value="">묶음 없음</option>
                  {responseGroups.map((group) => <option key={group} value={group}>{group}</option>)}
                </select>
              </Field>
            )}
            <Field label="최종 수정일"><input value={selected.updatedAt} onChange={(event) => patch({ updatedAt: event.target.value })} /></Field>
          </div>
          {!isCard && (
            <label className={styles.dailyToggle}>
              <input type="checkbox" checked={Boolean(selected.dailyCheck)} onChange={(event) => patch({ dailyCheck: event.target.checked || undefined })} />
              <span><strong>매일 체크하는 문서</strong> — 켜면 아래 ‘순서’의 각 줄이 홈의 ‘오늘 체크’ 항목이 되고, 누가 언제 했는지 남아요 (오픈·마감 체크처럼)</span>
            </label>
          )}
          <Field label="챗봇이 알아듣는 낱말 · 쉼표로 구분 (제목에 없는 말로 물어도 찾게)">
            <input value={(selected.keywords ?? []).join(", ")} onChange={(event) => patch({ keywords: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} />
          </Field>
          <Field label={labels.purpose}><textarea rows={2} value={selected.purpose} onChange={(event) => patch({ purpose: event.target.value })} /></Field>
          {!isCard && listField("materials", 3)}
          {listField("steps", isCard ? 4 : 7)}
          {isCard && listField("donts", 3)}
          {listField("doneCriteria", 3)}
          {!isCard && listField("donts", 3)}
          {listField("reportWhen", 3)}
          <Field label="이번에 바뀐 이유"><input value={selected.change} onChange={(event) => patch({ change: event.target.value })} /></Field>
          <button type="button" onClick={() => { if (window.confirm("‘" + selected.title + "’ 문서를 지울까요? 공식 게시 전까지는 초안에서만 지워집니다.")) { setDocs(docs.filter((doc) => doc.id !== selected.id)); setSelectedId(""); } }}>이 문서 삭제</button>
        </article>
      )}
    </section>
  );
}
