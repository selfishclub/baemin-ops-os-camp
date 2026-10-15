import { handleFinalize } from "@/lib/backupServer/handlers";
import { getServerCtx } from "@/lib/backupServer/runtime";

// 로컬 자동 백업 — 마무리 (디스크에서 다시 읽어 검증 → 최종 파일 → manifest)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleFinalize(req, getServerCtx());
}
