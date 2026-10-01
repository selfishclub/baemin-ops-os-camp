// Supabase 데이터 창고 저장소. 표 구조는 supabase/schema.sql
import { createClient } from "@supabase/supabase-js";
import type { Repo } from "./repo";
import { SEED_EMPLOYEES } from "./seed";
import { DEFAULT_SETTINGS, type DayRecord, type Employee, type Settings } from "./types";

type EmpRow = { id: string; alias: string; store: string; role: string; wage: number; pay_cycle: string; plan: Employee["plan"] };
type RecRow = {
  id: string; employee_id: string; date: string; kind: string;
  start: string | null; end: string | null; break_min: number | null;
  decision: string | null; adj_start: string | null; adj_end: string | null; reason: string | null; confirmed: boolean | null;
};

const toEmp = (r: EmpRow): Employee => ({
  id: r.id, alias: r.alias, store: r.store as Employee["store"], role: r.role, wage: r.wage,
  payCycle: r.pay_cycle as Employee["payCycle"], plan: r.plan ?? {},
});
const fromEmp = (e: Employee): EmpRow => ({
  id: e.id, alias: e.alias, store: e.store, role: e.role, wage: e.wage, pay_cycle: e.payCycle, plan: e.plan,
});
const toRec = (r: RecRow): DayRecord => {
  const d: DayRecord = { id: r.id, employeeId: r.employee_id, date: r.date, kind: r.kind as DayRecord["kind"] };
  if (r.start) d.start = r.start;
  if (r.end) d.end = r.end;
  if (r.break_min !== null) d.breakMin = r.break_min;
  if (r.decision) d.decision = r.decision as DayRecord["decision"];
  if (r.adj_start) d.adjStart = r.adj_start;
  if (r.adj_end) d.adjEnd = r.adj_end;
  if (r.reason) d.reason = r.reason;
  if (r.confirmed) d.confirmed = true;
  return d;
};
const fromRec = (d: DayRecord): RecRow => ({
  id: d.id, employee_id: d.employeeId, date: d.date, kind: d.kind,
  start: d.start ?? null, end: d.end ?? null, break_min: d.breakMin ?? null,
  decision: d.decision ?? null, adj_start: d.adjStart ?? null, adj_end: d.adjEnd ?? null,
  reason: d.reason ?? null, confirmed: d.confirmed ?? null,
});

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(`데이터 창고 오류: ${r.error.message}`);
  return r.data as T;
}

export function createSupabaseRepo(url: string, anonKey: string): Repo {
  const sb = createClient(url, anonKey);
  return {
    kind: "supabase",
    async loadAll() {
      const [emps, recs, st] = await Promise.all([
        sb.from("employees").select("*").order("alias"),
        sb.from("day_records").select("*"),
        sb.from("settings").select("*").eq("id", "default").maybeSingle(),
      ]);
      let employees = must<EmpRow[]>(emps).map(toEmp);
      if (employees.length === 0) {
        // 처음 열었을 때 시연용 가상 직원을 넣어 둔다
        must(await sb.from("employees").upsert(SEED_EMPLOYEES.map(fromEmp)));
        employees = SEED_EMPLOYEES;
      }
      const settingsRow = must<{ min_wage: number } | null>(st);
      const settings: Settings = settingsRow ? { minWage: settingsRow.min_wage } : DEFAULT_SETTINGS;
      return { employees, records: must<RecRow[]>(recs).map(toRec), settings };
    },
    async upsertEmployee(e) {
      must(await sb.from("employees").upsert(fromEmp(e)));
    },
    async deleteEmployee(id) {
      must(await sb.from("employees").delete().eq("id", id));
    },
    async upsertRecords(rs) {
      if (rs.length) must(await sb.from("day_records").upsert(rs.map(fromRec)));
    },
    async deleteRecord(id) {
      must(await sb.from("day_records").delete().eq("id", id));
    },
    async saveSettings(s) {
      must(await sb.from("settings").upsert({ id: "default", min_wage: s.minWage }));
    },
  };
}
