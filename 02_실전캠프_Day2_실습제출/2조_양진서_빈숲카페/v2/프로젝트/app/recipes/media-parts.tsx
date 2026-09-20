"use client";

import { useState } from "react";
import type { RecipeVideo } from "./recipe-data";
import styles from "./recipes.module.css";

// 사진·영상을 보여 주는 부품. 레시피 상세와 매뉴얼 문서가 같이 쓴다.
// 영상은 유튜브·네이버TV 주소면 화면 안에서, 영상 파일 주소면 다운로드 단추 없이 재생한다. 위에는 항상 워터마크 층이 깔린다.

export function safeExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function videoEmbedUrl(value: string) {
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

export function directVideoUrl(value: string) {
  const url = safeExternalUrl(value);
  return url && /\.(?:mp4|webm|ogg)(?:$|\?)/i.test(`${url.pathname}${url.search}`) ? url.toString() : null;
}

// 사진·영상 위에 반투명으로 깔리는 워터마크 층. 클릭은 통과시킨다.
export function Watermark({ label }: { label: string }) {
  return (
    <div className={styles.watermark} aria-hidden="true">
      {Array.from({ length: 12 }, (_, index) => <span key={index}>{label}</span>)}
    </div>
  );
}

export function VideoRecipeCard({ video, watermark }: { video: RecipeVideo; watermark: string }) {
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
        <Watermark label={watermark} />
        {embedUrl ? <iframe src={embedUrl} title={video.title} loading="lazy" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> : directUrl ? <video src={directUrl} controls controlsList="nodownload noremoteplayback" disablePictureInPicture onContextMenu={(event) => event.preventDefault()} playsInline preload="metadata" onLoadedMetadata={(event) => setDetectedPortrait(event.currentTarget.videoHeight > event.currentTarget.videoWidth)}>이 브라우저에서는 영상을 재생할 수 없습니다.</video> : <div className={styles.videoFallback}>이 플랫폼은 새 창에서 재생됩니다.</div>}
      </div>
      <div className={styles.videoMeta}><strong>{video.title}</strong>{video.description && <p>{video.description}</p>}{externalUrl && !directUrl && <a href={externalUrl.toString()} target="_blank" rel="noreferrer">외부에서 보기 ↗</a>}</div>
    </article>
  );
}
