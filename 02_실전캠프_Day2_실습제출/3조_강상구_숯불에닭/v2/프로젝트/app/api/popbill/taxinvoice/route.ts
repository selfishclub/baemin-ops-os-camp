import { NextResponse } from "next/server";
import { fetchTaxinvoices, PopbillError, readConfig } from "@/lib/popbill/client";
import { toPopbillDate } from "@/lib/popbill/bank";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 매입 전자세금계산서 가져오기 (홈택스 수집). 초안으로 바꾸는 건 브라우저에서 한다.
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

  try {
    const list = await fetchTaxinvoices(c.config, toPopbillDate(from), toPopbillDate(to));
    return NextResponse.json({ from, to, count: list.length, list });
  } catch (e) {
    const msg = e instanceof PopbillError ? e.message : "세금계산서를 가져오지 못했어요.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
