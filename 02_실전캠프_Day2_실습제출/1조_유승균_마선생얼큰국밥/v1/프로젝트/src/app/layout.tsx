import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "리뷰 콘텐츠 스튜디오",
  description: "배달앱 리뷰를 모아 인스타·릴스·새소식 콘텐츠로 바꿔주는 도구",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen">
        <Nav />
        <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">{children}</main>
      </body>
    </html>
  );
}
