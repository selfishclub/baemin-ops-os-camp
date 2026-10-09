import type { MetadataRoute } from "next";

// 핸드폰 홈 화면에 아이콘으로 붙이기 위한 설정 (안드로이드 "앱 설치", 아이폰 "홈 화면에 추가").
//  주소창 없이 앱처럼 열리기만 하고, 오프라인으로는 안 돕니다 — 데이터는 그 기기 브라우저에만 남습니다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "한눈 손익 장부",
    short_name: "손익 장부",
    description: "은행 거래내역과 배달앱 실매출을 넣으면 이번 달 실제로 남은 돈을 한 장으로 보여 줍니다.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fafaf9",
    theme_color: "#ea580c",
    lang: "ko",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
