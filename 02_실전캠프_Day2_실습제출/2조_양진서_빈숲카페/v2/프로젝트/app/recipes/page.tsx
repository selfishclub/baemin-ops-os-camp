"use client";
/* eslint-disable @next/next/no-img-element */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  defaultRecipeContent,
  Recipe,
  RecipeContent,
  RecipeVideo,
  RecipeVariant,
  RecipeLayer,
  recipeModes,
  recipeModeLabels,
  RecipeMode,
  layerPalette,
  layerColors,
  findLayerPalette,
  suggestLayerTone,
  customToneId,
} from "./recipe-data";
import styles from "./recipes.module.css";

const favoriteKey = "beansoop-recipe-favorites-v1";
const recentKey = "beansoop-recipe-recent-v1";

type InlineAdminState = {
  content: RecipeContent;
  revision: number;
  publishedVersion: number;
};

type RecipeToolContext = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => unknown;
    },
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};

function readStoredList(key: string) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function supportedModes(recipe: Recipe) {
  return recipeModes.filter((mode) => Boolean(recipe.variants[mode]));
}

function recipeSearchText(recipe: Recipe) {
  return [
    recipe.name,
    recipe.category,
    recipe.description,
    ...Object.values(recipe.variants).flatMap((variant) =>
      variant?.quick.flatMap((item) => [item.label, item.value]) ?? [],
    ),
  ]
    .join(" ")
    .toLocaleLowerCase("ko-KR")
    .replace(/\s+/g, "");
}

function safeExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function videoEmbedUrl(value: string) {
  const url = safeExternalUrl(value);
  if (!url) return null;
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id && /^[\w-]{6,}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    const id = url.searchParams.get("v") ?? (["embed", "shorts", "live"].includes(parts[0]) ? parts[1] : null);
    return id && /^[\w-]{6,}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "tv.naver.com" || host === "m.tv.naver.com") {
    const match = url.pathname.match(/^\/(?:v|embed)\/(\d+)/);
    return match ? `https://tv.naver.com/embed/${match[1]}` : null;
  }
  return null;
}

function directVideoUrl(value: string) {
  const url = safeExternalUrl(value);
  return url && /\.(?:mp4|webm|ogg)(?:$|\?)/i.test(`${url.pathname}${url.search}`) ? url.toString() : null;
}

export default function RecipeCenter() {
  const [content, setContent] = useState<RecipeContent>(defaultRecipeContent);
  const [contentError, setContentError] = useState(false);
  const { recipes, sharedStandards, sharedGuides, standards, categories, announcement } = content;
  const announcementKey = `beansoop-recipe-announcement-${announcement.id}`;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("전체");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<RecipeMode>("ICE");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [announcementSeen, setAnnouncementSeen] = useState(false);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [inlineAdmin, setInlineAdmin] = useState<InlineAdminState | null>(null);
  const [editDirty, setEditDirty] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editMessage, setEditMessage] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const detailTitleRef = useRef<HTMLHeadingElement>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/content", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("content unavailable");
        return response.json() as Promise<{ content: RecipeContent }>;
      })
      .then((payload) => {
        setContent(payload.content);
        setContentError(false);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setContentError(true);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setFavorites(readStoredList(favoriteKey));
      setRecent(readStoredList(recentKey).slice(0, 4));
      setAnnouncementSeen(window.localStorage.getItem(announcementKey) === "seen");
      setStorageReady(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [announcementKey]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(favoriteKey, JSON.stringify(favorites));
  }, [favorites, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(recentKey, JSON.stringify(recent));
  }, [recent, storageReady]);

  const selectedContent = inlineAdmin?.content ?? content;
  const selectedRecipe = selectedContent.recipes.find((recipe) => recipe.id === selectedId) ?? null;
  const selectedVariant = selectedRecipe?.variants[mode];
  const activeImage = selectedRecipe?.images?.find((image) => image.id === activeImageId)
    ?? selectedRecipe?.images?.[0]
    ?? null;
  const selectedStandards = selectedContent.sharedStandards.filter((standard) =>
    selectedRecipe?.standardIds?.includes(standard.id),
  );
  const selectedGuides = selectedContent.sharedGuides.filter((guide) =>
    selectedRecipe?.guideIds?.includes(guide.id),
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!selectedRecipe || !dialog) return;
    if (!dialog.open) dialog.showModal();
    document.body.classList.add("recipe-dialog-open");
    window.setTimeout(() => detailTitleRef.current?.focus(), 0);
    return () => document.body.classList.remove("recipe-dialog-open");
  }, [selectedId]);

  const normalizedQuery = query.toLocaleLowerCase("ko-KR").replace(/\s+/g, "");

  useEffect(() => {
    const context = (document as Document & { modelContext?: RecipeToolContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    void Promise.resolve(context.registerTool({
      name: "search_recipes",
      title: "레시피 검색",
      description: "메뉴명, 카테고리, 설명 또는 재료에서 레시피를 검색하고 같은 결과를 화면에도 표시합니다.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", minLength: 1 } },
        required: ["query"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) {
        const candidate = input as { query?: unknown };
        if (typeof candidate.query !== "string" || !candidate.query.trim()) {
          throw new Error("검색어를 한 글자 이상 입력해 주세요.");
        }
        const term = candidate.query.toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
        const matches = recipes.filter((recipe) => recipeSearchText(recipe).includes(term));
        setCategory("전체");
        setQuery(candidate.query.trim());
        return {
          count: matches.length,
          recipes: matches.slice(0, 12).map((recipe) => ({
            id: recipe.id,
            name: recipe.name,
            category: recipe.category,
            version: recipe.version,
          })),
        };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);

    return () => lifecycle.abort();
  }, [recipes]);

  const filteredRecipes = useMemo(
    () =>
      recipes.filter(
        (recipe) =>
          (category === "전체" || recipe.category === category) &&
          (!normalizedQuery || recipeSearchText(recipe).includes(normalizedQuery)),
      ),
    [category, normalizedQuery, recipes],
  );

  const favoriteRecipes = favorites
    .map((id) => recipes.find((recipe) => recipe.id === id))
    .filter((recipe): recipe is Recipe => Boolean(recipe));
  const recentRecipes = recent
    .map((id) => recipes.find((recipe) => recipe.id === id))
    .filter((recipe): recipe is Recipe => Boolean(recipe));

  const openRecipe = (recipe: Recipe, trigger: HTMLElement) => {
    lastTriggerRef.current = trigger;
    setMode(supportedModes(recipe)[0] ?? "ICE");
    setActiveImageId(recipe.images?.[0]?.id ?? null);
    setSelectedId(recipe.id);
    setRecent((current) => [recipe.id, ...current.filter((id) => id !== recipe.id)].slice(0, 4));
  };

  const closeRecipe = () => {
    if (editDirty && !window.confirm("저장하지 않은 수정 내용이 있습니다. 편집을 종료할까요?")) return;
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    setSelectedId(null);
    setInlineAdmin(null);
    setEditDirty(false);
    setEditMessage("");
    document.body.classList.remove("recipe-dialog-open");
    window.setTimeout(() => lastTriggerRef.current?.focus(), 0);
  };

  const updateInlineRecipe = (updater: (recipe: Recipe) => Recipe) => {
    if (!selectedId) return;
    setInlineAdmin((current) => current ? {
      ...current,
      content: { ...current.content, recipes: current.content.recipes.map((recipe) => recipe.id === selectedId ? updater(recipe) : recipe) },
    } : current);
    setEditDirty(true);
  };

  const updateInlineContent = (updater: (value: RecipeContent) => RecipeContent) => {
    setInlineAdmin((current) => current ? { ...current, content: updater(current.content) } : current);
    setEditDirty(true);
  };

  const toggleMasterLink = (kind: "standard" | "guide", id: string) => {
    updateInlineRecipe((recipe) => {
      const field = kind === "standard" ? "standardIds" : "guideIds";
      const currentIds = recipe[field] ?? [];
      return {
        ...recipe,
        [field]: currentIds.includes(id) ? currentIds.filter((item) => item !== id) : [...currentIds, id],
      };
    });
  };

  const createSharedStandard = () => {
    if (!selectedId) return;
    const id = `standard-${Date.now()}`;
    const today = new Date().toISOString().slice(0, 10).replaceAll("-", ".");
    updateInlineContent((value) => ({
      ...value,
      sharedStandards: [...value.sharedStandards, {
        id,
        title: "새 공통 계량 기준",
        summary: "이 기준을 적용할 메뉴와 내용을 입력해 주세요.",
        version: "1.0",
        updatedAt: today,
        values: [{ label: "기본", value: "계량 입력" }],
      }],
      recipes: value.recipes.map((recipe) => recipe.id === selectedId
        ? { ...recipe, standardIds: [...(recipe.standardIds ?? []), id] }
        : recipe),
    }));
  };

  const createSharedGuide = () => {
    if (!selectedId) return;
    const id = `guide-${Date.now()}`;
    const today = new Date().toISOString().slice(0, 10).replaceAll("-", ".");
    updateInlineContent((value) => ({
      ...value,
      sharedGuides: [...value.sharedGuides, {
        id,
        title: "새 공통 제조 가이드",
        scope: "적용 범위를 입력해 주세요.",
        version: "1.0",
        updatedAt: today,
        sections: [{ title: "제조 기준", items: ["내용을 입력해 주세요."] }],
      }],
      recipes: value.recipes.map((recipe) => recipe.id === selectedId
        ? { ...recipe, guideIds: [...(recipe.guideIds ?? []), id] }
        : recipe),
    }));
  };

  const beginInlineEdit = async () => {
    if (!selectedId) return;
    setEditBusy(true);
    setEditMessage("관리자 권한과 최신 초안을 확인하는 중입니다.");
    try {
      const response = await fetch("/api/admin/content", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "인라인 편집을 시작하지 못했습니다.");
      const draftRecipe = (body.content as RecipeContent).recipes.find((recipe) => recipe.id === selectedId);
      if (!draftRecipe) throw new Error("초안에서 이 메뉴를 찾을 수 없습니다.");
      setInlineAdmin({ content: body.content, revision: body.revision, publishedVersion: body.publishedVersion });
      setMode(supportedModes(draftRecipe)[0] ?? "ICE");
      setEditDirty(false);
      setEditMessage(`공식 버전 ${body.publishedVersion}의 초안을 이 화면에서 수정 중입니다.`);
    } catch (error) {
      setEditMessage(error instanceof Error ? error.message : "인라인 편집을 시작하지 못했습니다.");
    } finally {
      setEditBusy(false);
    }
  };

  const saveInlineDraft = async (nextContent = inlineAdmin?.content) => {
    if (!inlineAdmin || !nextContent) return null;
    setEditBusy(true);
    setEditMessage("초안을 저장하는 중입니다.");
    try {
      const response = await fetch("/api/admin/content", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: nextContent, revision: inlineAdmin.revision }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "초안을 저장하지 못했습니다.");
      setInlineAdmin({ ...inlineAdmin, content: body.content, revision: body.revision });
      setEditDirty(false);
      setEditMessage(`초안 revision ${body.revision} 저장 완료`);
      return { revision: body.revision as number, content: body.content as RecipeContent };
    } catch (error) {
      setEditMessage(error instanceof Error ? error.message : "초안을 저장하지 못했습니다.");
      return null;
    } finally {
      setEditBusy(false);
    }
  };

  const publishInline = async () => {
    if (!inlineAdmin || !selectedId) return;
    const reason = window.prompt("이번 수정 내용을 짧게 적어 주세요.", "레시피 현장 수정");
    if (!reason?.trim()) return;
    const effectiveAt = new Date().toISOString().slice(0, 10);
    const nextContent = {
      ...inlineAdmin.content,
      recipes: inlineAdmin.content.recipes.map((recipe) => recipe.id === selectedId ? { ...recipe, change: reason.trim(), updatedAt: effectiveAt.replaceAll("-", ".") } : recipe),
    };
    const saved = await saveInlineDraft(nextContent);
    if (!saved || !window.confirm("저장한 초안을 지금 직원용 공식 레시피로 게시할까요?")) return;
    setEditBusy(true);
    try {
      const response = await fetch("/api/admin/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision: saved.revision, changeReason: reason.trim(), effectiveAt }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? body.errors?.join("\n") ?? "공식 게시에 실패했습니다.");
      setContent(body.content);
      setInlineAdmin(null);
      setEditDirty(false);
      setEditMessage(`공식 버전 ${body.version} 게시 완료`);
    } catch (error) {
      setEditMessage(error instanceof Error ? error.message : "공식 게시에 실패했습니다.");
    } finally {
      setEditBusy(false);
    }
  };

  const toggleFavorite = (id: string) => {
    setFavorites((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [id, ...current],
    );
  };

  const acknowledgeAnnouncement = () => {
    window.localStorage.setItem(announcementKey, "seen");
    setAnnouncementSeen(true);
  };

  const resetFilters = () => {
    setQuery("");
    setCategory("전체");
  };

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <a className={styles.backLink} href="#recipe-search-title">
          <span aria-hidden="true">⌂</span> 레시피 홈
        </a>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">B</span>
          <div>
            <p>BEANSOOP · STANDARD</p>
            <h1>레시피OS</h1>
          </div>
        </div>
        <div className={styles.headerActions}>
          <p className={styles.headerNote}>공식 제조 기준 · 공개용</p>
          <a href="/recipes/admin">관리자 편집</a>
        </div>
      </header>

      {contentError && (
        <p className={styles.dataWarning} role="status">
          관리 서버에 연결하지 못해 검증된 기본 레시피를 표시하고 있습니다.
        </p>
      )}

      {!announcementSeen ? (
        <section className={styles.announcement} aria-labelledby="announcement-title">
          <span className={styles.alertMark} aria-hidden="true">!</span>
          <div>
            <p>{announcement.important ? "중요 변경" : "레시피 안내"} · Ver {announcement.version}</p>
            <h2 id="announcement-title">{announcement.title}</h2>
            <span>{announcement.effectiveAt}부터 적용 · 공지 확인은 현재 브라우저에 저장됩니다.</span>
          </div>
          <button type="button" onClick={acknowledgeAnnouncement}>확인했습니다</button>
        </section>
      ) : (
        <div className={styles.seenNotice}>
          <span>변경 공지 Ver {announcement.version}을 이 기기에서 확인했습니다.</span>
          <button type="button" onClick={() => setAnnouncementSeen(false)}>다시 보기</button>
        </div>
      )}

      <section className={styles.hero} aria-labelledby="recipe-search-title">
        <div>
          <p className={styles.eyebrow}>FIND · MAKE · MATCH</p>
          <h2 id="recipe-search-title">5초 안에 찾고, 같은 품질로 만드세요.</h2>
          <p>메뉴명이나 재료를 검색하면 정량, 제조 순서와 실수 방지 기준을 바로 확인할 수 있습니다.</p>
        </div>
        <label className={styles.searchBox}>
          <span aria-hidden="true">⌕</span>
          <span className="sr-only">레시피 검색</span>
          <input
            type="search"
            placeholder="메뉴명 또는 재료 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && <button type="button" aria-label="검색어 지우기" onClick={() => setQuery("")}>×</button>}
        </label>
      </section>

      <nav className={styles.categories} aria-label="레시피 카테고리" role="tablist">
        {categories.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={category === item}
            onClick={() => setCategory(item)}
          >
            <span>{item}<small>{item === "전체" ? recipes.length : recipes.filter((recipe) => recipe.category === item).length}</small></span>
          </button>
        ))}
      </nav>

      {favoriteRecipes.length > 0 && !query && category === "전체" && (
        <RecipeStrip
          title="즐겨찾기"
          recipes={favoriteRecipes}
          favorites={favorites}
          onOpen={openRecipe}
          onFavorite={toggleFavorite}
        />
      )}

      {recentRecipes.length > 0 && !query && category === "전체" && (
        <RecipeStrip
          title="최근 본 레시피"
          recipes={recentRecipes}
          favorites={favorites}
          onOpen={openRecipe}
          onFavorite={toggleFavorite}
        />
      )}

      <section className={styles.recipeSection} aria-labelledby="all-recipes-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>RECIPE LIBRARY</p>
            <h2 id="all-recipes-title">{query || category !== "전체" ? "검색 결과" : "전체 레시피"}</h2>
          </div>
          <span>{filteredRecipes.length}개 메뉴</span>
        </div>

        {filteredRecipes.length > 0 ? (
          <div className={styles.recipeGrid}>
            {filteredRecipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                favorite={favorites.includes(recipe.id)}
                onOpen={openRecipe}
                onFavorite={toggleFavorite}
              />
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <strong>일치하는 레시피가 없습니다.</strong>
            <p>검색어를 줄이거나 다른 카테고리를 선택해 보세요.</p>
            <button type="button" onClick={resetFilters}>전체 레시피 보기</button>
          </div>
        )}
      </section>

      <section className={styles.standards} aria-labelledby="standards-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>COMMON STANDARD</p>
            <h2 id="standards-title">공통 제조 / 서비스 기준</h2>
          </div>
          <span>한 번 수정하면 연결된 레시피에 함께 반영</span>
        </div>
        <div className={styles.masterStandardGrid}>
          {sharedStandards.map((standard) => (
            <article key={standard.id} className={styles.masterStandardCard}>
              <div>
                <p>MASTER STANDARD · Ver {standard.version}</p>
                <h3>{standard.title}</h3>
                <span>{standard.summary}</span>
              </div>
              <div className={styles.standardValues}>
                {standard.values.map((value) => (
                  <span key={value.label}><small>{value.label}</small><strong>{value.value}</strong></span>
                ))}
              </div>
            </article>
          ))}
          {sharedGuides.map((guide) => (
            <article key={guide.id} className={styles.masterGuideCard}>
              <div>
                <p>SHARED GUIDE · Ver {guide.version}</p>
                <h3>{guide.title}</h3>
                <span>{guide.scope}</span>
              </div>
              <strong>{guide.sections.length}개 제조·서비스 기준 연결됨</strong>
            </article>
          ))}
        </div>
        <h3 className={styles.referenceTitle}>기본 계량 / 배합 참고</h3>
        <div className={styles.standardGrid}>
          {standards.map((standard) => (
            <div key={standard.label}>
              <span>{standard.label}</span>
              <strong>{standard.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <span>BEANSOOP RECIPE OS</span>
        <span>수치는 시범 이관 데이터이며 공식 게시 전 관리자 검수가 필요합니다.</span>
      </footer>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby="recipe-detail-title"
        onCancel={(event) => {
          event.preventDefault();
          closeRecipe();
        }}
        onClose={() => {
          setSelectedId(null);
          setInlineAdmin(null);
          setEditDirty(false);
          setEditMessage("");
          document.body.classList.remove("recipe-dialog-open");
          window.setTimeout(() => lastTriggerRef.current?.focus(), 0);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeRecipe();
        }}
      >
        {selectedRecipe && selectedVariant && (
          <article className={styles.detail}>
            <header className={styles.detailHeader}>
              <div>
                <p>{selectedRecipe.category} · Ver {selectedRecipe.version} · {selectedRecipe.updatedAt}</p>
                {inlineAdmin ? <input id="recipe-detail-title" className={styles.inlineTitleInput} aria-label="메뉴명" value={selectedRecipe.name} onChange={(event) => updateInlineRecipe((recipe) => ({ ...recipe, name: event.target.value }))} /> : <h2 id="recipe-detail-title" ref={detailTitleRef} tabIndex={-1}>{selectedRecipe.name}</h2>}
                {inlineAdmin ? <textarea className={styles.inlineDescriptionInput} aria-label="메뉴 설명" rows={2} value={selectedRecipe.description} onChange={(event) => updateInlineRecipe((recipe) => ({ ...recipe, description: event.target.value }))} /> : <span>{selectedRecipe.description}</span>}
              </div>
              <div className={styles.detailActions}>
                <button
                  type="button"
                  aria-pressed={favorites.includes(selectedRecipe.id)}
                  onClick={() => toggleFavorite(selectedRecipe.id)}
                >
                  {favorites.includes(selectedRecipe.id) ? "★ 즐겨찾기" : "☆ 즐겨찾기"}
                </button>
                {!inlineAdmin && <button className={styles.editRecipeButton} type="button" disabled={editBusy} onClick={() => void beginInlineEdit()}>바로 수정하기</button>}
                <button type="button" onClick={() => window.print()}>인쇄</button>
                <button className={styles.closeButton} type="button" onClick={closeRecipe} aria-label="레시피 닫기">×</button>
              </div>
            </header>

            {(inlineAdmin || editMessage) && <section className={styles.inlineEditBar} data-editing={Boolean(inlineAdmin)} role="status">
              <div><strong>{inlineAdmin ? "이 화면에서 바로 편집 중" : "편집 안내"}</strong><span>{editMessage}</span></div>
              {inlineAdmin && <div>
                <button type="button" disabled={editBusy || !editDirty} onClick={() => void saveInlineDraft()}>초안 저장</button>
                <button type="button" className={styles.publishInlineButton} disabled={editBusy} onClick={() => void publishInline()}>공식 게시</button>
                <button type="button" disabled={editBusy} onClick={() => { if (!editDirty || window.confirm("수정 내용을 버리고 보기 모드로 돌아갈까요?")) { setInlineAdmin(null); setEditDirty(false); setEditMessage(""); } }}>취소</button>
              </div>}
            </section>}

            <section className={styles.recipeMedia} aria-label={`${selectedRecipe.name} 사진과 영상`}>
              <div className={styles.galleryPanel}>
                <div className={styles.mediaHeading}><div><p>REAL DRINK</p><h3>실제 음료 갤러리</h3></div><span>{selectedRecipe.images?.length ?? 0}장</span></div>
                {activeImage ? (
                  <>
                    <figure className={styles.galleryHero}>
                      <img src={activeImage.url} alt={activeImage.alt || selectedRecipe.name} />
                      {activeImage.caption && <figcaption>{activeImage.caption}</figcaption>}
                    </figure>
                    {(selectedRecipe.images?.length ?? 0) > 1 && (
                      <div className={styles.galleryThumbs} aria-label="다른 음료 사진 선택">
                        {selectedRecipe.images?.map((image) => (
                          <button key={image.id} type="button" aria-pressed={image.id === activeImage.id} onClick={() => setActiveImageId(image.id)}>
                            <img src={image.url} alt="" /><span className="sr-only">{image.alt || `${selectedRecipe.name} 사진`}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className={styles.mediaEmpty}><span aria-hidden="true">＋</span><strong>실제 음료 사진 준비 중</strong><p>관리자가 등록한 사진이 이곳에 순서대로 표시됩니다.</p></div>
                )}
              </div>
              <div className={styles.videoPanel}>
                <div className={styles.mediaHeading}><div><p>WATCH & MAKE</p><h3>영상 레시피</h3></div><span>외부 영상</span></div>
                {selectedRecipe.videos?.length ? selectedRecipe.videos.map((video) => <VideoRecipeCard key={video.id} video={video} />) : <div className={styles.mediaEmpty}><span aria-hidden="true">▶</span><strong>영상 레시피 준비 중</strong><p>유튜브나 네이버 영상 주소를 등록하면 바로 재생됩니다.</p></div>}
              </div>
            </section>

            <div className={styles.modeTabs} role="group" aria-label="음료 옵션">
              {recipeModes.map((recipeMode) => {
                const supported = Boolean(selectedRecipe.variants[recipeMode]);
                return (
                  <button
                    key={recipeMode}
                    type="button"
                    disabled={!supported}
                    aria-pressed={mode === recipeMode}
                    onClick={() => supported && setMode(recipeMode)}
                  >
                    {recipeModeLabels[recipeMode]}
                    {!supported && <small>미지원</small>}
                  </button>
                );
              })}
            </div>

            <section className={styles.quickSection} aria-labelledby="quick-title">
              <div className={styles.detailSectionHeading}>
                <div><p>5 SECOND VIEW</p><h3 id="quick-title">QUICK RECIPE</h3></div>
                <span>{selectedRecipe.name} · {recipeModeLabels[mode]}</span>
              </div>
              <div className={styles.quickGrid}>
                {selectedVariant.quick.map((item, index) => (
                  <div key={`${item.label}-${index}`}>
                    {inlineAdmin ? <>
                      <input aria-label={`퀵 레시피 ${index + 1} 항목`} value={item.label} onChange={(event) => updateInlineRecipe((recipe) => ({ ...recipe, variants: { ...recipe.variants, [mode]: { ...recipe.variants[mode]!, quick: recipe.variants[mode]!.quick.map((value, itemIndex) => itemIndex === index ? { ...value, label: event.target.value } : value) } } }))} />
                      <input aria-label={`퀵 레시피 ${index + 1} 계량값`} value={item.value} onChange={(event) => updateInlineRecipe((recipe) => ({ ...recipe, variants: { ...recipe.variants, [mode]: { ...recipe.variants[mode]!, quick: recipe.variants[mode]!.quick.map((value, itemIndex) => itemIndex === index ? { ...value, value: event.target.value } : value) } } }))} />
                      <button type="button" aria-label={`퀵 레시피 ${index + 1} 삭제`} onClick={() => updateInlineRecipe((recipe) => ({ ...recipe, variants: { ...recipe.variants, [mode]: { ...recipe.variants[mode]!, quick: recipe.variants[mode]!.quick.filter((_, itemIndex) => itemIndex !== index) } } }))}>×</button>
                    </> : <><span>{item.label}</span><strong>{item.value}</strong></>}
                  </div>
                ))}
                {inlineAdmin && <button className={styles.inlineAddCard} type="button" onClick={() => updateInlineRecipe((recipe) => ({ ...recipe, variants: { ...recipe.variants, [mode]: { ...recipe.variants[mode]!, quick: [...recipe.variants[mode]!.quick, { label: "재료", value: "계량" }] } } }))}>+ 계량 추가</button>}
              </div>
            </section>

            <div className={styles.detailColumns}>
              <section className={styles.cupSection} aria-labelledby="cup-title">
                <div className={styles.detailSectionHeading}>
                  <div><p>DRINK STRUCTURE</p><h3 id="cup-title">음료 단면</h3></div>
                  <span>잔 아래(1층)부터 넣는 순서대로 쌓임</span>
                </div>
                <div className={styles.cup} aria-label={`${selectedRecipe.name} ${mode} 재료 층`}>
                  {[...selectedVariant.layers].reverse().map((layer, index) => {
                    const sourceIndex = selectedVariant.layers.length - 1 - index;
                    const colors = layerColors(layer);
                    const patchLayer = (patch: Partial<RecipeLayer>) => updateInlineRecipe((recipe) => ({ ...recipe, variants: { ...recipe.variants, [mode]: { ...recipe.variants[mode]!, layers: recipe.variants[mode]!.layers.map((value, itemIndex) => itemIndex === sourceIndex ? { ...value, ...patch } : value) } } }));
                    return <div key={`${layer.label}-${index}`} data-tone={layer.tone} style={{ background: colors.background, color: colors.text }}>
                      {inlineAdmin ? <>
                        <input aria-label={`재료층 ${sourceIndex + 1} 이름`} value={layer.label} onChange={(event) => { const suggested = suggestLayerTone(event.target.value); patchLayer(suggested && layer.tone !== customToneId ? { label: event.target.value, tone: suggested } : { label: event.target.value }); }} />
                        <input aria-label={`재료층 ${sourceIndex + 1} 값`} value={layer.value} onChange={(event) => patchLayer({ value: event.target.value })} />
                        <span className={styles.layerColorPick}>
                          <select aria-label={`재료층 ${sourceIndex + 1} 색상`} value={findLayerPalette(layer.tone) || layer.tone === customToneId ? layer.tone : "milk"} onChange={(event) => patchLayer(event.target.value === customToneId ? { tone: customToneId, color: layer.color ?? colors.background } : { tone: event.target.value })}>
                            {layerPalette.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                            <option value={customToneId}>직접 고른 색…</option>
                          </select>
                          {layer.tone === customToneId && <input type="color" aria-label={`재료층 ${sourceIndex + 1} 직접 색`} value={layer.color ?? "#ede3cf"} onChange={(event) => patchLayer({ color: event.target.value })} />}
                        </span>
                      </> : <><span><em className={styles.layerOrder} aria-label={`${sourceIndex + 1}층`}>{sourceIndex + 1}</em>{layer.label}</span><strong>{layer.value}</strong></>}
                    </div>
                  })}
                </div>
                {inlineAdmin && <button className={styles.inlineAddButton} type="button" onClick={() => updateInlineRecipe((recipe) => ({ ...recipe, variants: { ...recipe.variants, [mode]: { ...recipe.variants[mode]!, layers: [...recipe.variants[mode]!.layers, { label: "재료층", value: "계량", tone: "milk" }] } } }))}>+ 맨 위에 층 쌓기</button>}
              </section>

              <section className={styles.stepsSection} aria-labelledby="steps-title">
                <div className={styles.detailSectionHeading}>
                  <div><p>MAKE IN ORDER</p><h3 id="steps-title">STEP 제조 방법</h3></div>
                </div>
                <ol>
                  {selectedVariant.steps.map((step, index) => (
                    <li key={`${step}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span>{inlineAdmin ? <><textarea aria-label={`제조 단계 ${index + 1}`} rows={2} value={step} onChange={(event) => updateInlineRecipe((recipe) => ({ ...recipe, variants: { ...recipe.variants, [mode]: { ...recipe.variants[mode]!, steps: recipe.variants[mode]!.steps.map((value, itemIndex) => itemIndex === index ? event.target.value : value) } } }))} /><button type="button" aria-label={`제조 단계 ${index + 1} 삭제`} onClick={() => updateInlineRecipe((recipe) => ({ ...recipe, variants: { ...recipe.variants, [mode]: { ...recipe.variants[mode]!, steps: recipe.variants[mode]!.steps.filter((_, itemIndex) => itemIndex !== index) } } }))}>×</button></> : <p>{step}</p>}</li>
                  ))}
                </ol>
                {inlineAdmin && <button className={styles.inlineAddButton} type="button" onClick={() => updateInlineRecipe((recipe) => ({ ...recipe, variants: { ...recipe.variants, [mode]: { ...recipe.variants[mode]!, steps: [...recipe.variants[mode]!.steps, "새 제조 단계를 입력하세요."] } } }))}>+ 제조 단계 추가</button>}
              </section>
            </div>

            {(selectedStandards.length > 0 || selectedGuides.length > 0 || inlineAdmin) && (
              <section className={styles.linkedStandards} aria-labelledby="linked-standards-title">
                <div className={styles.detailSectionHeading}>
                  <div><p>LINKED MASTER DATA</p><h3 id="linked-standards-title">이 레시피에 적용되는 공통 기준</h3></div>
                  <span>{inlineAdmin ? "보관함에서 선택해 연결" : "원본 기준과 연결"}</span>
                </div>
                {inlineAdmin && (
                  <div className={styles.masterLibrary}>
                    <div className={styles.masterLibraryHeading}>
                      <div><strong>공통 기준 보관함</strong><span>체크하면 이 레시피에 바로 연결됩니다.</span></div>
                      <div><button type="button" onClick={createSharedStandard}>+ 새 계량 기준</button><button type="button" onClick={createSharedGuide}>+ 새 공통 가이드</button></div>
                    </div>
                    <div className={styles.masterLibraryGroups}>
                      <fieldset>
                        <legend>계량 기준</legend>
                        {selectedContent.sharedStandards.map((standard) => {
                          const count = selectedContent.recipes.filter((recipe) => recipe.standardIds?.includes(standard.id)).length;
                          return <label key={standard.id}><input type="checkbox" checked={Boolean(selectedRecipe.standardIds?.includes(standard.id))} onChange={() => toggleMasterLink("standard", standard.id)} /><span><strong>{standard.title}</strong><small>{count}개 메뉴 사용</small></span></label>;
                        })}
                      </fieldset>
                      <fieldset>
                        <legend>제조·서비스 가이드</legend>
                        {selectedContent.sharedGuides.map((guide) => {
                          const count = selectedContent.recipes.filter((recipe) => recipe.guideIds?.includes(guide.id)).length;
                          return <label key={guide.id}><input type="checkbox" checked={Boolean(selectedRecipe.guideIds?.includes(guide.id))} onChange={() => toggleMasterLink("guide", guide.id)} /><span><strong>{guide.title}</strong><small>{count}개 메뉴 사용</small></span></label>;
                        })}
                      </fieldset>
                    </div>
                  </div>
                )}
                {selectedStandards.map((standard) => (
                  <article key={standard.id} className={styles.linkedStandardCard}>
                    <div className={styles.masterCopy}>
                      <small>Ver {standard.version} · {standard.updatedAt}</small>
                      {inlineAdmin ? <><input aria-label="공통 기준 이름" value={standard.title} onChange={(event) => updateInlineContent((value) => ({ ...value, sharedStandards: value.sharedStandards.map((item) => item.id === standard.id ? { ...item, title: event.target.value } : item) }))} /><textarea aria-label="공통 기준 설명" rows={2} value={standard.summary} onChange={(event) => updateInlineContent((value) => ({ ...value, sharedStandards: value.sharedStandards.map((item) => item.id === standard.id ? { ...item, summary: event.target.value } : item) }))} /></> : <><strong>{standard.title}</strong><span>{standard.summary}</span></>}
                    </div>
                    <div className={styles.standardValues}>
                      {standard.values.map((measure, index) => (
                        <span key={`${measure.label}-${index}`}>{inlineAdmin ? <><input aria-label={`공통 기준 항목 ${index + 1}`} value={measure.label} onChange={(event) => updateInlineContent((value) => ({ ...value, sharedStandards: value.sharedStandards.map((item) => item.id === standard.id ? { ...item, values: item.values.map((entry, itemIndex) => itemIndex === index ? { ...entry, label: event.target.value } : entry) } : item) }))} /><input aria-label={`공통 기준 값 ${index + 1}`} value={measure.value} onChange={(event) => updateInlineContent((value) => ({ ...value, sharedStandards: value.sharedStandards.map((item) => item.id === standard.id ? { ...item, values: item.values.map((entry, itemIndex) => itemIndex === index ? { ...entry, value: event.target.value } : entry) } : item) }))} /><button type="button" aria-label={`공통 기준 항목 ${index + 1} 삭제`} onClick={() => updateInlineContent((value) => ({ ...value, sharedStandards: value.sharedStandards.map((item) => item.id === standard.id ? { ...item, values: item.values.filter((_, itemIndex) => itemIndex !== index) } : item) }))}>×</button></> : <><small>{measure.label}</small><strong>{measure.value}</strong></>}</span>
                      ))}
                      {inlineAdmin && <button className={styles.inlineAddButton} type="button" onClick={() => updateInlineContent((value) => ({ ...value, sharedStandards: value.sharedStandards.map((item) => item.id === standard.id ? { ...item, values: [...item.values, { label: "항목", value: "계량" }] } : item) }))}>+ 계량값</button>}
                    </div>
                    {inlineAdmin && <div className={styles.masterImpact}><span>이 기준을 사용하는 {selectedContent.recipes.filter((recipe) => recipe.standardIds?.includes(standard.id)).length}개 메뉴에 함께 반영</span><button type="button" onClick={() => toggleMasterLink("standard", standard.id)}>이 메뉴에서 연결 해제</button></div>}
                  </article>
                ))}
                {selectedGuides.map((guide) => (
                  inlineAdmin ? <article key={guide.id} className={styles.sharedGuideEditor}>
                    <div className={styles.masterEditorHeading}><div><small>공통 가이드 · Ver {guide.version}</small><input aria-label="공통 가이드 이름" value={guide.title} onChange={(event) => updateInlineContent((value) => ({ ...value, sharedGuides: value.sharedGuides.map((item) => item.id === guide.id ? { ...item, title: event.target.value } : item) }))} /></div><span>이 가이드를 사용하는 {selectedContent.recipes.filter((recipe) => recipe.guideIds?.includes(guide.id)).length}개 메뉴</span></div>
                    <label>적용 범위<textarea rows={2} value={guide.scope} onChange={(event) => updateInlineContent((value) => ({ ...value, sharedGuides: value.sharedGuides.map((item) => item.id === guide.id ? { ...item, scope: event.target.value } : item) }))} /></label>
                    {guide.sections.map((section, sectionIndex) => <div className={styles.guideSectionEditor} key={`${section.title}-${sectionIndex}`}><input aria-label={`가이드 구역 ${sectionIndex + 1} 제목`} value={section.title} onChange={(event) => updateInlineContent((value) => ({ ...value, sharedGuides: value.sharedGuides.map((item) => item.id === guide.id ? { ...item, sections: item.sections.map((entry, itemIndex) => itemIndex === sectionIndex ? { ...entry, title: event.target.value } : entry) } : item) }))} /><textarea aria-label={`가이드 구역 ${sectionIndex + 1} 내용`} rows={4} value={section.items.join("\n")} onChange={(event) => updateInlineContent((value) => ({ ...value, sharedGuides: value.sharedGuides.map((item) => item.id === guide.id ? { ...item, sections: item.sections.map((entry, itemIndex) => itemIndex === sectionIndex ? { ...entry, items: event.target.value.split("\n") } : entry) } : item) }))} /><button type="button" onClick={() => updateInlineContent((value) => ({ ...value, sharedGuides: value.sharedGuides.map((item) => item.id === guide.id ? { ...item, sections: item.sections.filter((_, itemIndex) => itemIndex !== sectionIndex) } : item) }))}>구역 삭제</button></div>)}
                    <button className={styles.inlineAddButton} type="button" onClick={() => updateInlineContent((value) => ({ ...value, sharedGuides: value.sharedGuides.map((item) => item.id === guide.id ? { ...item, sections: [...item.sections, { title: "새 구역", items: ["내용을 입력해 주세요."] }] } : item) }))}>+ 가이드 구역 추가</button>
                    <label>손님 안내 멘트<textarea rows={3} value={guide.serviceScript ?? ""} onChange={(event) => updateInlineContent((value) => ({ ...value, sharedGuides: value.sharedGuides.map((item) => item.id === guide.id ? { ...item, serviceScript: event.target.value } : item) }))} /></label>
                    <label>추후 보완 메모<textarea rows={2} value={guide.futureMemo ?? ""} onChange={(event) => updateInlineContent((value) => ({ ...value, sharedGuides: value.sharedGuides.map((item) => item.id === guide.id ? { ...item, futureMemo: event.target.value } : item) }))} /></label>
                    <button className={styles.unlinkButton} type="button" onClick={() => toggleMasterLink("guide", guide.id)}>이 메뉴에서 연결 해제</button>
                  </article> : <details key={guide.id} className={styles.sharedGuideDetail}>
                    <summary>
                      <span><small>공통 가이드 · Ver {guide.version}</small><strong>{guide.title}</strong></span>
                      <i>전체 내용 보기</i>
                    </summary>
                    <div className={styles.sharedGuideBody}>
                      <p className={styles.guideScope}>{guide.scope}</p>
                      {guide.sections.map((section) => (
                        <section key={section.title}>
                          <h4>{section.title}</h4>
                          <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>
                        </section>
                      ))}
                      {guide.serviceScript && (
                        <blockquote><small>손님 안내 멘트</small>“{guide.serviceScript}”</blockquote>
                      )}
                      {guide.futureMemo && <aside><strong>추후 보완 메모</strong>{guide.futureMemo}</aside>}
                    </div>
                  </details>
                ))}
              </section>
            )}

            {(selectedVariant.cautions || inlineAdmin) && (
              <section className={styles.cautionSection} aria-labelledby="caution-title">
                <div><span aria-hidden="true">!</span><h3 id="caution-title">제조 주의사항</h3></div>
                <ul>{(selectedVariant.cautions ?? []).map((caution, index) => <li key={`${caution}-${index}`}>{inlineAdmin ? <><input aria-label={`주의사항 ${index + 1}`} value={caution} onChange={(event) => updateInlineRecipe((recipe) => ({ ...recipe, variants: { ...recipe.variants, [mode]: { ...recipe.variants[mode]!, cautions: (recipe.variants[mode]!.cautions ?? []).map((value, itemIndex) => itemIndex === index ? event.target.value : value) } } }))} /><button type="button" aria-label={`주의사항 ${index + 1} 삭제`} onClick={() => updateInlineRecipe((recipe) => ({ ...recipe, variants: { ...recipe.variants, [mode]: { ...recipe.variants[mode]!, cautions: (recipe.variants[mode]!.cautions ?? []).filter((_, itemIndex) => itemIndex !== index) } } }))}>×</button></> : caution}</li>)}</ul>
                {inlineAdmin && <button className={styles.inlineAddButton} type="button" onClick={() => updateInlineRecipe((recipe) => ({ ...recipe, variants: { ...recipe.variants, [mode]: { ...recipe.variants[mode]!, cautions: [...(recipe.variants[mode]!.cautions ?? []), "새 주의사항"] } } }))}>+ 주의사항 추가</button>}
              </section>
            )}

            {!inlineAdmin && (
              <VideoPromptPanel key={`${selectedRecipe.id}-${mode}`} recipe={selectedRecipe} mode={mode} variant={selectedVariant} />
            )}

            {(selectedRecipe.sourceRef || selectedRecipe.reviewNotes?.length) && (
              <section className={styles.sourceSection} aria-label="원본 자료 및 검수 상태">
                <div>
                  <small>EXCEL SOURCE</small>
                  {inlineAdmin ? <input aria-label="원본 자료 위치" value={selectedRecipe.sourceRef ?? ""} onChange={(event) => updateInlineRecipe((recipe) => ({ ...recipe, sourceRef: event.target.value }))} /> : <strong>{selectedRecipe.sourceRef ?? "관리자 입력"}</strong>}
                </div>
                {selectedRecipe.reviewNotes?.map((note) => <p key={note}>{note}</p>)}
              </section>
            )}

            <section className={styles.guideSection} aria-labelledby="guide-title">
              <div>
                <p>손님 안내</p>
                <h3 id="guide-title">“어떤 맛이에요?”</h3>
                {inlineAdmin ? <textarea rows={4} aria-label="손님 맛 안내" value={selectedRecipe.customerGuide} onChange={(event) => updateInlineRecipe((recipe) => ({ ...recipe, customerGuide: event.target.value }))} /> : <span>{selectedRecipe.customerGuide}</span>}
              </div>
              <div>
                <p>추천 음용법</p>
                {inlineAdmin ? <textarea rows={4} aria-label="추천 음용법" value={selectedRecipe.drinkingTip} onChange={(event) => updateInlineRecipe((recipe) => ({ ...recipe, drinkingTip: event.target.value }))} /> : <strong>{selectedRecipe.drinkingTip}</strong>}
              </div>
            </section>

            <aside className={styles.reviewNotice}>
              이 레시피는 기존 표를 기준으로 옮긴 시범 데이터입니다. 실제 제조 전 관리자 검수를 완료해 주세요.
            </aside>
          </article>
        )}
      </dialog>
    </main>
  );
}

type RecipeCardProps = {
  recipe: Recipe;
  favorite: boolean;
  onOpen: (recipe: Recipe, trigger: HTMLElement) => void;
  onFavorite: (id: string) => void;
};

// v1 기능 3 — AI 영상 프롬프트 생성 (외부 API 없음, 정해진 문장 틀에 레시피 내용을 끼워 넣음)
function buildVideoPrompt(recipe: Recipe, mode: RecipeMode, variant: RecipeVariant) {
  const measures = [...variant.quick, ...variant.layers]
    .filter((item) => item.label.trim() && item.value.trim())
    .map((item) => `${item.label} ${item.value}`);
  const steps = variant.steps.map((step) => step.trim()).filter(Boolean);
  if (measures.length === 0 && steps.length === 0) return null;
  const cautions = (variant.cautions ?? []).map((item) => item.trim()).filter(Boolean);
  return [
    "빈숲카페 직원 교육용 레시피 영상을 만들어 주세요.",
    `메뉴: ${recipe.name} (${recipeModeLabels[mode]})`,
    measures.length ? `정량: ${measures.join(", ")}` : null,
    steps.length ? ["제조 순서:", ...steps.map((step, index) => `${index + 1}. ${step}`)].join("\n") : null,
    cautions.length ? `주의사항: ${cautions.join(" / ")}` : null,
    "화면 구성: 세로 9:16, 60초 이내. 각 단계마다 정량을 자막으로 크게 보여 주고, 바리스타의 손과 컵을 클로즈업합니다. 마지막에 완성된 컵을 3초간 보여 줍니다.",
    "말투: 신입 직원에게 설명하듯 짧고 친절하게. 레시피에 없는 재료나 순서는 추가하지 않습니다.",
  ].filter(Boolean).join("\n");
}

function VideoPromptPanel({ recipe, mode, variant }: { recipe: Recipe; mode: RecipeMode; variant: RecipeVariant }) {
  const [prompt, setPrompt] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  function generate() {
    const next = buildVideoPrompt(recipe, mode, variant);
    if (!next) {
      setPrompt(null);
      setNotice("레시피 정량·순서가 비어 있어 프롬프트를 만들 수 없습니다. 먼저 레시피를 채워 주세요.");
      return;
    }
    setPrompt(next);
    setNotice("");
  }

  async function copy() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setNotice("복사했습니다. 영상 생성 도구에 붙여넣으세요.");
    } catch {
      setNotice("자동 복사가 안 되는 브라우저입니다. 아래 글을 길게 눌러 복사하세요.");
    }
  }

  return (
    <section className={styles.promptSection} aria-labelledby="video-prompt-title">
      <div>
        <small>AI VIDEO PROMPT</small>
        <h3 id="video-prompt-title">영상 프롬프트 만들기</h3>
        <p>이 레시피의 정량·순서를 문장 틀에 넣어 교육 영상용 프롬프트를 만듭니다. 영상은 사장님이 직접 생성·검수합니다.</p>
        <div className={styles.promptActions}>
          <button type="button" onClick={generate}>{prompt ? "다시 만들기" : "프롬프트 생성"}</button>
          {prompt && <button type="button" onClick={() => void copy()}>복사</button>}
        </div>
        {notice && <p role="status">{notice}</p>}
      </div>
      {prompt && <textarea readOnly rows={10} value={prompt} aria-label="생성된 영상 프롬프트" onFocus={(event) => event.currentTarget.select()} />}
    </section>
  );
}

function VideoRecipeCard({ video }: { video: RecipeVideo }) {
  const embedUrl = videoEmbedUrl(video.url);
  const directUrl = directVideoUrl(video.url);
  const externalUrl = safeExternalUrl(video.url);
  const inferredPortrait = /(?:youtube\.com|youtu\.be)\/shorts\//i.test(video.url);
  const [detectedPortrait, setDetectedPortrait] = useState<boolean | null>(null);
  const orientation = video.orientation === "portrait" || (video.orientation !== "landscape" && (detectedPortrait ?? inferredPortrait))
    ? "portrait"
    : "landscape";
  return (
    <article className={styles.videoCard} data-orientation={orientation}>
      <div className={styles.videoStage}>
        {embedUrl ? <iframe src={embedUrl} title={video.title} loading="lazy" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> : directUrl ? <video src={directUrl} controls playsInline preload="metadata" onLoadedMetadata={(event) => setDetectedPortrait(event.currentTarget.videoHeight > event.currentTarget.videoWidth)}>이 브라우저에서는 영상을 재생할 수 없습니다.</video> : <div className={styles.videoFallback}>이 플랫폼은 새 창에서 재생됩니다.</div>}
      </div>
      <div className={styles.videoMeta}><strong>{video.title}</strong>{video.description && <p>{video.description}</p>}{externalUrl && <a href={externalUrl.toString()} target="_blank" rel="noreferrer">외부에서 보기 ↗</a>}</div>
    </article>
  );
}

function RecipeCard({ recipe, favorite, onOpen, onFavorite }: RecipeCardProps) {
  const visualMode = supportedModes(recipe)[0] ?? "ICE";
  const visualVariant = recipe.variants[visualMode];
  const visualLayers = visualVariant?.layers.slice(0, 5) ?? [];
  const cardMeasures = visualVariant?.quick.slice(0, 3) ?? [];
  const primaryImage = recipe.images?.[0];
  return (
    <article className={styles.recipeCard}>
      <button
        className={styles.cardMain}
        type="button"
        onClick={(event) => onOpen(recipe, event.currentTarget)}
        aria-label={`${recipe.name} 레시피 보기`}
      >
        <span className={styles.cardVisual} data-category={recipe.category} data-has-image={Boolean(primaryImage)}>
          {primaryImage ? <img className={styles.cardImage} src={primaryImage.url} alt="" /> : (
            <span className={styles.miniCup} aria-hidden="true">
              {[...visualLayers].reverse().map((layer, index) => <i key={`${layer.label}-${index}`} data-tone={layer.tone} style={{ background: layerColors(layer).background }} />)}
            </span>
          )}
          <span className={styles.visualRecipeStrip}>{cardMeasures.slice(0, 2).map((item) => <i key={`${item.label}-${item.value}`}>{item.label} <b>{item.value}</b></i>)}</span>
          {recipe.featured && <small>자주 찾음</small>}
        </span>
        <span className={styles.cardCopy}>
          <strong>{recipe.name}</strong>
          <small>QUICK RECIPE · {recipeModeLabels[visualMode]}</small>
          <span className={styles.cardMeasures}>{cardMeasures.map((item) => <i key={`${item.label}-${item.value}`}><b>{item.label}</b>{item.value}</i>)}</span>
          <span className={styles.modeList}>
            {recipeModes.map((item) => (
              <i key={item} data-supported={Boolean(recipe.variants[item])}>{recipeModeLabels[item]}</i>
            ))}
          </span>
        </span>
      </button>
      <button
        className={styles.favoriteButton}
        type="button"
        aria-label={`${recipe.name} ${favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}`}
        aria-pressed={favorite}
        onClick={() => onFavorite(recipe.id)}
      >
        {favorite ? "★" : "☆"}
      </button>
    </article>
  );
}

function RecipeStrip({ title, recipes: items, favorites, onOpen, onFavorite }: {
  title: string;
  recipes: Recipe[];
  favorites: string[];
  onOpen: RecipeCardProps["onOpen"];
  onFavorite: RecipeCardProps["onFavorite"];
}) {
  return (
    <section className={styles.recipeSection} aria-label={title}>
      <div className={styles.sectionHeading}><h2>{title}</h2><span>이 브라우저 기준</span></div>
      <div className={styles.recipeGrid}>
        {items.map((recipe) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            favorite={favorites.includes(recipe.id)}
            onOpen={onOpen}
            onFavorite={onFavorite}
          />
        ))}
      </div>
    </section>
  );
}
