import { handleStatus } from "@/lib/backupServer/handlers";
import { getServerCtx } from "@/lib/backupServer/runtime";

// 로컬 자동 백업 — 상태 (켜짐 여부·폴더·마지막 성공·파일 수). 꺼져 있으면 이유만 돌려준다.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handleStatus(req, getServerCtx());
}
