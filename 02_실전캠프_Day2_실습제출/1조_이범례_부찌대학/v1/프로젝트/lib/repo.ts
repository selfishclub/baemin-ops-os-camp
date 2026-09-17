// 저장소. 지금은 브라우저 임시 저장(localStorage), 6단계에서 Supabase로 교체한다.
import { DEFAULT_SETTINGS, type AppData, type DayRecord, type Employee, type Settings } from "./types";
import { SEED_EMPLOYEES } from "./seed";

export interface Repo {
  loadAll(): Promise<AppData>;
  saveEmployees(list: Employee[]): Promise<void>;
  saveRecords(list: DayRecord[]): Promise<void>;
  saveSettings(s: Settings): Promise<void>;
}

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
  async loadAll() {
    const d = read();
    const employees = d.employees ?? SEED_EMPLOYEES;
    if (!d.employees) write({ employees });
    return {
      employees,
      records: d.records ?? [],
      settings: d.settings ?? DEFAULT_SETTINGS,
    };
  },
  async saveEmployees(list) {
    write({ employees: list });
  },
  async saveRecords(list) {
    write({ records: list });
  },
  async saveSettings(s) {
    write({ settings: s });
  },
};
