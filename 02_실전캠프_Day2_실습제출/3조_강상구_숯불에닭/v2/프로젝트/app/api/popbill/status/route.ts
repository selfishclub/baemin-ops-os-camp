import { NextResponse } from "next/server";
import { readConfig } from "@/lib/popbill/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 팝빌 설정이 됐는지만 알려 준다. 열쇠 값은 절대 안 돌려준다.
export function GET() {
  const c = readConfig();
  if (!c.ok) return NextResponse.json({ ready: false, missing: c.missing });
  return NextResponse.json({
    ready: true,
    test: c.config.isTest,
    bankCode: c.config.bankCode,
    account: c.config.accountNumber.replace(/\d(?=\d{4})/g, "*"), // 뒤 4자리만
  });
}
