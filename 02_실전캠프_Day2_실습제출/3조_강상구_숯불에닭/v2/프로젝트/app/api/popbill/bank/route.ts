import { NextResponse } from "next/server";
import { fetchBank, PopbillError, readConfig } from "@/lib/popbill/client";
import { earliestAllowed, splitPeriods, toBankRows, toPopbillDate } from "@/lib/popbill/bank";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 통장 거래내역 가져오기. 장부 숫자는 받지 않고, 가져온 줄만 돌려준다.
//  (분류·중복 거르기·저장은 브라우저에서 — 손익은 이 컴퓨터 밖으로 안 나간다)
export async function POST(req: Request) {
  const c = readConfig();
  if (!c.ok) return NextResponse.json({ error: `팝빌 설정이 아직이에요. .env.local에 ${c.missing.join(", ")}를 넣어 주세요.` }, { status: 400 });

  let body: { from?: string; to?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "요청을 읽지 못했어요." }, { status: 400 }); }
  const today = new Date().toISOString().slice(0, 10);
  const to = body.to ?? today;
  const from = body.from ?? to.slice(0, 8) + "01";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to)
    return NextResponse.json({ error: "기간이 올바르지 않아요." }, { status: 400 });
  const floor = earliestAllowed(today);
  if (from < floor) return NextResponse.json({ error: `팝빌은 ${floor}부터만 가져올 수 있어요 (3개월).` }, { status: 400 });

  try {
    const list = [];
    for (const p of splitPeriods(from, to)) list.push(...(await fetchBank(c.config, toPopbillDate(p.from), toPopbillDate(p.to))));
    const rows = toBankRows(list);
    return NextResponse.json({ from, to, count: rows.length, rows, raw: list.slice(0, 3) });
  } catch (e) {
    const msg = e instanceof PopbillError ? e.message : "통장을 가져오지 못했어요.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
