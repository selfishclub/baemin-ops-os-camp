/** 노트북 앱이 켜져 있는 동안 클라우드의 수집 요청을 8초마다 확인해 실행합니다.
 *  인터넷 사이트의 "배민 수집" 버튼이 노트북 크롬을 여는 통로. */
import { fetchPendingFromCloud, cloudBase } from "./cloud";
import { buildCrawlArgs, currentJob, isRunning, startCrawl, stopCrawl, type CrawlPlatform } from "./runner";

const g = globalThis as unknown as { __crawlPoller?: NodeJS.Timeout };

export function startCloudPoller(): void {
  if (g.__crawlPoller || !cloudBase()) return;
  console.log(`[poller] 클라우드 수집 요청 확인 시작: ${cloudBase()}`);
  const tick = async () => {
    try {
      const res = await fetchPendingFromCloud();
      if (!res) return;
      const cur = currentJob();
      if (cur && cur.status === "running" && cur.cloudId && res.stopIds.includes(cur.cloudId)) {
        stopCrawl();
        return;
      }
      if (isRunning() || !res.pending) return;
      const platform = res.pending.platform as CrawlPlatform;
      if (!["baemin", "coupangeats", "naver"].includes(platform)) return;
      const ingestUrl = process.env.STUDIO_INGEST_URL!.trim();
      const extra = await buildCrawlArgs(platform);
      console.log(`[poller] 클라우드 요청 #${res.pending.id} (${platform}) 실행`);
      startCrawl(platform, { ingestUrl, extra, cloudId: res.pending.id });
    } catch (e) {
      console.error("[poller]", e instanceof Error ? e.message : e);
    }
  };
  g.__crawlPoller = setInterval(() => void tick(), 8000);
  void tick();
}
