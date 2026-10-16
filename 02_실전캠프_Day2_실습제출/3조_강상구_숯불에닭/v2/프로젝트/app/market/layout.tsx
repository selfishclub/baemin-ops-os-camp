import type { ReactNode } from "react";
import { BasicGate } from "@/components/BasicGate";

// 상권 탭(키워드·광고 포함)은 전체판(사장님 PC)에만 있다
export default function MarketLayout({ children }: { children: ReactNode }) {
  return <BasicGate>{children}</BasicGate>;
}
