import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // verify 스크립트가 dev 서버의 .next를 덮어쓰지 않도록 별도 폴더 사용
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["playwright-core", "@libsql/client", "libsql"],
};

export default nextConfig;
