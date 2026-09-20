import { requireViewerApi, type Viewer } from "../../auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { allowedSections, lockedResponse } from "../../../db/portal-store";
import { addCheck, readDailyRows, readDailyRowsSince, removeCheck } from "../../../db/check-store";
import { readPublishedContent } from "../../../db/recipe-store";
import { buildCheckDocs, buildDaySummaries, checkItemKey, isCheckDate, lastDates, signoffItemKey, todayInSeoul } from "../../checks/check-data";
import { manualSectionIds, readableManuals } from "../../manual/manual-data";

export const dynamic = "force-dynamic";

// 오늘 체크. 직원은 오늘 것만 보고 누른다. 사장은 지난 날짜도 보고 "확인함"을 누른다.
async function view(db: SupabaseClient, viewer: Viewer, requestedDate: string | null) {
  const allowed = await allowedSections({ mode: "auth", viewer, db }, ["checks", ...manualSectionIds]);
  if (!allowed.has("checks")) return null;
  const today = todayInSeoul();
  const isOwner = viewer.role === "owner";
  const date = isOwner && isCheckDate(requestedDate) ? requestedDate : today;
  const docs = readableManuals(await readPublishedContent(db)).filter((doc) => allowed.has(doc.sectionId));
  const rows = await readDailyRows(db, date);
  const dates = lastDates(today, 14);
  return {
    date,
    today,
    docs: buildCheckDocs(docs, rows, viewer.id),
    // 사장만: 최근 14일 요약
    history: isOwner ? buildDaySummaries(docs, await readDailyRowsSince(db, dates[dates.length - 1]), dates) : [],
  };
}

export async function GET(request: Request) {
  const ctx = await requireViewerApi();
  if ("error" in ctx) return ctx.error;
  try {
    const body = await view(ctx.db, ctx.viewer, new URL(request.url).searchParams.get("date"));
    return body ? Response.json(body) : lockedResponse();
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "체크 기록을 읽지 못했습니다." }, { status: 503 });
  }
}

// { docId, itemKey, checked } = 오늘 항목 체크/취소 (사람이 직접 누른다)
// { docId, date, signoff } = 사장의 확인함/취소
export async function POST(request: Request) {
  const ctx = await requireViewerApi();
  if ("error" in ctx) return ctx.error;
  const body = await request.json().catch(() => ({})) as { docId?: string; itemKey?: string; checked?: boolean; signoff?: boolean; date?: string };
  try {
    const allowed = await allowedSections({ mode: "auth", viewer: ctx.viewer, db: ctx.db }, ["checks", ...manualSectionIds]);
    if (!allowed.has("checks")) return lockedResponse();
    const doc = readableManuals(await readPublishedContent(ctx.db)).find((item) => item.id === body.docId && item.dailyCheck && allowed.has(item.sectionId));
    if (!doc) return Response.json({ error: "어떤 문서인지 없습니다." }, { status: 400 });
    const today = todayInSeoul();

    if (typeof body.signoff === "boolean") {
      if (ctx.viewer.role !== "owner") return Response.json({ error: "확인함은 사장님만 누를 수 있습니다." }, { status: 403 });
      const date = isCheckDate(body.date) ? body.date : today;
      if (body.signoff) await addCheck(ctx.db, { date, docId: doc.id, itemKey: signoffItemKey, itemText: "확인함", userId: ctx.viewer.id, userName: ctx.viewer.displayName });
      else await removeCheck(ctx.db, date, doc.id, signoffItemKey);
      return Response.json(await view(ctx.db, ctx.viewer, date));
    }

    const text = doc.steps.find((step) => checkItemKey(step) === body.itemKey);
    if (!text || body.itemKey === signoffItemKey) return Response.json({ error: "어떤 항목인지 없습니다." }, { status: 400 });
    // 체크는 오늘 것만 (지난 날짜를 나중에 채워 넣지 못하게)
    if (body.checked === false) await removeCheck(ctx.db, today, doc.id, body.itemKey!);
    else await addCheck(ctx.db, { date: today, docId: doc.id, itemKey: body.itemKey!, itemText: text, userId: ctx.viewer.id, userName: ctx.viewer.displayName });
    return Response.json(await view(ctx.db, ctx.viewer, null));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "저장하지 못했습니다." }, { status: 503 });
  }
}
