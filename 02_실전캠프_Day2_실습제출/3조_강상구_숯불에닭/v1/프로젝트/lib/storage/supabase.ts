import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ChannelId, Major } from "../categories";
import { seedRules } from "../seed";
import type { ChannelSale, Month, MonthClosing, Rule, Transaction, UploadRecord } from "../types";
import type { Store } from "./index";

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
  }
}
