import { ReviewBrowser } from "@/components/ReviewBrowser";

export const dynamic = "force-dynamic";

export default function BookmarksPage() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-[var(--muted)]">☆ 를 눌러 담아둔 좋은 리뷰가 여기에 누적됩니다. 콘텐츠 소재로 바로 쓰세요.</p>
      <ReviewBrowser bookmarkedOnly title="리뷰 수집함" />
    </div>
  );
}
