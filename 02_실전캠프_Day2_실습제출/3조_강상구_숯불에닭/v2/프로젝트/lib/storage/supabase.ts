import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelId, Major } from "../categories";
import { seedRules } from "../seed";
import { getSupabase } from "../supabase/client";
import type { ChannelSale, DailySale, DailyWeather, Month, MonthClosing, Rule, Shift, Staff, Transaction, UploadRecord } from "../types";
import type { BatchOp } from "./batch";
import type { Store } from "./index";
import { nextMonth } from "../month";

// "2026-09-31" 같은 없는 날짜를 만들지 않도록, 달의 끝은 "다음 달 1일 미만"으로 잡는다
const monthEnd = (month: Month) => nextMonth(month) + "-01";

// 인터넷 모드(폰·공유용). anon 공개 열쇠만 쓴다(service_role 금지). 표는 supabase/schema_v2.sql.
// 모든 줄에 user_id 가 붙고 잠금(RLS)이 "로그인한 사람 것"만 보여 주므로, 여기서는 user_id 를 따로 다루지 않는다
// (넣을 때는 DB 기본값 auth.uid() 이 채우고, 읽을 때는 잠금이 거른다).
type Row = Record<string, unknown>;
type Result<T> = { data: T | null; error: { message: string; code?: string } | null };

const txToRow = (t: Transaction): Row => ({
  id: t.id,
  month: t.month,
  date: t.date,
  payee: t.payee,
  out_amount: t.out,
  in_amount: t.in,
  source: t.source,
  major: t.major,
  minor: t.minor,
  channel: t.channel,
  review: t.review,
  pay_method: t.payMethod ?? null,
  splits: t.splits && t.splits.length ? t.splits : null,
});

const rowToTx = (r: Row): Transaction => {
  const t: Transaction = {
    id: r.id as string,
    month: r.month as string,
    date: r.date as string,
    payee: r.payee as string,
    out: Number(r.out_amount),
    in: Number(r.in_amount),
    source: r.source as Transaction["source"],
    major: (r.major as Major) ?? null,
    minor: (r.minor as string) ?? null,
    channel: (r.channel as ChannelId) ?? null,
    review: (r.review as Transaction["review"]) ?? null,
    payMethod: (r.pay_method as Transaction["payMethod"]) ?? undefined,
  };
  if (Array.isArray(r.splits) && r.splits.length) t.splits = r.splits as Transaction["splits"];
  return t;
};

// 일별 매출의 source: 앱은 없음 | "pos_easy", 표는 '' | 'pos_easy' (기본키에 들어가서 null 이 안 된다)
const rowToDailySale = (r: Row): DailySale => {
  const s: DailySale = { date: r.date as string, channel: r.channel as ChannelId, amount: Number(r.amount) };
  if (r.source === "pos_easy") s.source = "pos_easy";
  return s;
};
const dailySaleToRow = (s: DailySale): Row => ({ date: s.date, channel: s.channel, amount: s.amount, source: s.source ?? "" });

// 규칙은 열 이름이 앱의 Rule 필드와 같다 (prev_month·amount 포함). user_id 열은 읽을 때 떼어 낸다
const ruleToRow = (r: Rule): Row => ({ id: r.id, keyword: r.keyword, direction: r.direction, major: r.major, minor: r.minor, channel: r.channel ?? null, ambiguous: !!r.ambiguous, prev_month: !!r.prev_month, amount: r.amount ?? null });
const rowToRule = (r: Row): Rule => {
  const rule: Rule = { id: r.id as string, keyword: r.keyword as string, direction: r.direction as Rule["direction"], major: r.major as Major, minor: r.minor as string, channel: (r.channel as ChannelId) ?? null };
  if (r.ambiguous) rule.ambiguous = true;
  if (r.prev_month) rule.prev_month = true;
  if (r.amount !== null && r.amount !== undefined) rule.amount = Number(r.amount);
  return rule;
};

// Supabase 가 영어로 주는 오류를 사장님 말로
function friendly(message: string, code?: string): string {
  const m = message.toLowerCase();
  if (code === "42501" || m.includes("row-level security") || m.includes("jwt")) return "로그인이 풀렸어요. 다시 로그인해 주세요.";
  if (code === "42P01" || m.includes("does not exist")) return "인터넷 저장소에 표가 아직 없어요. supabase/schema_v2.sql 을 실행했는지 확인해 주세요.";
  if (m.includes("failed to fetch") || m.includes("network")) return "인터넷 연결이 안 돼요. 저장되지 않았어요.";
  return `인터넷 저장소 오류: ${message}`;
}

export class SupabaseStore implements Store {
  mode = "supabase" as const;
  // 인터넷 모드는 원자적이지 않다. 표마다 따로 요청하므로 중간에 실패하면 앞의 것만 남는다.
  // 진짜 원자성을 내려면 Postgres 함수(RPC) 한 번으로 전부 쓰도록 만들어야 한다 — 다음 단계.
  readonly batchAtomic = false;
  private db: SupabaseClient;

  constructor() {
    this.db = getSupabase();
  }

  private async run<T>(q: PromiseLike<Result<T>>): Promise<T> {
    const { data, error } = await q;
    if (error) throw new Error(friendly(error.message, error.code));
    return data as T;
  }

  // 순차 실행 — 원자적이지 않음 (batchAtomic = false). 실패하면 어디까지 됐는지 오류 메시지에 적는다.
  async batch(ops: BatchOp[]) {
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      try {
        if (op.kind === "transactions") await this.saveTransactions(op.txs);
        else if (op.kind === "upload") await this.saveUpload(op.record);
        else if (op.kind === "dailySales") await this.saveDailySales(op.date, op.sales);
        else if (op.kind === "shifts") await this.saveShifts(op.date, op.shifts);
        else await this.saveSetting(op.key, op.value);
      } catch (e) {
        throw new Error(`${e instanceof Error ? e.message : String(e)} (인터넷 모드: ${ops.length}개 중 ${i}개는 이미 저장됐고 ${ops.length - i}개는 안 됐어요)`);
      }
    }
  }

  async listTransactions(month: Month) {
    const rows = await this.run<Row[]>(this.db.from("transactions").select("*").eq("month", month).order("date"));
    return (rows ?? []).map(rowToTx);
  }
  async saveTransactions(txs: Transaction[]) {
    if (txs.length) await this.run(this.db.from("transactions").upsert(txs.map(txToRow)));
  }
  async deleteTransaction(id: string) {
    await this.run(this.db.from("transactions").delete().eq("id", id));
  }
  async listRules() {
    const rows = await this.run<Row[]>(this.db.from("rules").select("*").order("keyword"));
    if (rows && rows.length) return rows.map(rowToRule);
    // 처음이면 기본 규칙을 넣어 둔다
    const seeds = seedRules();
    await this.run(this.db.from("rules").upsert(seeds.map(ruleToRow)));
    return seeds;
  }
  async saveRule(rule: Rule) {
    await this.run(this.db.from("rules").upsert(ruleToRow(rule)));
  }
  async deleteRule(id: string) {
    await this.run(this.db.from("rules").delete().eq("id", id));
  }
  async listChannelSales(month: Month) {
    const rows = await this.run<Row[]>(this.db.from("channel_sales").select("*").eq("month", month));
    return (rows ?? []).map(
      (r): ChannelSale => ({
        month: r.month as string,
        channel: r.channel as ChannelId,
        name: r.name as string,
        orders: Number(r.orders),
        deposit: Number(r.deposit),
        count: Number(r.order_count),
        unsettled: r.unsettled === null || r.unsettled === undefined ? null : Number(r.unsettled),
      }),
    );
  }
  async saveChannelSales(sales: ChannelSale[]) {
    if (!sales.length) return;
    await this.run(
      this.db.from("channel_sales").upsert(
        sales.map((s) => ({
          month: s.month,
          channel: s.channel,
          name: s.name,
          orders: s.orders,
          deposit: s.deposit,
          order_count: s.count,
          unsettled: s.unsettled ?? null,
        })),
      ),
    );
  }
  async getClosing(month: Month) {
    const rows = await this.run<Row[]>(this.db.from("month_closings").select("*").eq("month", month));
    const r = rows?.[0];
    if (!r) return null;
    return { month, closedAt: (r.closed_at as string) ?? null, edits: (r.edits as MonthClosing["edits"]) ?? [] };
  }
  async saveClosing(c: MonthClosing) {
    await this.run(this.db.from("month_closings").upsert({ month: c.month, closed_at: c.closedAt, edits: c.edits }));
  }
  async listUploads() {
    const rows = await this.run<Row[]>(this.db.from("uploads").select("*"));
    return (rows ?? []).map(
      (r): UploadRecord => ({
        id: r.id as string,
        month: r.month as string,
        from: r.from_date as string,
        to: r.to_date as string,
        rowCount: Number(r.row_count),
        uploadedAt: r.uploaded_at as string,
      }),
    );
  }
  async saveUpload(u: UploadRecord) {
    await this.run(
      this.db.from("uploads").upsert({
        id: u.id,
        month: u.month,
        from_date: u.from,
        to_date: u.to,
        row_count: u.rowCount,
        uploaded_at: u.uploadedAt,
      }),
    );
  }
  async deleteMonth(month: Month) {
    for (const table of ["transactions", "channel_sales", "month_closings", "uploads"]) {
      await this.run(this.db.from(table).delete().eq("month", month));
    }
    for (const table of ["daily_sales", "shifts"]) {
      await this.run(this.db.from(table).delete().gte("date", month + "-01").lt("date", monthEnd(month)));
    }
  }
  async listDailySales(month: Month) {
    const rows = await this.run<Row[]>(this.db.from("daily_sales").select("*").gte("date", month + "-01").lt("date", monthEnd(month)));
    return (rows ?? []).map(rowToDailySale);
  }
  async saveDailySales(date: string, sales: DailySale[]) {
    await this.run(this.db.from("daily_sales").delete().eq("date", date));
    const rows = sales.filter((s) => s.date === date).map(dailySaleToRow);
    if (rows.length) await this.run(this.db.from("daily_sales").insert(rows));
  }
  async listShifts(month: Month) {
    const rows = await this.run<Row[]>(this.db.from("shifts").select("*").gte("date", month + "-01").lt("date", monthEnd(month)));
    return (rows ?? []).map((r): Shift => ({ date: r.date as string, staffId: r.staff_id as string, hours: Number(r.hours), start: (r.start_time as string | null) ?? undefined, end: (r.end_time as string | null) ?? undefined }));
  }
  async saveShifts(date: string, shifts: Shift[]) {
    await this.run(this.db.from("shifts").delete().eq("date", date));
    const rows = shifts.filter((s) => s.date === date).map((s) => ({ date: s.date, staff_id: s.staffId, hours: s.hours, start_time: s.start ?? null, end_time: s.end ?? null }));
    if (rows.length) await this.run(this.db.from("shifts").insert(rows));
  }
  async listStaff() {
    const rows = await this.run<Row[]>(this.db.from("staff").select("*").order("alias"));
    return (rows ?? []).map((r): Staff => ({ id: r.id as string, alias: r.alias as string, wage: Number(r.wage), active: !!r.active }));
  }
  async saveStaff(staff: Staff) {
    await this.run(this.db.from("staff").upsert({ id: staff.id, alias: staff.alias, wage: staff.wage, active: staff.active }));
  }
  async listAllDailySales() {
    const rows = await this.run<Row[]>(this.db.from("daily_sales").select("*").order("date"));
    return (rows ?? []).map(rowToDailySale);
  }
  async listAllShifts() {
    const rows = await this.run<Row[]>(this.db.from("shifts").select("*"));
    return (rows ?? []).map((r): Shift => ({ date: r.date as string, staffId: r.staff_id as string, hours: Number(r.hours), start: (r.start_time as string | null) ?? undefined, end: (r.end_time as string | null) ?? undefined }));
  }
  async listWeather(from: string, to: string) {
    const rows = await this.run<Row[]>(this.db.from("daily_weather").select("*").gte("date", from).lte("date", to));
    return (rows ?? []).map(
      (r): DailyWeather => ({ date: r.date as string, kind: r.kind as DailyWeather["kind"], tempMax: Number(r.temp_max), tempMin: Number(r.temp_min), rainMm: Number(r.rain_mm), source: r.source as DailyWeather["source"] }),
    );
  }
  async saveWeather(records: DailyWeather[]) {
    if (!records.length) return;
    await this.run(this.db.from("daily_weather").upsert(records.map((w) => ({ date: w.date, kind: w.kind, temp_max: w.tempMax, temp_min: w.tempMin, rain_mm: w.rainMm, source: w.source }))));
  }
  async getSetting<T>(key: string) {
    const rows = await this.run<Row[]>(this.db.from("settings").select("*").eq("key", key));
    return rows?.[0] ? (rows[0].value as T) : null;
  }
  async saveSetting<T>(key: string, value: T) {
    await this.run(this.db.from("settings").upsert({ key, value }));
  }
}
