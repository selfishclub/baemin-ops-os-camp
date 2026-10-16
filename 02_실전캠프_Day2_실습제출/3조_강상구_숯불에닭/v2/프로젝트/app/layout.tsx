import type { Metadata, Viewport } from "next";
import AppShell from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "한눈 손익 장부",
  description: "은행 거래내역과 배달앱 실매출을 넣으면 이번 달 실제로 남은 돈을 한 장으로 보여 줍니다.",
  // 핸드폰 홈 화면에 붙였을 때 쓰는 이름·아이콘 (아이폰은 apple-touch-icon, 안드로이드는 manifest.ts)
  applicationName: "손익 장부",
  appleWebApp: { capable: true, title: "손익 장부", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ea580c" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* 글꼴: 본문 Pretendard, 숫자 IBM Plex Mono (김씨육면 손익관리와 같은 조합). 인터넷이 없으면 기본 글꼴로 보인다 */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Gowun+Batang:wght@400;700&display=swap" />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
