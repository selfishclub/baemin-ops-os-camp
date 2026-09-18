import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ChannelId, Major } from "../categories";
import { seedRules } from "../seed";
import type { ChannelSale, DailySale, DailyWeather, Month, MonthClosing, Rule, Shift, Staff, Transaction, UploadRecord } from "../types";
import type { Store } from "./index";
import { nextMonth } from "../month";

// "2026-09-31" 같은 없는 날짜를 만들지 않도록, 달의 끝은 "다음 달 1일 미만"으로 잡는다
const monthEnd = (month: Month) => nextMonth(month) + "-01";

// 시연 모드 전용. anon 공개 열쇠만 쓴다(service_role 금지). 테이블은 supabase/schema.sql.
type Row = Record<string, unknown>;
type Result<T> = { data: T | null; error: { message: string } | null };

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
});

const rowToTx = (r: Row): Transaction => ({
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
});

export class SupabaseStore implements Store {
  mode = "supabase" as const;
  private db: SupabaseClient;

  constructor() {
    this.db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  }

  private async run<T>(q: PromiseLike<Result<T>>): Promise<T> {
    const { data, error } = await q;
    if (error) throw new Error(`데이터 창고 오류: ${error.message}`);
    return data as T;
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
    if (rows && rows.length) return rows as unknown as Rule[];
    // 처음이면 기본 규칙을 넣어 둔다
    const seeds = seedRules();
    await this.run(this.db.from("rules").upsert(seeds));
    return seeds;
  }
  async saveRule(rule: Rule) {
    await this.run(this.db.from("rules").upsert(rule));
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
    return (rows ?? []).map((r): DailySale => ({ date: r.date as string, channel: r.channel as string, amount: Number(r.amount) }));
  }
  async saveDailySales(date: string, sales: DailySale[]) {
    await this.run(this.db.from("daily_sales").delete().eq("date", date));
    const rows = sales.filter((s) => s.date === date).map((s) => ({ date: s.date, channel: s.channel, amount: s.amount }));
    if (rows.length) await this.run(this.db.from("daily_sales").insert(rows));
  }
  async listShifts(month: Month) {
    const rows = await this.run<Row[]>(this.db.from("shifts").select("*").gte("date", month + "-01").lt("date", monthEnd(month)));
    return (rows ?? []).map((r): Shift => ({ date: r.date as string, staffId: r.staff_id as string, hours: Number(r.hours) }));
  }
  async saveShifts(date: string, shifts: Shift[]) {
    await this.run(this.db.from("shifts").delete().eq("date", date));
    const rows = shifts.filter((s) => s.date === date).map((s) => ({ date: s.date, staff_id: s.staffId, hours: s.hours }));
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
    return (rows ?? []).map((r): DailySale => ({ date: r.date as string, channel: r.channel as string, amount: Number(r.amount) }));
  }
  async listAllShifts() {
    const rows = await this.run<Row[]>(this.db.from("shifts").select("*"));
    return (rows ?? []).map((r): Shift => ({ date: r.date as string, staffId: r.staff_id as string, hours: Number(r.hours) }));
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
