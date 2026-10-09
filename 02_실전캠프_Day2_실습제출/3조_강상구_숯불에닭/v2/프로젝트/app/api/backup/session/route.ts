import { handleSession } from "@/lib/backupServer/handlers";
import { getServerCtx } from "@/lib/backupServer/runtime";

// 로컬 자동 백업 — 세션 발급. 공개 배포(Vercel)·시연 모드·BACKUP_DIR 없음이면 503 으로 꺼져 있다.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleSession(req, getServerCtx());
}
