"use client";

import { useEffect, useState } from "react";
import type { RecipeVideo } from "./recipe-data";
import styles from "./recipes.module.css";

// 사진 파일 자체에 워터마크를 새긴다. 창고에서 받은 원본을 화면에 그대로 두지 않고, 브라우저 안에서
// "빈숲카페 · 보는 사람 · 날짜"를 비스듬히 여러 줄 새긴 사본을 만들어 그것만 보여 준다.
// 그래서 길게 눌러 저장하거나 캡처해도 이름·날짜가 박힌 파일이 나온다. (외부 https 사진은 그릴 수 없어 층 워터마크만)
function stampWatermark(context: CanvasRenderingContext2D, width: number, height: number, label: string) {
  const size = Math.max(14, Math.round(Math.min(width, height) / 20));
  context.save();
  context.font = `700 ${size}px system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
  context.textBaseline = "middle";
  context.translate(width / 2, height / 2);
  context.rotate(-Math.PI / 8);
  const textWidth = context.measureText(label).width;
  const stepX = textWidth + size * 3;
  const stepY = size * 3.4;
  const reach = Math.hypot(width, height);
  let rowIndex = 0;
  for (let y = -reach; y <= reach; y += stepY, rowIndex += 1) {
    const offset = rowIndex % 2 ? stepX / 2 : 0;
    for (let x = -reach - offset; x <= reach; x += stepX) {
      context.lineWidth = Math.max(2, size / 7);
      context.strokeStyle = "rgba(0, 0, 0, 0.28)";
      context.strokeText(label, x, y);
      context.fillStyle = "rgba(255, 255, 255, 0.42)";
      context.fillText(label, x, y);
    }
  }
  context.restore();
}

export function ProtectedImage({ src, alt, label, loading }: { src: string; alt: string; label: string; loading?: "lazy" | "eager" }) {
  // pending: 새기는 중(원본을 보여 주지 않는다) · stamped: 새긴 사본 · raw: 새길 수 없어 원본(외부 사진 등)
  const [state, setState] = useState<{ status: "pending" | "stamped" | "raw"; url: string }>({ status: "pending", url: "" });

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    (async () => {
      try {
        const sameOrigin = src.startsWith("/") || new URL(src, window.location.href).origin === window.location.origin;
        if (!sameOrigin) throw new Error("external");
        const response = await fetch(src);
        if (!response.ok) throw new Error("fetch");
        const bitmap = await createImageBitmap(await response.blob());
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("canvas");
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        stampWatermark(context, canvas.width, canvas.height, label);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
        if (!blob) throw new Error("blob");
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ status: "stamped", url: objectUrl });
      } catch {
        if (!cancelled) setState({ status: "raw", url: src });
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, label]);

  if (state.status === "pending") return <img alt="" aria-label={alt} data-stamping="true" draggable={false} />;
  return <img src={state.url} alt={alt} loading={loading} draggable={false} onContextMenu={(event) => event.preventDefault()} />;
}

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
