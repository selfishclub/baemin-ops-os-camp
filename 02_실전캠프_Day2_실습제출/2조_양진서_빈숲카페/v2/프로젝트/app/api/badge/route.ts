import { createClient } from "@supabase/supabase-js";
import { hasSupabaseEnv, supabaseAnonKey, supabaseUrl } from "../../../lib/supabase/env";

export const dynamic = "force-dynamic";

const days = 14;
const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "cache-control": "public, max-age=60",
};

// 빈숲OS(포스기 화면) 배지용. 로그인 없이 "최근 14일 안에 바뀐 레시피 건수"만 준다. 메뉴 이름·내용은 나가지 않는다.
export async function GET() {
  if (!hasSupabaseEnv()) return Response.json({ count: 0, days, demo: true }, { headers: corsHeaders });
  const db = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
  const { data, error } = await db.rpc("recent_change_count", { days });
  if (error) return Response.json({ count: 0, days, error: "count unavailable" }, { status: 503, headers: corsHeaders });
  return Response.json({ count: Number(data ?? 0), days }, { headers: corsHeaders });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
