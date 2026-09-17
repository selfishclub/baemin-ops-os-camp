import type { NextRequest } from "next/server";
import { handleIngest } from "@/lib/ingest-route";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handleIngest(req);
}
