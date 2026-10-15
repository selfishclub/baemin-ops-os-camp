"use client";

import { useCallback, useEffect, useState } from "react";
import { EXPORT_BAEMIN_KEY, EXPORT_COUPANG_KEY, EXPORT_MARKET_KEY, EXPORT_META_KEY, EXPORT_RANK_KEY, EXPORT_REVIEWS_KEY, type BaeminExport, type ExportMeta, type ExportReview, type LedgerExport, type MarketExport, type RankExport } from "@/lib/export/types";
import { applyMarks, pruneMarks, REPLY_MARKS_KEY, type ReplyMark } from "@/lib/reviews/marks";
import { getStore } from "@/lib/storage";

export interface ExportState {
  loaded: boolean;
  meta: ExportMeta | null;
  reviews: ExportReview[];
  rank: RankExport | null;
  baemin: BaeminExport | null;
  coupang: BaeminExport | null;
  market: MarketExport | null;
  save: (e: LedgerExport) => Promise<ExportMeta>;
  reload: () => Promise<void>;
}

export const EXPORT_UPDATED_EVENT = "ledger-export-updated";

/** 내보내기 파일을 설정 칸에 저장한다. 올리기 카드와 도우미 자동 갱신이 같이 쓴다 */
export async function applyExport(e: LedgerExport): Promise<ExportMeta> {
  const store = getStore();
  const meta: ExportMeta = {
    exportedAt: e.exportedAt,
    uploadedAt: new Date().toISOString(),
    reviews: e.reviews.length,
    rankPoints: e.rank?.history.length ?? 0,
    settlements: e.baemin?.settlements.length ?? 0,
  };
  await store.saveSetting(EXPORT_REVIEWS_KEY, e.reviews);
  // 순위·배민·상권은 파일에 없으면 전에 올린 것을 지우지 않는다 (리뷰만 다시 내보낸 경우)
  if (e.rank) await store.saveSetting(EXPORT_RANK_KEY, e.rank);
  if (e.baemin) await store.saveSetting(EXPORT_BAEMIN_KEY, e.baemin);
  if (e.coupang) await store.saveSetting(EXPORT_COUPANG_KEY, e.coupang);
  if (e.market) await store.saveSetting(EXPORT_MARKET_KEY, e.market);
  await store.saveSetting(EXPORT_META_KEY, meta);
  return meta;
}

// 리뷰 수집기 내보내기 파일(리뷰·순위·배민 정산)을 설정 칸에서 읽고 쓴다. 리뷰·상권·정산 탭이 같이 쓴다.
export function useExport(): ExportState {
  const [state, setState] = useState<Pick<ExportState, "loaded" | "meta" | "reviews" | "rank" | "baemin" | "coupang" | "market">>({ loaded: false, meta: null, reviews: [], rank: null, baemin: null, coupang: null, market: null });

  const reload = useCallback(async () => {
    const store = getStore();
    const [meta, reviews, rank, baemin, market, marks, coupang] = await Promise.all([
      store.getSetting<ExportMeta>(EXPORT_META_KEY),
      store.getSetting<ExportReview[]>(EXPORT_REVIEWS_KEY),
      store.getSetting<RankExport>(EXPORT_RANK_KEY),
      store.getSetting<BaeminExport>(EXPORT_BAEMIN_KEY),
      store.getSetting<MarketExport>(EXPORT_MARKET_KEY),
      store.getSetting<ReplyMark[]>(REPLY_MARKS_KEY),
      store.getSetting<BaeminExport>(EXPORT_COUPANG_KEY),
    ]);
    // 사장님이 "답글 달았어요"로 표시한 리뷰는 수집기가 답글을 가져올 때까지 답한 것으로 본다. 가져왔으면 표시를 정리한다
    const list = reviews ?? [];
    const kept = pruneMarks(list, marks ?? []);
    if (kept.length !== (marks ?? []).length) await store.saveSetting(REPLY_MARKS_KEY, kept);
    setState({ loaded: true, meta, reviews: applyMarks(list, kept), rank, baemin, coupang, market });
  }, []);

  useEffect(() => {
    void reload();
    // 도우미가 새 파일을 자동으로 넣으면 다시 읽는다
    window.addEventListener(EXPORT_UPDATED_EVENT, reload);
    return () => window.removeEventListener(EXPORT_UPDATED_EVENT, reload);
  }, [reload]);

  const save = useCallback(
    async (e: LedgerExport) => {
      const meta = await applyExport(e);
      await reload();
      return meta;
    },
    [reload],
  );

  return { ...state, save, reload };
}
