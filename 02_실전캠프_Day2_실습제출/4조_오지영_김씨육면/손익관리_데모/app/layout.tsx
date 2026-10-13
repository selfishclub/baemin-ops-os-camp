import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "김씨육면 손익관리",
  description: "카드 내역서를 올리면 계정과목별로 분류해 그 달 손익을 보여줍니다",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* 본문·숫자 — Pretendard. 고정폭 숫자가 들어 있어 표에서 자릿수가 맞는다 */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/pretendard.min.css"
        />
        {/* 화면 제목 — 마루 부리 (네이버). 표·숫자에는 쓰지 않는다 */}
        <link rel="preconnect" href="https://hangeul.pstatic.net" crossOrigin="" />
        {/* 숫자·축·표 — IBM Plex Mono. 자릿수가 칼같이 맞아야 표에서 읽힌다 */}
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
