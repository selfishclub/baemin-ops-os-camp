// 올리기 전에 브라우저에서 사진을 1600px 이내 WEBP 로 줄인다 (레시피·매뉴얼 편집이 같이 쓴다)
export async function optimizeImage(file: File) {
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
