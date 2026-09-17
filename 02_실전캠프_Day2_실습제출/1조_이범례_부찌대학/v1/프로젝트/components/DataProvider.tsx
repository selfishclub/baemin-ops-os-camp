"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { localRepo, type Repo } from "@/lib/repo";
import { DEFAULT_SETTINGS, type AppData, type DayRecord, type Employee, type Settings } from "@/lib/types";

interface Ctx extends AppData {
  loaded: boolean;
  saveEmployee(e: Employee): void;
  deleteEmployee(id: string): void;
  upsertRecord(r: DayRecord): void;
  upsertRecords(rs: DayRecord[]): void;
  removeRecord(id: string): void;
  saveSettings(s: Settings): void;
}

const DataCtx = createContext<Ctx | null>(null);
const repo: Repo = localRepo;

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>({ employees: [], records: [], settings: DEFAULT_SETTINGS });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    repo.loadAll().then((d) => {
      setData(d);
      setLoaded(true);
    });
  }, []);

  const setEmployees = useCallback((fn: (l: Employee[]) => Employee[]) => {
    setData((d) => {
      const employees = fn(d.employees);
      void repo.saveEmployees(employees);
      return { ...d, employees };
    });
  }, []);

  const setRecords = useCallback((fn: (l: DayRecord[]) => DayRecord[]) => {
    setData((d) => {
      const records = fn(d.records);
      void repo.saveRecords(records);
      return { ...d, records };
    });
  }, []);

  const value: Ctx = {
    ...data,
    loaded,
    saveEmployee: (e) => setEmployees((l) => (l.some((x) => x.id === e.id) ? l.map((x) => (x.id === e.id ? e : x)) : [...l, e])),
    deleteEmployee: (id) => setEmployees((l) => l.filter((x) => x.id !== id)),
    upsertRecord: (r) => setRecords((l) => [...l.filter((x) => x.id !== r.id), r]),
    upsertRecords: (rs) => setRecords((l) => {
      const ids = new Set(rs.map((r) => r.id));
      return [...l.filter((x) => !ids.has(x.id)), ...rs];
    }),
    removeRecord: (id) => setRecords((l) => l.filter((x) => x.id !== id)),
    saveSettings: (s) => {
      void repo.saveSettings(s);
      setData((d) => ({ ...d, settings: s }));
    },
  };

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData(): Ctx {
  const c = useContext(DataCtx);
  if (!c) throw new Error("DataProvider 안에서만 쓸 수 있어요");
  return c;
}
