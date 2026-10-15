import { handleUpload } from "@/lib/backupServer/handlers";
import { getServerCtx } from "@/lib/backupServer/runtime";

// 로컬 자동 백업 — 파일 올리기 (본문을 스트림으로 디스크에 바로 쓴다. 메모리에 통째로 올리지 않는다)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleUpload(req, getServerCtx());
}
