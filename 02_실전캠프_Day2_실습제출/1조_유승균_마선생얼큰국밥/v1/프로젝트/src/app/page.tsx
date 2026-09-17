import Link from "next/link";
import { CrawlPanel } from "@/components/CrawlPanel";
import { ReviewBrowser } from "@/components/ReviewBrowser";
import { getSettings, getStats, isCloudDb } from "@/lib/db";
import { isCloudRuntime } from "@/lib/runtime";
import { PLATFORM_LABEL, type Platform } from "@/lib/types";
import { weekRange } from "@/lib/week";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const settings = await getSettings();
  const { start, end } = weekRange(new Date());
  const stats = await getStats(start, end);
  const port = process.env.PORT || "3400";
  const ingestUrl = `http://localhost:${port}/api/reviews/ingest`;

  return (
    <div className="flex flex-col gap-4">
      {!settings.storeName ? (
        <div className="rounded-xl border border-[#f1c9bb] bg-[var(--accent-soft)] px-4 py-3 text-sm">
          처음 오셨군요! <Link href="/settings" className="font-bold underline">설정</Link>에서 가게 이름·대표 메뉴를 넣어두면 콘텐츠 품질이 훨씬 좋아집니다.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="전체 리뷰" value={stats.total} sub={Object.entries(stats.byPlatform).map(([p, n]) => `${PLATFORM_LABEL[p as Platform] || p} ${n}`).join(" · ")} />
        <Stat label="이번 주 리뷰" value={stats.thisWeek} sub={`${start} ~ ${end}`} />
        <Stat label="리뷰 수집함" value={stats.bookmarked} sub="북마크한 리뷰" href="/bookmarks" />
        <Stat label="콘텐츠 만든 리뷰" value={stats.withContent} sub={stats.lastCollectedAt ? `마지막 수집 ${stats.lastCollectedAt.slice(0, 16).replace("T", " ")}` : "아직 수집 전"} />
      </div>

      <CrawlPanel hasNaver={Boolean(settings.naverPlaceUrl)} ingestUrl={ingestUrl} cloud={isCloudRuntime()} cloudDb={isCloudDb()} />

      <ReviewBrowser title="리뷰" />
    </div>
  );
}

function Stat({ label, value, sub, href }: { label: string; value: number; sub?: string; href?: string }) {
  const body = (
    <div className="card p-4">
      <p className="text-xs font-semibold text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-extrabold">{value}</p>
      {sub ? <p className="mt-1 truncate text-[11px] text-[var(--muted)]" title={sub}>{sub}</p> : null}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
