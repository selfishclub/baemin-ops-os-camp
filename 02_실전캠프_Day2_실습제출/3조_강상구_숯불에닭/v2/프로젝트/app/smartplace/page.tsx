"use client";

import { InflowKeywordsCard } from "@/components/InflowKeywordsCard";
import { ExportStatusLine } from "@/components/ExportUploadCard";
import { useExport } from "@/components/useExport";
import { Notice } from "@/components/ui";

// 스마트플레이스 탭 — 네이버 스마트플레이스 통계에서 가져온 숫자만 따로 본다 (상권 탭의 순위 추적·동네 조사와 섞지 않는다).
// 자료는 리뷰 수집기의 scripts/collect-smartplace-inflow.ts → export:ledger 로 온다.
export default function SmartplacePage() {
  const exp = useExport();
  if (!exp.loaded) return <p className="py-10 text-center text-sm text-stone-500">불러오는 중…</p>;
  const inflow = exp.market?.inflow ?? null;
  return (
    <>
      <ExportStatusLine exp={exp} need="스마트플레이스 통계" />
      {!inflow ? (
        <Notice tone="info">
          아직 스마트플레이스 통계가 없어요. 리뷰 수집기에서 <code>npx tsx scripts/collect-smartplace-inflow.ts</code> → <code>npm run export:ledger</code> 뒤 올리기 탭에서 내보내기 파일을 올리면(도우미가 켜져 있으면 자동) 여기에 보여요.
        </Notice>
      ) : (
        <InflowKeywordsCard inflow={inflow} />
      )}
    </>
  );
}
