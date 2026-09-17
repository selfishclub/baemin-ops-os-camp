import { seedRules } from "../seed";
import type { ChannelSale, Month, MonthClosing, Rule, Transaction, UploadRecord } from "../types";
import type { Store } from "./index";

export const LOCAL_KEY = "sootdak-ledger-v1";

export interface LocalData {
  transactions: Transaction[];
  rules: Rule[];
  channelSales: ChannelSale[];
  closings: MonthClosing[];
  uploads: UploadRecord[];
}

export const emptyData = (): LocalData => ({
  transactions: [],
  rules: seedRules(),
  channelSales: [],
  closings: [],
  uploads: [],
});

export function readLocal(): LocalData {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return emptyData();
    return { ...emptyData(), ...(JSON.parse(raw) as Partial<LocalData>) };
  } catch {
    return emptyData();
  }
}

export function writeLocal(d: LocalData) {
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(d));
}

const upsert = <T>(list: T[], item: T, same: (a: T, b: T) => boolean) =>
  list.some((x) => same(x, item)) ? list.map((x) => (same(x, item) ? item : x)) : [...list, item];

export class LocalStore implements Store {
  mode = "local" as const;

  private update(fn: (d: LocalData) => LocalData) {
    writeLocal(fn(readLocal()));
  }

  async listTransactions(month: Month) {
    return readLocal().transactions.filter((t) => t.month === month);
  }
  async saveTransactions(txs: Transaction[]) {
    this.update((d) => ({
      ...d,
      transactions: txs.reduce((acc, t) => upsert(acc, t, (a, b) => a.id === b.id), d.transactions),
    }));
  }
  async deleteTransaction(id: string) {
    this.update((d) => ({ ...d, transactions: d.transactions.filter((t) => t.id !== id) }));
  }
  async listRules() {
    return readLocal().rules;
  }
  async saveRule(rule: Rule) {
    this.update((d) => ({ ...d, rules: upsert(d.rules, rule, (a, b) => a.id === b.id) }));
  }
  async deleteRule(id: string) {
    this.update((d) => ({ ...d, rules: d.rules.filter((r) => r.id !== id) }));
  }
  async listChannelSales(month: Month) {
    return readLocal().channelSales.filter((s) => s.month === month);
  }
  async saveChannelSales(sales: ChannelSale[]) {
    this.update((d) => ({
      ...d,
      channelSales: sales.reduce(
        (acc, s) => upsert(acc, s, (a, b) => a.month === b.month && a.channel === b.channel),
        d.channelSales,
      ),
    }));
  }
  async getClosing(month: Month) {
    return readLocal().closings.find((c) => c.month === month) ?? null;
  }
  async saveClosing(c: MonthClosing) {
    this.update((d) => ({ ...d, closings: upsert(d.closings, c, (a, b) => a.month === b.month) }));
  }
  async listUploads() {
    return readLocal().uploads;
  }
  async saveUpload(u: UploadRecord) {
    this.update((d) => ({ ...d, uploads: [...d.uploads, u] }));
  }
  async deleteMonth(month: Month) {
    this.update((d) => ({
      ...d,
      transactions: d.transactions.filter((t) => t.month !== month),
      channelSales: d.channelSales.filter((s) => s.month !== month),
      closings: d.closings.filter((c) => c.month !== month),
      uploads: d.uploads.filter((u) => u.month !== month),
    }));
  }
}
