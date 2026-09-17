"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { pickRepo, type Repo } from "@/lib/repo";
import { DEFAULT_SETTINGS, type AppData, type DayRecord, type Employee, type Settings } from "@/lib/types";

interface Ctx extends AppData {
  loaded: boolean;
  storage: Repo["kind"] | "loading";
  error: string;
  saveEmployee(e: Employee): void;
  deleteEmployee(id: string): void;
  upsertRecord(r: DayRecord): void;
  upsertRecords(rs: DayRecord[]): void;
  removeRecord(id: string): void;
  saveSettings(s: Settings): void;
  reload(): void;
}

const DataCtx = createContext<Ctx | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>({ employees: [], records: [], settings: DEFAULT_SETTINGS });
  const [loaded, setLoaded] = useState(false);
  const [storage, setStorage] = useState<Ctx["storage"]>("loading");
  const [error, setError] = useState("");
  const repoRef = useRef<Repo | null>(null);

  const reload = useCallback(async () => {
    try {
      const repo = repoRef.current ?? (repoRef.current = await pickRepo());
      setStorage(repo.kind);
      setData(await repo.loadAll());
      setLoaded(true);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 다른 매장 기기에서 넣은 기록을 보기 위해, 화면으로 돌아올 때 다시 불러온다 (창고일 때만)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && repoRef.current?.kind === "supabase") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  const run = (job: (repo: Repo) => Promise<void>) => {
    const repo = repoRef.current;
    if (!repo) return;
    job(repo).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  const value: Ctx = {
    ...data,
    loaded,
    storage,
    error,
    reload,
    saveEmployee: (e) => {
      setData((d) => ({ ...d, employees: d.employees.some((x) => x.id === e.id) ? d.employees.map((x) => (x.id === e.id ? e : x)) : [...d.employees, e] }));
      run((r) => r.upsertEmployee(e));
    },
    deleteEmployee: (id) => {
      setData((d) => ({ ...d, employees: d.employees.filter((x) => x.id !== id) }));
      run((r) => r.deleteEmployee(id));
    },
    upsertRecord: (rec) => {
      setData((d) => ({ ...d, records: [...d.records.filter((x) => x.id !== rec.id), rec] }));
      run((r) => r.upsertRecords([rec]));
    },
    upsertRecords: (rs) => {
      const ids = new Set(rs.map((r) => r.id));
      setData((d) => ({ ...d, records: [...d.records.filter((x) => !ids.has(x.id)), ...rs] }));
      run((r) => r.upsertRecords(rs));
    },
    removeRecord: (id) => {
      setData((d) => ({ ...d, records: d.records.filter((x) => x.id !== id) }));
      run((r) => r.deleteRecord(id));
    },
    saveSettings: (s) => {
      setData((d) => ({ ...d, settings: s }));
      run((r) => r.saveSettings(s));
    },
  };

  return (
    <DataCtx.Provider value={value}>
      {error && (
        <div className="bg-accent-soft px-4 py-2 text-center text-sm font-semibold text-accent">
          {error} <button className="ml-2 underline" onClick={() => void reload()}>다시 시도</button>
        </div>
      )}
      {children}
    </DataCtx.Provider>
  );
}

export function useData(): Ctx {
  const c = useContext(DataCtx);
  if (!c) throw new Error("DataProvider 안에서만 쓸 수 있어요");
  return c;
}
