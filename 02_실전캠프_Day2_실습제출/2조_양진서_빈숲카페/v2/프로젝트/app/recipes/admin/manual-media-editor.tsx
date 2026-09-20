"use client";
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import type { ManualDoc } from "../../manual/manual-data";
import { apiFetch } from "../../preview/preview-api";
import type { RecipeImage, RecipeVideo } from "../recipe-data";
import { optimizeImage } from "./optimize-image";
import styles from "./studio.module.css";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className={styles.field}><span>{label}</span>{children}</label>;
}

// 매뉴얼 문서·응대 카드에 사진·영상 붙이기.
// 사진: 파일을 올리거나(로그인 모드에서만 — 데이터 창고의 비공개 파일함으로 간다) https 주소로 붙인다.
// 영상: 유튜브·네이버TV·영상 파일의 https 주소. 직원 화면에서는 워터마크 층이 깔리고, 영상 파일은 다운로드 단추 없이 재생된다.
export default function ManualMediaEditor({ doc, onPatch, preview, onMessage }: { doc: ManualDoc; onPatch: (changes: Partial<ManualDoc>) => void; preview: boolean; onMessage: (text: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const images = doc.images ?? [];
  const videos = doc.videos ?? [];
  const setImages = (next: RecipeImage[]) => onPatch({ images: next.length ? next : undefined });
  const setVideos = (next: RecipeVideo[]) => onPatch({ videos: next.length ? next : undefined });

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const optimized = await optimizeImage(file);
      const form = new FormData();
      form.set("file", optimized);
      // 파일함 안에서 문서별 폴더로 나뉜다
      form.set("recipeId", `manual-${doc.id}`);
      const response = await apiFetch(preview, "/api/admin/media", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "사진을 올리지 못했습니다.");
      setImages([...images, { ...(body.image as RecipeImage), alt: doc.title }]);
      onMessage("사진을 올렸어요. ‘초안 저장’ → ‘공식 게시’를 해야 직원 화면에 나가요.");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "사진을 올리지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function addImageUrl() {
    const url = imageUrl.trim();
    try {
      if (new URL(url).protocol !== "https:") throw new Error("https");
    } catch {
      onMessage("사진 주소는 https:// 로 시작해야 해요.");
      return;
    }
    setImages([...images, { id: `img-${Date.now()}`, url, alt: doc.title }]);
    setImageUrl("");
  }

  return (
    <div className={styles.manualMedia}>
      <h3>사진 · 영상</h3>

      <div className={styles.manualMediaRow}>
        {images.map((image, index) => (
          <figure key={image.id}>
            <img src={image.url} alt="" />
            <input aria-label="사진 설명" placeholder="사진 설명" value={image.alt} onChange={(event) => setImages(images.map((item, itemIndex) => (itemIndex === index ? { ...item, alt: event.target.value } : item)))} />
            <button type="button" onClick={() => setImages(images.filter((_, itemIndex) => itemIndex !== index))}>빼기</button>
          </figure>
        ))}
      </div>
      <div className={styles.promptGuideActions}>
        <label className={styles.uploadButton}>
          {busy ? "올리는 중…" : "사진 올리기"}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} />
        </label>
        <input className={styles.inlineInput} placeholder="또는 사진 주소 (https://…)" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} />
        <button type="button" disabled={!imageUrl.trim()} onClick={addImageUrl}>주소로 붙이기</button>
      </div>
      {preview && <p className={styles.manualMediaNote}>미리보기에서는 사진 파일을 올릴 수 없어요(주소로 붙이기는 돼요). 파일 올리기는 로그인한 뒤 데이터 창고의 비공개 파일함으로 가요.</p>}

      {videos.map((video, index) => (
        <div key={video.id} className={styles.fieldGrid}>
          <Field label="영상 제목"><input value={video.title} onChange={(event) => setVideos(videos.map((item, itemIndex) => (itemIndex === index ? { ...item, title: event.target.value } : item)))} /></Field>
          <Field label="영상 주소 (유튜브 · 네이버TV · 영상 파일, https)">
            <input value={video.url} onChange={(event) => setVideos(videos.map((item, itemIndex) => (itemIndex === index ? { ...item, url: event.target.value } : item)))} />
          </Field>
          <button type="button" onClick={() => setVideos(videos.filter((_, itemIndex) => itemIndex !== index))}>이 영상 빼기</button>
        </div>
      ))}
      <div className={styles.promptGuideActions}>
        <button type="button" onClick={() => setVideos([...videos, { id: `video-${Date.now()}`, title: `${doc.title} 영상`, url: "" }])}>+ 영상 주소 추가</button>
      </div>
    </div>
  );
}
