"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { isBasic } from "@/lib/edition";

// 기본판(폰·공유용)에는 없는 화면(리뷰·상권)을 주소로 직접 열었을 때 보여 주는 안내.
// 전체판(사장님 PC)에서는 그대로 통과한다.
export function BasicGate({ children }: { children: ReactNode }) {
  if (!isBasic()) return <>{children}</>;
  return (
    <section className="card space-y-2">
      <h2 className="text-base font-bold">이 기능은 기본판에 없어요</h2>
      <p className="text-sm text-stone-600">리뷰·상권·키워드·광고 기능은 사장님 PC의 전체판에서만 써요 (리뷰 수집기 도우미가 같은 컴퓨터에 있어야 돌아가요). 폰·공유용 기본판은 손익·오늘·올리기·정산·원가율·규칙만 있어요.</p>
      <Link href="/" className="btn-ghost inline-block">
        손익 화면으로
      </Link>
    </section>
  );
}
