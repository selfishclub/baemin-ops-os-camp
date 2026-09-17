import { WeeklyPanel } from "@/components/WeeklyPanel";
import { hasAnyProvider } from "@/lib/ai/client";
import { listWeekly } from "@/lib/db";
import { recentWeekStarts } from "@/lib/week";

export const dynamic = "force-dynamic";

export default async function WeeklyPage() {
  // 최근 10주 + 이미 선정해둔 주(오래된 것 포함)를 합쳐 최신순으로
  const saved = await listWeekly(50);
  const weeks = Array.from(new Set([...recentWeekStarts(10), ...saved.map((w) => w.week_start)])).sort((a, b) => (a < b ? 1 : -1));
  return <WeeklyPanel weeks={weeks} aiReady={hasAnyProvider()} />;
}
