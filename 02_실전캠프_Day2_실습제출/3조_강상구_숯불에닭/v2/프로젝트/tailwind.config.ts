import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // 숫자용 글꼴 (김씨육면 손익관리와 같은 조합: 본문 Pretendard + 숫자 IBM Plex Mono), 제목용 명조는 카페스이 방식(Gowun Batang)
      fontFamily: {
        mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        serif: ['"Gowun Batang"', '"Nanum Myeongjo"', "serif"],
      },
      // 색은 카페스이(손민지 사장님) "매장 운영" 화면의 브라운 크림 + 세이지 단추 (2026-10-17 사장님 결정 "K", 장부 전체 적용).
      // 코드에 쓰인 orange-*/stone-*/white 이름은 그대로 두고 값만 바꾼다 — orange = 세이지 초록(#6C8A66), stone = 브라운·크림 계열, white = 아이보리 카드(#FAF6EE)
      colors: {
        white: "#FAF6EE",
        orange: { 50: "#EEF3EB", 100: "#DCE4D4", 200: "#C6D4BD", 300: "#A9BE9F", 400: "#8AA583", 500: "#789672", 600: "#6C8A66", 700: "#5A7455", 800: "#475C43", 900: "#364632", 950: "#232E21" },
        stone: { 50: "#FAF6EE", 100: "#F4EDE1", 200: "#E3D8C6", 300: "#D2C4AE", 400: "#A89686", 500: "#7C6C60", 600: "#5F5248", 700: "#4A3F37", 800: "#3B302A", 900: "#2E251F", 950: "#1E1814" },
      },
    },
  },
  plugins: [],
};

export default config;
