import type { ReactNode } from "react";
import { BasicGate } from "@/components/BasicGate";

// 리뷰 탭은 전체판(사장님 PC)에만 있다
export default function ReviewsLayout({ children }: { children: ReactNode }) {
  return <BasicGate>{children}</BasicGate>;
}
