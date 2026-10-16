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
      // 색은 카페스이(손민지 사장님) 화면의 팔레트 (2026-10-17 사장님 결정, 장부 전체 적용).
      // 코드에 쓰인 orange-*/stone-*/white 이름은 그대로 두고 값만 바꾼다 — orange = 세이지 초록(#6C8263), stone = 종이색 계열, white = 아이보리(#FFFDF7)
      colors: {
        white: "#FFFDF7",
        orange: { 50: "#F1F4EC", 100: "#DCE4D4", 200: "#C6D3BB", 300: "#A9BB9C", 400: "#8CA380", 500: "#7A9270", 600: "#6C8263", 700: "#5A6D52", 800: "#475841", 900: "#35422F", 950: "#232C1F" },
        stone: { 50: "#FAF8F1", 100: "#F4F1E8", 200: "#E2DDCF", 300: "#D1CAB7", 400: "#A3A697", 500: "#6C7264", 600: "#565C4F", 700: "#444940", 800: "#343831", 900: "#2A2E25", 950: "#1B1E18" },
      },
    },
  },
  plugins: [],
};

export default config;
