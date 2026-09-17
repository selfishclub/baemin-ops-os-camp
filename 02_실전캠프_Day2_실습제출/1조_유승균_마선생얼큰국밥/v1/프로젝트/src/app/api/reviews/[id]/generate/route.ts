import type { NextRequest } from "next/server";
import { generateContentsForReview } from "@/lib/ai/generate";
import { errorMessage, fail, ok } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  try {
    const res = await generateContentsForReview(id);
    return ok({ contents: res.rows, model: res.model, key_quote: res.bundle.key_quote });
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}
