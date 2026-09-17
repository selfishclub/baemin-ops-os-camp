import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const socialImage = new URL("/og-recipe.png", metadataBase).toString();

  return {
    metadataBase,
    title: "빈숲 레시피OS | 카페 표준 레시피",
    description: "빈숲의 메뉴 사진, 정량, 제조 순서와 주의사항을 휴대폰에서 빠르게 확인하는 레시피 시스템",
    openGraph: {
      title: "빈숲 레시피OS",
      description: "메뉴를 찾고, 정량대로 만들고, 같은 품질로 완성하세요.",
      type: "website",
      locale: "ko_KR",
      images: [{ url: socialImage, width: 1536, height: 1024 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "빈숲 레시피OS",
      description: "메뉴를 찾고, 정량대로 만들고, 같은 품질로 완성하세요.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={geist.variable}>{children}</body>
    </html>
  );
}
