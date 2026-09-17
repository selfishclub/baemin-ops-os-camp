import type { NextRequest } from "next/server";
import { availableProviders } from "@/lib/ai/client";
import { getSettings, saveSettings } from "@/lib/db";
import { errorMessage, fail, ok } from "@/lib/http";
import { SettingsSchema } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    return ok({ settings: await getSettings(), providers: availableProviders() });
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = SettingsSchema.partial().safeParse(body);
    if (!parsed.success) return fail("설정 형식이 올바르지 않습니다.");
    return ok({ settings: await saveSettings(parsed.data) });
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}
