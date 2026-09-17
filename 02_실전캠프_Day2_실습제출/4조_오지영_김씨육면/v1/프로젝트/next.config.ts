import type { NextConfig } from "next";

/**
 * 개발 서버와 프로덕션 빌드가 같은 .next 폴더를 쓰면 서로 덮어써서
 * 청크가 404가 나고 화면이 빈 채로 뜬다. 빌드는 NEXT_DIST_DIR로 따로 뺀다.
 */
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
