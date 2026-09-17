import type { NextRequest } from "next/server";
import { deleteReview, getReview, listContents, setBookmark } from "@/lib/db";
import { errorMessage, fail, ok } from "@/lib/http";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  const review = await getReview(id);
  if (!review) return fail("리뷰를 찾을 수 없습니다.", 404);
  return ok({ review, contents: await listContents(id) });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  try {
    const body = (await req.json()) as { bookmarked?: boolean; note?: string };
    const current = await getReview(id);
    if (!current) return fail("리뷰를 찾을 수 없습니다.", 404);
    const review = await setBookmark(id, body.bookmarked ?? current.bookmarked, body.note);
    return ok({ review });
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  try {
    await deleteReview(id);
    return ok({});
  } catch (e) {
    return fail(errorMessage(e), 500);
  }
}
