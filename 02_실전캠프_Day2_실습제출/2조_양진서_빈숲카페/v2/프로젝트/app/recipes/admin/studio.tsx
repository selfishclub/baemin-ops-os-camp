"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import {
  Measure,
  Recipe,
  RecipeContent,
  RecipeImage,
  RecipeLayer,
  RecipeMode,
  RecipeVariant,
  layerPalette,
  findLayerPalette,
  suggestLayerTone,
  customToneId,
  recipeModes,
  recipeModeLabels,
} from "../recipe-data";
import { cascadeSharedStandards, validateRecipeContent } from "../content-model";
import styles from "./studio.module.css";

type AdminPayload = {
  content: RecipeContent;
  revision: number;
  updatedBy: string;
  updatedAt: string;
  publishedVersion: number;
  publishedAt: string;
  history: Array<{
    version: number;
    change_reason: string;
    effective_at: string;
    published_by: string;
    published_at: string;
  }>;
  actor: { email: string; role: string };
};

type Tab = "recipes" | "shared" | "announcement" | "history";
const hexColor = /^#[0-9a-f]{6}$/i;

function splitLines(value: string) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function measuresToText(items: Measure[]) {
  return items.map((item) => `${item.label} | ${item.value}`).join("\n");
}

function textToMeasures(value: string): Measure[] {
  return splitLines(value).map((line) => {
    const [label = "", ...rest] = line.split("|");
    return { label: label.trim(), value: rest.join("|").trim() };
  });
}

function layersToText(items: RecipeLayer[]) {
  return items.map((item) => `${item.label} | ${item.value} | ${item.tone === customToneId && item.color ? item.color : item.tone}`).join("\n");
}

// 세 번째 칸: 팔레트 이름(strawberry, 딸기 …) · #색상값 · 비우면 재료 이름으로 자동
function textToLayers(value: string): RecipeLayer[] {
  return splitLines(value).map((line) => {
    const [label = "", amount = "", rawTone = ""] = line.split("|").map((item) => item.trim());
    if (hexColor.test(rawTone)) return { label, value: amount, tone: customToneId, color: rawTone.toLowerCase() };
    const byId = findLayerPalette(rawTone) ?? layerPalette.find((entry) => entry.label === rawTone);
    const tone = byId?.id ?? suggestLayerTone(rawTone) ?? suggestLayerTone(label) ?? "milk";
    return { label, value: amount, tone };
  });
}

function guideSectionsToText(sections: { title: string; items: string[] }[]) {
  return sections.map((section) => `## ${section.title}\n${section.items.join("\n")}`).join("\n\n");
}

function textToGuideSections(value: string) {
  return value.split(/\n\s*\n/).map((block) => {
    const [heading = "", ...items] = block.split("\n").map((line) => line.trim()).filter(Boolean);
    return { title: heading.replace(/^##\s*/, ""), items };
  }).filter((section) => section.title);
}

function emptyVariant(): RecipeVariant {
  return {
    quick: [{ label: "재료", value: "계량" }],
    layers: [{ label: "재료", value: "계량", tone: "milk" }],
    steps: ["제조 단계를 입력해 주세요."],
    cautions: [],
  };
}

async function optimizeImage(file: File) {
  if (file.size > 25 * 1024 * 1024) throw new Error("원본 사진은 25MB 이하여야 합니다.");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("사진을 최적화할 수 없습니다.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
  if (!blob) throw new Error("사진을 최적화할 수 없습니다.");
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "drink"}.webp`, { type: "image/webp" });
}

function newRecipe(index: number): Recipe {
  const today = new Date().toISOString().slice(0, 10).replaceAll("-", ".");
  return {
    id: `new-menu-${Date.now()}-${index}`,
    name: "새 메뉴",
    category: "커피",
    description: "메뉴 설명을 입력해 주세요.",
    version: "1.0",
    updatedAt: today,
    change: "신규 메뉴 등록",
    customerGuide: "고객 안내 문구를 입력해 주세요.",
    drinkingTip: "추천 음용법을 입력해 주세요.",
    variants: { ICE: emptyVariant() },
  };
}

export default function AdminStudio({ userName }: { userName: string }) {
  const [payload, setPayload] = useState<AdminPayload | null>(null);
  const [content, setContent] = useState<RecipeContent | null>(null);
  const [tab, setTab] = useState<Tab>("recipes");
  const [adminCategory, setAdminCategory] = useState("전체");
  const [adminQuery, setAdminQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("관리 데이터를 불러오는 중입니다.");
  const [errors, setErrors] = useState<string[]>([]);
  const [changeReason, setChangeReason] = useState("");
  const [effectiveAt, setEffectiveAt] = useState(new Date().toISOString().slice(0, 10));
  const [notifyStaff, setNotifyStaff] = useState(true);

  const load = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/content", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "관리 데이터를 불러오지 못했습니다.");
      setPayload(body);
      setContent(body.content);
      const requestedId = new URLSearchParams(window.location.search).get("recipe");
      setSelectedId((current) => current ?? body.content.recipes.find((recipe: Recipe) => recipe.id === requestedId)?.id ?? body.content.recipes[0]?.id ?? null);
      setDirty(false);
      setErrors([]);
      setMessage(`공식 버전 ${body.publishedVersion} · 초안 revision ${body.revision}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "관리 화면을 열지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void load(); });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const selected = content?.recipes.find((recipe) => recipe.id === selectedId) ?? null;
  const adminRecipes = content?.recipes.filter((recipe) =>
    (adminCategory === "전체" || recipe.category === adminCategory) &&
    (!adminQuery.trim() || `${recipe.name} ${recipe.category}`.toLocaleLowerCase("ko-KR").includes(adminQuery.trim().toLocaleLowerCase("ko-KR"))),
  ) ?? [];
  const impact = useMemo(
    () => content ? cascadeSharedStandards(content).impactedRecipeIds : [],
    [content],
  );

  const changeContent = (next: RecipeContent) => {
    setContent(next);
    setDirty(true);
    setErrors([]);
  };

  const updateRecipe = (recipe: Recipe) => {
    if (!content) return;
    changeContent({ ...content, recipes: content.recipes.map((item) => item.id === recipe.id ? recipe : item) });
  };

  const uploadImage = async (file: File) => {
    if (!selected) return;
    setBusy(true);
    setMessage(`${selected.name} 사진을 자동 리사이징·압축하는 중입니다.`);
    try {
      const optimized = await optimizeImage(file);
      const form = new FormData();
      form.set("file", optimized);
      form.set("recipeId", selected.id);
      const response = await fetch("/api/admin/media", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "사진을 올리지 못했습니다.");
      updateRecipe({ ...selected, images: [...(selected.images ?? []), body.image as RecipeImage] });
      const reduction = Math.max(0, Math.round((1 - optimized.size / file.size) * 100));
      setMessage(`사진을 1600px 이내 WEBP로 최적화했습니다${reduction ? ` · 용량 ${reduction}% 감소` : ""}. 초안 저장 후 게시해 주세요.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "사진을 올리지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!content || !payload) return null;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/content", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, revision: payload.revision }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "초안을 저장하지 못했습니다.");
      setContent(body.content);
      setPayload({ ...payload, content: body.content, revision: body.revision, updatedAt: body.updatedAt });
      setDirty(false);
      setMessage(`초안 revision ${body.revision} 저장 완료`);
      return body.revision as number;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "초안을 저장하지 못했습니다.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!content || !payload) return;
    const validation = validateRecipeContent(content);
    if (!changeReason.trim()) validation.unshift("게시 변경 이유를 입력해 주세요.");
    if (!effectiveAt) validation.unshift("시행일을 입력해 주세요.");
    if (validation.length) {
      setErrors(validation);
      setMessage("게시 전 필수 항목을 확인해 주세요.");
      return;
    }
    if (!window.confirm(`연결된 공통 기준과 ${content.recipes.length}개 메뉴를 새 공식 버전으로 게시할까요?`)) return;
    const revision = dirty ? await save() : payload.revision;
    if (revision === null) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision, changeReason, effectiveAt, notifyStaff }),
      });
      const body = await response.json();
      if (!response.ok) {
        setErrors(body.errors ?? []);
        throw new Error(body.error ?? "게시하지 못했습니다.");
      }
      setMessage(`공식 버전 ${body.version} 게시 완료${body.notified ? ` · 바뀐 메뉴 ${body.notified}개에 직원 확인 요청` : notifyStaff ? " · 바뀐 메뉴 없음(알림 없음)" : " · 알림 없이 게시"}`);
      setChangeReason("");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "게시하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const restore = async (version: number) => {
    if (!payload || !window.confirm(`공식 버전 ${version}의 내용을 새 초안으로 불러올까요? 현재 초안은 교체됩니다.`)) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version, revision: payload.revision }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "버전을 불러오지 못했습니다.");
      setContent(body.content);
      setPayload({ ...payload, content: body.content, revision: body.revision, updatedAt: body.updatedAt });
      setDirty(false);
      setMessage(`버전 ${version}을 초안으로 불러왔습니다. 검토 후 게시해 주세요.`);
      setTab("recipes");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "버전을 불러오지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  if (!content || !payload) {
    return (
      <main className={styles.loading}>
        <strong>BEANSOOP CONTENT STUDIO</strong>
        <h1>{message}</h1>
        {!busy && <button type="button" onClick={() => void load()}>다시 시도</button>}
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div>
          <a href="/recipes">← 직원 레시피</a>
          <span>BEANSOOP CONTENT STUDIO</span>
          <h1>레시피 관리</h1>
        </div>
        <div className={styles.topActions}>
          <small>{userName} · {payload.actor.role}</small>
          <button type="button" className={styles.secondary} disabled={busy || !dirty} onClick={() => void save()}>
            초안 저장
          </button>
          <button type="button" className={styles.primary} disabled={busy} onClick={() => void publish()}>
            공식본으로 게시
          </button>
        </div>
      </header>

      <section className={styles.statusbar} data-dirty={dirty}>
        <span>{dirty ? "저장하지 않은 변경 있음" : "초안 저장됨"}</span>
        <p>{message}</p>
        <a href="/recipes" target="_blank" rel="noreferrer">공식 화면 보기 ↗</a>
      </section>

      <nav className={styles.tabs} aria-label="관리 영역">
        {(["recipes", "shared", "announcement", "history"] as Tab[]).map((item) => (
          <button key={item} type="button" aria-pressed={tab === item} onClick={() => setTab(item)}>
            {{ recipes: `메뉴 ${content.recipes.length}`, shared: "공통 기준", announcement: "공지", history: "버전 기록" }[item]}
          </button>
        ))}
      </nav>

      {errors.length > 0 && (
        <section className={styles.errorBox} role="alert">
          <strong>게시 전 확인해 주세요</strong>
          <ul>{errors.slice(0, 12).map((error) => <li key={error}>{error}</li>)}</ul>
        </section>
      )}

      {tab === "recipes" && (
        <div className={styles.menuFilters}>
          <nav aria-label="관리 메뉴 카테고리" role="tablist">
            {content.categories.map((item) => (
              <button key={item} type="button" role="tab" aria-selected={adminCategory === item} onClick={() => {
                setAdminCategory(item);
                const first = content.recipes.find((recipe) => item === "전체" || recipe.category === item);
                if (first) setSelectedId(first.id);
              }}>
                {item}<small>{item === "전체" ? content.recipes.length : content.recipes.filter((recipe) => recipe.category === item).length}</small>
              </button>
            ))}
          </nav>
          <label><span className="sr-only">관리 메뉴 검색</span><input type="search" placeholder="메뉴명 검색" value={adminQuery} onChange={(event) => setAdminQuery(event.target.value)} /></label>
        </div>
      )}

      {tab === "recipes" && selected && (
        <div className={styles.workspace}>
          <aside className={styles.recipeList}>
            <div><strong>메뉴 목록</strong><button type="button" onClick={() => {
              const recipe = newRecipe(content.recipes.length);
              if (adminCategory !== "전체") recipe.category = adminCategory;
              changeContent({ ...content, recipes: [...content.recipes, recipe] });
              setSelectedId(recipe.id);
            }}>+ 추가</button></div>
            {adminRecipes.map((recipe, index) => (
              <button key={recipe.id} type="button" aria-pressed={selectedId === recipe.id} onClick={() => setSelectedId(recipe.id)}>
                <span>{recipe.name}</span><small>{recipe.category} · {index + 1}</small>
              </button>
            ))}
          </aside>

          <section className={styles.editor}>
            <div className={styles.editorHeading}>
              <div><small>MENU EDITOR</small><h2>{selected.name}</h2></div>
              <div>
                <button type="button" className={styles.secondary} disabled={content.recipes[0]?.id === selected.id} onClick={() => {
                  const index = content.recipes.findIndex((recipe) => recipe.id === selected.id);
                  changeContent({ ...content, recipes: moveAt(content.recipes, index, index - 1) });
                }}>↑ 위로</button>
                <button type="button" className={styles.secondary} disabled={content.recipes.at(-1)?.id === selected.id} onClick={() => {
                  const index = content.recipes.findIndex((recipe) => recipe.id === selected.id);
                  changeContent({ ...content, recipes: moveAt(content.recipes, index, index + 1) });
                }}>↓ 아래로</button>
                <button type="button" className={styles.secondary} onClick={() => {
                  const copy = structuredClone(selected);
                  copy.id = `${selected.id}-copy-${Date.now()}`;
                  copy.name = `${selected.name} 복사본`;
                  copy.version = "1.0";
                  changeContent({ ...content, recipes: [...content.recipes, copy] });
                  setSelectedId(copy.id);
                }}>복제</button>
                <button type="button" className={styles.danger} disabled={content.recipes.length <= 1} onClick={() => {
                  if (!window.confirm(`${selected.name}을 목록에서 보관할까요? 과거 버전에는 그대로 남습니다.`)) return;
                  const next = content.recipes.filter((recipe) => recipe.id !== selected.id);
                  changeContent({ ...content, recipes: next });
                  setSelectedId(next[0]?.id ?? null);
                }}>보관</button>
              </div>
            </div>

            <div className={styles.fieldGrid}>
              <Field label="메뉴명"><input value={selected.name} onChange={(e) => updateRecipe({ ...selected, name: e.target.value })} /></Field>
              <Field label="고유 ID"><input value={selected.id} onChange={(e) => {
                const previous = selected.id;
                const next = { ...selected, id: e.target.value };
                changeContent({ ...content, recipes: content.recipes.map((item) => item.id === previous ? next : item) });
                setSelectedId(e.target.value);
              }} /></Field>
              <Field label="카테고리"><select value={selected.category} onChange={(e) => updateRecipe({ ...selected, category: e.target.value })}>{content.categories.filter((item) => item !== "전체").map((item) => <option key={item}>{item}</option>)}</select></Field>
              <Field label="표시 버전"><input value={selected.version} onChange={(e) => updateRecipe({ ...selected, version: e.target.value })} /></Field>
              <Field label="시행일"><input value={selected.updatedAt} onChange={(e) => updateRecipe({ ...selected, updatedAt: e.target.value })} /></Field>
              <Field label="변경 요약"><input value={selected.change} onChange={(e) => updateRecipe({ ...selected, change: e.target.value })} /></Field>
            </div>
            <Field label="메뉴 설명"><textarea rows={2} value={selected.description} onChange={(e) => updateRecipe({ ...selected, description: e.target.value })} /></Field>
            <Field label="손님 안내"><textarea rows={2} value={selected.customerGuide} onChange={(e) => updateRecipe({ ...selected, customerGuide: e.target.value })} /></Field>
            <Field label="추천 음용법"><textarea rows={2} value={selected.drinkingTip} onChange={(e) => updateRecipe({ ...selected, drinkingTip: e.target.value })} /></Field>
            <div className={styles.fieldGrid}>
              <Field label="원본 위치"><input value={selected.sourceRef ?? ""} onChange={(e) => updateRecipe({ ...selected, sourceRef: e.target.value })} /></Field>
              <Field label="검수 메모 · 한 줄에 하나"><textarea rows={3} value={(selected.reviewNotes ?? []).join("\n")} onChange={(e) => updateRecipe({ ...selected, reviewNotes: splitLines(e.target.value) })} /></Field>
            </div>

            <div className={styles.switchRow}>
              <label><input type="checkbox" checked={Boolean(selected.featured)} onChange={(e) => updateRecipe({ ...selected, featured: e.target.checked })} /> 자주 찾는 메뉴로 표시</label>
              {content.sharedStandards.map((item) => <label key={item.id}><input type="checkbox" checked={selected.standardIds?.includes(item.id) ?? false} onChange={(e) => updateRecipe({ ...selected, standardIds: toggleId(selected.standardIds, item.id, e.target.checked) })} /> {item.title}</label>)}
              {content.sharedGuides.map((item) => <label key={item.id}><input type="checkbox" checked={selected.guideIds?.includes(item.id) ?? false} onChange={(e) => updateRecipe({ ...selected, guideIds: toggleId(selected.guideIds, item.id, e.target.checked) })} /> {item.title}</label>)}
            </div>

            <MediaEditor recipe={selected} busy={busy} onChange={updateRecipe} onUpload={uploadImage} />

            <h3 className={styles.subheading}>옵션별 레시피</h3>
            <div className={styles.modeEditors}>
              {recipeModes.map((mode) => (
                <VariantEditor key={mode} mode={mode} variant={selected.variants[mode]} onChange={(variant) => updateRecipe({ ...selected, variants: { ...selected.variants, [mode]: variant } })} />
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === "shared" && (
        <section className={styles.wideEditor}>
          <div className={styles.sectionTitle}><div><small>MASTER DATA</small><h2>공통 제조 기준</h2></div><div className={styles.sectionActions}><span>{impact.length}개 연결 메뉴에 게시 시 반영</span><button type="button" className={styles.secondary} onClick={() => changeContent({ ...content, sharedStandards: [...content.sharedStandards, { id: `standard-${Date.now()}`, title: "새 공통 기준", summary: "적용 내용을 입력해 주세요.", version: "1.0", updatedAt: new Date().toISOString().slice(0, 10), values: [{ label: "기본", value: "계량" }] }] })}>+ 기준 추가</button></div></div>
          {content.sharedStandards.map((standard, index) => (
            <article className={styles.sharedCard} key={standard.id}>
              <div className={styles.cardActions}><strong>{standard.id}</strong><button type="button" className={styles.danger} onClick={() => {
                if (!window.confirm(`${standard.title}을 보관할까요? 연결된 메뉴의 참조도 함께 해제됩니다.`)) return;
                changeContent({ ...content, sharedStandards: content.sharedStandards.filter((item) => item.id !== standard.id), recipes: content.recipes.map((recipe) => ({ ...recipe, standardIds: recipe.standardIds?.filter((id) => id !== standard.id) })) });
              }}>보관</button></div>
              <div className={styles.fieldGrid}>
                <Field label="기준명"><input value={standard.title} onChange={(e) => changeContent({ ...content, sharedStandards: replaceAt(content.sharedStandards, index, { ...standard, title: e.target.value }) })} /></Field>
                <Field label="버전"><input value={standard.version} onChange={(e) => changeContent({ ...content, sharedStandards: replaceAt(content.sharedStandards, index, { ...standard, version: e.target.value }) })} /></Field>
              </div>
              <Field label="설명"><input value={standard.summary} onChange={(e) => changeContent({ ...content, sharedStandards: replaceAt(content.sharedStandards, index, { ...standard, summary: e.target.value }) })} /></Field>
              <Field label="계량값 · 한 줄에 ‘항목 | 값’"><textarea rows={3} value={measuresToText(standard.values)} onChange={(e) => changeContent({ ...content, sharedStandards: replaceAt(content.sharedStandards, index, { ...standard, values: textToMeasures(e.target.value) }) })} /></Field>
              <div className={styles.impactList}>{impact.map((id) => <span key={id}>{content.recipes.find((recipe) => recipe.id === id)?.name ?? id}</span>)}</div>
            </article>
          ))}

          <div className={styles.sectionTitle}><div><small>SHARED GUIDE</small><h2>공통 서비스 가이드</h2></div><button type="button" className={styles.secondary} onClick={() => changeContent({ ...content, sharedGuides: [...content.sharedGuides, { id: `guide-${Date.now()}`, title: "새 공통 가이드", scope: "적용 범위", version: "1.0", updatedAt: new Date().toISOString().slice(0, 10), sections: [{ title: "안내", items: ["내용을 입력해 주세요."] }] }] })}>+ 가이드 추가</button></div>
          {content.sharedGuides.map((guide, index) => (
            <article className={styles.sharedCard} key={guide.id}>
              <div className={styles.cardActions}><strong>{guide.id}</strong><button type="button" className={styles.danger} onClick={() => {
                if (!window.confirm(`${guide.title}을 보관할까요? 연결된 메뉴의 참조도 함께 해제됩니다.`)) return;
                changeContent({ ...content, sharedGuides: content.sharedGuides.filter((item) => item.id !== guide.id), recipes: content.recipes.map((recipe) => ({ ...recipe, guideIds: recipe.guideIds?.filter((id) => id !== guide.id) })) });
              }}>보관</button></div>
              <div className={styles.fieldGrid}>
                <Field label="가이드명"><input value={guide.title} onChange={(e) => changeContent({ ...content, sharedGuides: replaceAt(content.sharedGuides, index, { ...guide, title: e.target.value }) })} /></Field>
                <Field label="적용 범위"><input value={guide.scope} onChange={(e) => changeContent({ ...content, sharedGuides: replaceAt(content.sharedGuides, index, { ...guide, scope: e.target.value }) })} /></Field>
              </div>
              <Field label="본문 · ‘## 소제목’ 뒤에 항목을 줄바꿈"><textarea rows={12} value={guideSectionsToText(guide.sections)} onChange={(e) => changeContent({ ...content, sharedGuides: replaceAt(content.sharedGuides, index, { ...guide, sections: textToGuideSections(e.target.value) }) })} /></Field>
              <Field label="손님 안내 멘트"><textarea rows={3} value={guide.serviceScript ?? ""} onChange={(e) => changeContent({ ...content, sharedGuides: replaceAt(content.sharedGuides, index, { ...guide, serviceScript: e.target.value }) })} /></Field>
              <Field label="추후 보완 메모"><textarea rows={3} value={guide.futureMemo ?? ""} onChange={(e) => changeContent({ ...content, sharedGuides: replaceAt(content.sharedGuides, index, { ...guide, futureMemo: e.target.value }) })} /></Field>
            </article>
          ))}

          <article className={styles.sharedCard}>
            <h3>카테고리와 기본 계량 참고</h3>
            <Field label="카테고리 · 쉼표로 구분"><input value={content.categories.join(", ")} onChange={(e) => changeContent({ ...content, categories: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></Field>
            <Field label="기본 계량 참고 · 한 줄에 ‘항목 | 값’"><textarea rows={7} value={measuresToText(content.standards)} onChange={(e) => changeContent({ ...content, standards: textToMeasures(e.target.value) })} /></Field>
          </article>
        </section>
      )}

      {tab === "announcement" && (
        <section className={styles.wideEditor}>
          <div className={styles.sectionTitle}><div><small>STAFF NOTICE</small><h2>직원 공지 관리</h2></div></div>
          <article className={styles.sharedCard}>
            <div className={styles.fieldGrid}>
              <Field label="공지 ID"><input value={content.announcement.id} onChange={(e) => changeContent({ ...content, announcement: { ...content.announcement, id: e.target.value } })} /></Field>
              <Field label="표시 버전"><input value={content.announcement.version} onChange={(e) => changeContent({ ...content, announcement: { ...content.announcement, version: e.target.value } })} /></Field>
              <Field label="시행일"><input type="date" value={content.announcement.effectiveAt.replaceAll(".", "-")} onChange={(e) => changeContent({ ...content, announcement: { ...content.announcement, effectiveAt: e.target.value } })} /></Field>
              <Field label="구분"><label className={styles.checkbox}><input type="checkbox" checked={content.announcement.important} onChange={(e) => changeContent({ ...content, announcement: { ...content.announcement, important: e.target.checked } })} /> 중요 공지로 표시</label></Field>
            </div>
            <Field label="공지 제목"><input value={content.announcement.title} onChange={(e) => changeContent({ ...content, announcement: { ...content.announcement, title: e.target.value } })} /></Field>
            <Field label="공지 상세"><textarea rows={5} value={content.announcement.detail} onChange={(e) => changeContent({ ...content, announcement: { ...content.announcement, detail: e.target.value } })} /></Field>
          </article>
        </section>
      )}

      {tab === "history" && (
        <section className={styles.wideEditor}>
          <div className={styles.sectionTitle}><div><small>IMMUTABLE HISTORY</small><h2>공식 버전 기록</h2></div><span>복구는 공식본을 바로 바꾸지 않고 새 초안을 만듭니다.</span></div>
          <div className={styles.historyList}>
            {payload.history.map((item) => (
              <article key={item.version}>
                <strong>공식 버전 {item.version}</strong>
                <p>{item.change_reason}</p>
                <span>시행 {item.effective_at} · {item.published_by}</span>
                <button type="button" disabled={busy} onClick={() => void restore(item.version)}>이 버전을 초안으로 불러오기</button>
              </article>
            ))}
          </div>
        </section>
      )}

      <footer className={styles.publishBar}>
        <div><Field label="게시 변경 이유"><input placeholder="예: HOT 우유 공통 기준 변경" value={changeReason} onChange={(e) => setChangeReason(e.target.value)} /></Field></div>
        <div><Field label="시행일"><input type="date" value={effectiveAt} onChange={(e) => setEffectiveAt(e.target.value)} /></Field></div>
        <label className={styles.notifyToggle}>
          <input type="checkbox" checked={notifyStaff} onChange={(e) => setNotifyStaff(e.target.checked)} />
          직원 확인 필요 (바뀐 메뉴에 ‘확인했어요’ 받기. 오타 수정이면 끄기)
        </label>
        <button type="button" className={styles.primary} disabled={busy} onClick={() => void publish()}>검토 후 공식 게시</button>
      </footer>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className={styles.field}><span>{label}</span>{children}</label>;
}

function VariantEditor({ mode, variant, onChange }: {
  mode: RecipeMode;
  variant?: RecipeVariant;
  onChange: (variant: RecipeVariant | undefined) => void;
}) {
  return (
    <article className={styles.variant} data-enabled={Boolean(variant)}>
      <header><strong>{recipeModeLabels[mode]}</strong><label><input type="checkbox" checked={Boolean(variant)} onChange={(e) => onChange(e.target.checked ? emptyVariant() : undefined)} /> 지원</label></header>
      {variant && <>
        <Field label="QUICK · 항목 | 값"><textarea rows={6} value={measuresToText(variant.quick)} onChange={(e) => onChange({ ...variant, quick: textToMeasures(e.target.value) })} /></Field>
        <Field label="음료 층 · 항목 | 값 | 색상 — 첫 줄이 잔 맨 아래(1층), 넣는 순서대로. 색상은 비우면 이름으로 자동, #색상값도 가능"><textarea rows={6} value={layersToText(variant.layers)} onChange={(e) => onChange({ ...variant, layers: textToLayers(e.target.value) })} /></Field>
        <Field label="제조 단계 · 한 줄에 하나"><textarea rows={7} value={variant.steps.join("\n")} onChange={(e) => onChange({ ...variant, steps: splitLines(e.target.value) })} /></Field>
        <Field label="주의사항 · 한 줄에 하나"><textarea rows={4} value={(variant.cautions ?? []).join("\n")} onChange={(e) => onChange({ ...variant, cautions: splitLines(e.target.value) })} /></Field>
      </>}
    </article>
  );
}

function MediaEditor({ recipe, busy, onChange, onUpload }: {
  recipe: Recipe;
  busy: boolean;
  onChange: (recipe: Recipe) => void;
  onUpload: (file: File) => Promise<void>;
}) {
  const images = recipe.images ?? [];
  const videos = recipe.videos ?? [];
  const addExternalImage = () => onChange({ ...recipe, images: [...images, { id: crypto.randomUUID(), url: "https://", alt: recipe.name, caption: "" }] });
  const addVideo = () => onChange({ ...recipe, videos: [...videos, { id: crypto.randomUUID(), title: `${recipe.name} 영상 레시피`, url: "", description: "", orientation: "auto" }] });
  return (
    <section className={styles.mediaEditor} aria-labelledby="media-editor-title">
      <div className={styles.sectionTitle}>
        <div><small>PHOTO & VIDEO</small><h2 id="media-editor-title">사진 갤러리와 영상 레시피</h2></div>
        <span>사진 {images.length}장 · 영상 {videos.length}개</span>
      </div>
      <div className={styles.mediaAdminHeading}>
        <div><strong>실제 음료 사진</strong><p>원본을 올리면 긴 변 1600px 이내 WEBP로 자동 리사이징·압축합니다.</p></div>
        <div>
          <label className={styles.uploadButton}>사진 올리기<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy} onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void onUpload(file);
          }} /></label>
          <button type="button" className={styles.secondary} onClick={addExternalImage}>외부 주소 추가</button>
        </div>
      </div>
      {images.length ? <div className={styles.mediaRows}>{images.map((image, index) => (
        <article className={styles.imageAdminRow} key={image.id}>
          <div className={styles.imagePreview}>{image.url && image.url !== "https://" ? <img src={image.url} alt="" /> : <span>사진 {index + 1}</span>}</div>
          <div>
            <Field label="이미지 주소"><input value={image.url} onChange={(event) => onChange({ ...recipe, images: replaceAt(images, index, { ...image, url: event.target.value }) })} /></Field>
            <div className={styles.fieldGrid}>
              <Field label="대체 설명"><input value={image.alt} onChange={(event) => onChange({ ...recipe, images: replaceAt(images, index, { ...image, alt: event.target.value }) })} /></Field>
              <Field label="사진 설명"><input value={image.caption ?? ""} onChange={(event) => onChange({ ...recipe, images: replaceAt(images, index, { ...image, caption: event.target.value }) })} /></Field>
            </div>
          </div>
          <div className={styles.rowActions}>
            <button type="button" disabled={index === 0} onClick={() => onChange({ ...recipe, images: moveAt(images, index, index - 1) })}>↑</button>
            <button type="button" disabled={index === images.length - 1} onClick={() => onChange({ ...recipe, images: moveAt(images, index, index + 1) })}>↓</button>
            <button type="button" className={styles.danger} onClick={() => onChange({ ...recipe, images: images.filter((item) => item.id !== image.id) })}>제거</button>
          </div>
        </article>
      ))}</div> : <p className={styles.inlineEmpty}>아직 등록된 사진이 없습니다.</p>}

      <div className={styles.mediaAdminHeading}>
        <div><strong>외부 영상 레시피</strong><p>유튜브·네이버TV는 페이지에서 재생되며, 그 외 HTTPS 주소는 외부 보기로 연결됩니다.</p></div>
        <button type="button" className={styles.secondary} onClick={addVideo}>+ 영상 주소 추가</button>
      </div>
      {videos.length ? <div className={styles.mediaRows}>{videos.map((video, index) => (
        <article className={styles.videoAdminRow} key={video.id}>
          <div className={styles.fieldGrid}>
            <Field label="영상 제목"><input value={video.title} onChange={(event) => onChange({ ...recipe, videos: replaceAt(videos, index, { ...video, title: event.target.value }) })} /></Field>
            <Field label="영상 주소"><input type="url" placeholder="https://youtu.be/... 또는 https://tv.naver.com/v/..." value={video.url} onChange={(event) => onChange({ ...recipe, videos: replaceAt(videos, index, { ...video, url: event.target.value }) })} /></Field>
          </div>
          <Field label="재생 화면 비율"><select value={video.orientation ?? "auto"} onChange={(event) => onChange({ ...recipe, videos: replaceAt(videos, index, { ...video, orientation: event.target.value as "auto" | "portrait" | "landscape" }) })}><option value="auto">자동 감지</option><option value="portrait">세로 9:16</option><option value="landscape">가로 16:9</option></select></Field>
          <Field label="영상 설명"><textarea rows={2} value={video.description ?? ""} onChange={(event) => onChange({ ...recipe, videos: replaceAt(videos, index, { ...video, description: event.target.value }) })} /></Field>
          <div className={styles.rowActions}>
            <button type="button" disabled={index === 0} onClick={() => onChange({ ...recipe, videos: moveAt(videos, index, index - 1) })}>↑ 위로</button>
            <button type="button" disabled={index === videos.length - 1} onClick={() => onChange({ ...recipe, videos: moveAt(videos, index, index + 1) })}>↓ 아래로</button>
            <button type="button" className={styles.danger} onClick={() => onChange({ ...recipe, videos: videos.filter((item) => item.id !== video.id) })}>제거</button>
          </div>
        </article>
      ))}</div> : <p className={styles.inlineEmpty}>아직 등록된 영상이 없습니다.</p>}
    </section>
  );
}

function toggleId(current: string[] | undefined, id: string, checked: boolean) {
  return checked ? [...new Set([...(current ?? []), id])] : (current ?? []).filter((item) => item !== id);
}

function replaceAt<T>(items: T[], index: number, value: T) {
  return items.map((item, itemIndex) => itemIndex === index ? value : item);
}

function moveAt<T>(items: T[], from: number, to: number) {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
