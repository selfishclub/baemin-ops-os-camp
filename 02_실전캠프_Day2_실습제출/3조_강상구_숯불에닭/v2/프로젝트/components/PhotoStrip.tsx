"use client";

import { useEffect, useRef, useState } from "react";
import { addPhoto, deletePhoto, getPhotoBlob, listPhotos, photosAvailable, type PhotoMeta } from "@/lib/photos";

// 영수증·명세표 사진 붙이는 칸. 매입 영수증과 규칙 탭의 고정비가 같이 쓴다.
// ownerId만 다르면 서로 섞이지 않는다 (사진은 이 브라우저 IndexedDB에만 있다).
export default function PhotoStrip({ ownerId, readOnly = false }: { ownerId: string; readOnly?: boolean }) {
  const [photos, setPhotos] = useState<PhotoMeta[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const available = photosAvailable();

  async function load() {
    const list = await listPhotos(ownerId);
    const next: Record<string, string> = {};
    for (const p of list) {
      const blob = await getPhotoBlob(p.id);
      if (blob) next[p.id] = URL.createObjectURL(blob);
    }
    setPhotos(list);
    setUrls((old) => {
      Object.values(old).forEach((u) => URL.revokeObjectURL(u));
      return next;
    });
  }
  useEffect(() => {
    if (available) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  if (!available) return null;

  async function addFiles(files: FileList) {
    setBusy(true);
    for (const f of Array.from(files)) {
      if (f.type.startsWith("image/") || f.type === "application/pdf") await addPhoto(ownerId, f);
    }
    setBusy(false);
    await load();
  }

  return (
    <div className="space-y-1 rounded-xl bg-stone-50 p-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-stone-600">
          영수증·명세표 {photos.length > 0 && <span className="num text-stone-500">{photos.length}장</span>}
        </p>
        {!readOnly && (
          <>
            <button className="btn-ghost px-2 py-1 text-xs" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? "넣는 중…" : "+ 사진·PDF 붙이기"}
            </button>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" aria-label="영수증 사진" onChange={(e) => e.target.files?.length && addFiles(e.target.files)} />
          </>
        )}
      </div>
      {photos.length === 0 ? (
        !readOnly && <p className="text-xs text-stone-500">폰으로 찍은 영수증 사진이나 거래처가 보내 준 명세표 PDF를 붙여 두면 나중에 숫자와 나란히 볼 수 있어요. 파일은 이 컴퓨터 브라우저에만 남아요.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {photos.map((p) => (
            <div key={p.id} className="relative">
              {p.type === "application/pdf" ? (
                <button
                  className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg bg-white p-1 text-center text-[11px] leading-tight text-stone-600 ring-1 ring-stone-200 hover:ring-orange-300"
                  title={p.name}
                  onClick={() => urls[p.id] && window.open(urls[p.id], "_blank")}
                >
                  <span className="text-lg">📄</span>
                  <span className="line-clamp-2 break-all">{p.name.replace(/\.pdf$/i, "")}</span>
                </button>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urls[p.id]} alt={p.name} className="h-20 w-20 cursor-zoom-in rounded-lg object-cover" onClick={() => urls[p.id] && window.open(urls[p.id], "_blank")} />
              )}
              {!readOnly && (
                <button
                  className="absolute -right-1 -top-1 rounded-full bg-white px-1.5 text-xs text-stone-600 shadow"
                  aria-label={`사진 지우기 ${p.name}`}
                  onClick={async () => {
                    await deletePhoto(p.id);
                    await load();
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
