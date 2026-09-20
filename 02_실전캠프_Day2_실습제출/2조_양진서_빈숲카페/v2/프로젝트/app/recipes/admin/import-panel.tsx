"use client";

import { useMemo, useState } from "react";
import { getManuals, manualSectionIds, type ManualDoc } from "../../manual/manual-data";
import { portalSections } from "../../portal-sections";
import { recipeModeLabels, suggestLayerTone, type Recipe, type RecipeContent, type RecipeMode } from "../recipe-data";
import { manualTemplate, parseManualTable, parseRecipeTable, recipeTemplate, type ImportResult } from "./import-parse";
import styles from "./studio.module.css";
import { todayInSeoul } from "../../checks/check-data";

type Kind = "recipes" | "manuals";

const today = () => todayInSeoul().replaceAll("-", ".");

// 관리자 편집의 "가져오기" 탭. 엑셀에서 복사한 표를 붙여 넣으면 어떻게 읽었는지 먼저 보여 주고,
// 사장이 확인해야 초안에 들어간다. 여기서는 저장도 게시도 하지 않는다 — 그건 위의 ‘초안 저장’ → ‘공식 게시’가 한다.
export default function ImportPanel({ content, onChange, onDone }: { content: RecipeContent; onChange: (next: RecipeContent) => void; onDone: (message: string) => void }) {
  const [kind, setKind] = useState<Kind>("recipes");
  const [text, setText] = useState("");
  const [replaceAll, setReplaceAll] = useState(false);

  const sections = useMemo(() => portalSections.filter((section) => (manualSectionIds as readonly string[]).includes(section.id)).map((section) => ({ id: section.id, title: section.title })), []);
  const recipeResult = useMemo<ImportResult<Recipe> | null>(
    () => (kind === "recipes" && text.trim() ? parseRecipeTable(text, { suggestTone: suggestLayerTone, today: today(), existing: content.recipes }) : null),
    [kind, text, content.recipes],
  );
  const manualResult = useMemo<ImportResult<ManualDoc> | null>(
    () => (kind === "manuals" && text.trim() ? parseManualTable(text, { sections, today: today(), existing: getManuals(content) }) : null),
    [kind, text, content, sections],
  );
  const result = kind === "recipes" ? recipeResult : manualResult;
  const count = result?.items.length ?? 0;

  function apply() {
    if (kind === "recipes" && recipeResult) {
      const incoming = recipeResult.items;
      const names = new Set(incoming.map((recipe) => recipe.name.trim()));
      const kept = replaceAll ? [] : content.recipes.filter((recipe) => !names.has(recipe.name.trim()));
      const categories = [...content.categories];
      for (const recipe of incoming) if (recipe.category && !categories.includes(recipe.category)) categories.push(recipe.category);
      onChange({ ...content, recipes: [...kept, ...incoming], categories });
      onDone(`메뉴 ${incoming.length}개를 초안에 넣었어요${replaceAll ? " (기존 메뉴는 모두 뺐어요)" : ""}. ‘메뉴’ 탭에서 확인하고, ‘초안 저장’ → ‘공식 게시’를 해야 직원 화면에 나가요.`);
    }
    if (kind === "manuals" && manualResult) {
      const incoming = manualResult.items;
      const ids = new Set(incoming.map((doc) => doc.id));
      const kept = replaceAll ? [] : getManuals(content).filter((doc) => !ids.has(doc.id));
      onChange({ ...content, manuals: [...kept, ...incoming] });
      onDone(`문서 ${incoming.length}개를 초안에 넣었어요${replaceAll ? " (기존 문서는 모두 뺐어요)" : ""}. ‘매뉴얼’ 탭에서 확인하고, ‘초안 저장’ → ‘공식 게시’를 해야 직원 화면에 나가요.`);
    }
    setText("");
  }

  return (
    <section className={styles.wideEditor}>
      <div className={styles.sectionTitle}>
        <div><small>IMPORT FROM SPREADSHEET</small><h2>엑셀·표에서 가져오기</h2></div>
        <span>엑셀에서 칸을 골라 복사(Ctrl+C)한 뒤 아래에 붙여넣기(Ctrl+V) 하세요. 먼저 어떻게 읽었는지 보여 드리고, 확인을 눌러야 초안에 들어가요.</span>
      </div>

      <div className={styles.promptGuideActions}>
        <button type="button" aria-pressed={kind === "recipes"} onClick={() => { setKind("recipes"); setText(""); }}>레시피 표</button>
        <button type="button" aria-pressed={kind === "manuals"} onClick={() => { setKind("manuals"); setText(""); }}>매뉴얼 · 응대 카드 표</button>
        <button type="button" onClick={() => setText(kind === "recipes" ? recipeTemplate : manualTemplate)}>예시 표 넣어 보기</button>
      </div>

      <div className={styles.importHelp}>
        {kind === "recipes" ? (
          <>
            <p><strong>첫 줄은 열 이름</strong>이어야 해요. 알아보는 열: 메뉴명(꼭) · 카테고리 · 구분(HOT/ICE/사이즈업/매장/포장, 비우면 ICE) · 정량 · 제조순서 · 주의사항 · 자주 틀리는 포인트 · 단면도 · 설명 · 고객 안내 · 음용 팁. 열 이름이 조금 달라도(메뉴, 재료, 만드는 법 …) 알아봐요.</p>
            <p>한 줄 = 메뉴의 한 구분. 같은 메뉴의 HOT·ICE는 줄을 나눠 적고, 둘째 줄부터 메뉴명을 비워도 돼요. 한 칸에 여러 개는 <code>;</code> 나 줄바꿈(Alt+Enter), <code>1. 2. 3.</code> 번호로 나눠요. 재료는 <code>우유 200ml</code> 처럼 “이름 양”.</p>
          </>
        ) : (
          <p><strong>첫 줄은 열 이름</strong>이어야 해요. 알아보는 열: 영역(꼭 — {sections.map((section) => section.title).join(", ")}) · 제목(꼭) · 종류(절차/응대) · 묶음 · 목적(응대 카드는 상황) · 준비물 · 순서(응대 카드는 이렇게 말해요) · 완료 기준(혼자 해도 되는 범위) · 하면 안 되는 것 · 보고 기준 · 챗봇 낱말. 한 칸에 여러 개는 <code>;</code> 나 줄바꿈으로 나눠요.</p>
        )}
      </div>

      <label className={styles.field}>
        <span>여기에 붙여넣기</span>
        <textarea rows={8} value={text} onChange={(event) => setText(event.target.value)} placeholder="엑셀에서 복사한 표를 붙여 넣으세요 (첫 줄은 열 이름)" spellCheck={false} />
      </label>

      {result && (
        <div className={styles.importResult}>
          <h3>이렇게 읽었어요 — {kind === "recipes" ? `메뉴 ${count}개` : `문서 ${count}개`}</h3>
          {result.columns.length > 0 && <p className={styles.importColumns}>읽은 열: {result.columns.join(" · ")}</p>}
          {result.skipped.length > 0 && (
            <div className={styles.importSkipped} role="alert">
              <strong>읽지 못해 건너뛴 것 {result.skipped.length}건</strong>
              <ul>{result.skipped.slice(0, 20).map((line) => <li key={line}>{line}</li>)}</ul>
            </div>
          )}
          {result.warnings.length > 0 && (
            <div className={styles.importWarnings}>
              <strong>확인해 주세요 {result.warnings.length}건</strong> (그대로 가져올 수는 있어요)
              <ul>{result.warnings.slice(0, 30).map((line) => <li key={line}>{line}</li>)}</ul>
            </div>
          )}

          {kind === "recipes" && recipeResult && count > 0 && (
            <table className={styles.importTable}>
              <thead><tr><th>메뉴</th><th>카테고리</th><th>구분</th><th>정량</th><th>순서</th><th>기존 메뉴</th></tr></thead>
              <tbody>
                {recipeResult.items.map((recipe) => (
                  <tr key={recipe.id}>
                    <td><strong>{recipe.name}</strong></td>
                    <td>{recipe.category}</td>
                    <td>{(Object.keys(recipe.variants) as RecipeMode[]).map((mode) => recipeModeLabels[mode]).join(", ")}</td>
                    <td>{Object.values(recipe.variants).map((variant) => variant!.quick.map((item) => `${item.label} ${item.value}`.trim()).join(", ")).join(" / ")}</td>
                    <td>{Object.values(recipe.variants).map((variant) => `${variant!.steps.length}단계`).join(" / ")}</td>
                    <td>{content.recipes.some((item) => item.name.trim() === recipe.name) ? "같은 이름 → 교체 (사진·영상은 유지)" : "새 메뉴"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {kind === "manuals" && manualResult && count > 0 && (
            <table className={styles.importTable}>
              <thead><tr><th>제목</th><th>영역</th><th>종류</th><th>순서 · 말</th><th>하면 안 되는 것</th><th>기존 문서</th></tr></thead>
              <tbody>
                {manualResult.items.map((doc) => (
                  <tr key={doc.id}>
                    <td><strong>{doc.title}</strong></td>
                    <td>{sections.find((section) => section.id === doc.sectionId)?.title}</td>
                    <td>{doc.kind === "response" ? `응대 카드${doc.group ? ` · ${doc.group}` : ""}` : "절차 문서"}</td>
                    <td>{doc.steps.length}줄</td>
                    <td>{doc.donts.length}줄</td>
                    <td>{getManuals(content).some((item) => item.id === doc.id) ? "같은 제목 → 교체" : "새 문서"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {count > 0 && (
            <div className={styles.importApply}>
              <label><input type="checkbox" checked={replaceAll} onChange={(event) => setReplaceAll(event.target.checked)} /> 기존 {kind === "recipes" ? "메뉴" : "문서"}를 모두 빼고 이 표로 바꾸기 (예시 데이터를 실제 데이터로 갈아 끼울 때)</label>
              <button type="button" className={styles.primary} onClick={apply}>{kind === "recipes" ? `메뉴 ${count}개` : `문서 ${count}개`} 초안에 넣기</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
