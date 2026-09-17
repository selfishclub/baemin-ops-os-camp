/** Vercel 등 인터넷 서버에서 실행 중인지 (크롬을 열 수 없는 환경) */
export function isCloudRuntime(): boolean {
  return process.env.VERCEL === "1" || process.env.STUDIO_CLOUD === "1";
}
