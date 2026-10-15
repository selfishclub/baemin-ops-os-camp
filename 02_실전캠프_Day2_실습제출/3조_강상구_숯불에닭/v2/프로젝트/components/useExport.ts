"use client";

import { useCallback, useEffect, useState } from "react";
import { EXPORT_BAEMIN_KEY, EXPORT_META_KEY, EXPORT_RANK_KEY, EXPORT_REVIEWS_KEY, type BaeminExport, type ExportMeta, type ExportReview, type LedgerExport, type RankExport } from "@/lib/export/types";
import { getStore } from "@/lib/storage";

export interface ExportState {
  loaded: boolean;
  meta: ExportMeta | null;
  reviews: ExportReview[];
  rank: RankExport | null;
  baemin: BaeminExport | null;
  save: (e: LedgerExport) => Promise<ExportMeta>;
  reload: () => Promise<void>;
}

// 리뷰 수집기 내보내기 파일(리뷰·순위·배민 정산)을 설정 칸에서 읽고 쓴다. 리뷰·상권·정산 탭이 같이 쓴다.
export function useExport(): ExportState {
  const [state, setState] = useState<Pick<ExportState, "loaded" | "meta" | "reviews" | "rank" | "baemin">>({ loaded: false, meta: null, reviews: [], rank: null, baemin: null });

  const reload = useCallback(async () => {
    const store = getStore();
    const [meta, reviews, rank, baemin] = await Promise.all([
      store.getSetting<ExportMeta>(EXPORT_META_KEY),
      store.getSetting<ExportReview[]>(EXPORT_REVIEWS_KEY),
      store.getSetting<RankExport>(EXPORT_RANK_KEY),
      store.getSetting<BaeminExport>(EXPORT_BAEMIN_KEY),
    ]);
    setState({ loaded: true, meta, reviews: reviews ?? [], rank, baemin });
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    async (e: LedgerExport) => {
      const store = getStore();
      const meta: ExportMeta = {
        exportedAt: e.exportedAt,
        uploadedAt: new Date().toISOString(),
        reviews: e.reviews.length,
        rankPoints: e.rank?.history.length ?? 0,
        settlements: e.baemin?.settlements.length ?? 0,
      };
      await store.saveSetting(EXPORT_REVIEWS_KEY, e.reviews);
      // 순위·배민은 파일에 없으면 전에 올린 것을 지우지 않는다 (리뷰만 다시 내보낸 경우)
      if (e.rank) await store.saveSetting(EXPORT_RANK_KEY, e.rank);
      if (e.baemin) await store.saveSetting(EXPORT_BAEMIN_KEY, e.baemin);
      await store.saveSetting(EXPORT_META_KEY, meta);
      await reload();
      return meta;
    },
    [reload],
  );

  return { ...state, save, reload };
}
