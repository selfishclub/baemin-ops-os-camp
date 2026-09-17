// 저장소. 열쇠(.env.local)가 있으면 Supabase 데이터 창고, 없으면 브라우저 임시 저장.
import { DEFAULT_SETTINGS, type AppData, type DayRecord, type Employee, type Settings } from "./types";
import { SEED_EMPLOYEES } from "./seed";

export interface Repo {
  readonly kind: "local" | "supabase";
  loadAll(): Promise<AppData>;
  upsertEmployee(e: Employee): Promise<void>;
  deleteEmployee(id: string): Promise<void>;
  upsertRecords(rs: DayRecord[]): Promise<void>;
  deleteRecord(id: string): Promise<void>;
  saveSettings(s: Settings): Promise<void>;
}

// ---------- 브라우저 임시 저장 ----------
const KEY = "payroll-onetouch-v1";

function read(): Partial<AppData> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<AppData>) : {};
  } catch {
    return {};
  }
}

function write(patch: Partial<AppData>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch }));
  } catch {
    /* 사생활 보호 모드 등에서는 저장이 안 될 수 있음 */
  }
}

export const localRepo: Repo = {
  kind: "local",
  async loadAll() {
    const d = read();
    const employees = d.employees ?? SEED_EMPLOYEES;
    if (!d.employees) write({ employees });
    return { employees, records: d.records ?? [], settings: d.settings ?? DEFAULT_SETTINGS };
  },
  async upsertEmployee(e) {
    const list = read().employees ?? [];
    write({ employees: list.some((x) => x.id === e.id) ? list.map((x) => (x.id === e.id ? e : x)) : [...list, e] });
  },
  async deleteEmployee(id) {
    write({ employees: (read().employees ?? []).filter((x) => x.id !== id) });
  },
  async upsertRecords(rs) {
    const ids = new Set(rs.map((r) => r.id));
    write({ records: [...(read().records ?? []).filter((x) => !ids.has(x.id)), ...rs] });
  },
  async deleteRecord(id) {
    write({ records: (read().records ?? []).filter((x) => x.id !== id) });
  },
  async saveSettings(s) {
    write({ settings: s });
  },
};

// ---------- 어느 저장소를 쓸지 ----------
export function pickRepo(): Promise<Repo> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) return import("./supabaseRepo").then((m) => m.createSupabaseRepo(url, key));
  return Promise.resolve(localRepo);
}
