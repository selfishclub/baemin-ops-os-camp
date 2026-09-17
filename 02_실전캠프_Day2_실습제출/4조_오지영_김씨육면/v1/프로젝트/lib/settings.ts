"use client";

import {
  DEFAULT_BEHAVIOR,
  EXPENSE_ACCOUNTS,
  PERSONAL_ACCOUNTS,
  REVENUE_ACCOUNTS,
  configureAccounts,
  configureBehavior,
  type AccountDef,
  type Behavior,
  type BehaviorConfig,
} from "./accounts";
import { DEFAULT_FIXED_TEMPLATE, configureFixedTemplate, type FixedTemplateItem } from "./fixedTemplate";

/**
 * 계정과목·고정비 템플릿·고정변동 플래그는 코드에 박지 않고 설정으로 둔다(§4-3, §7).
 * 브라우저에 저장하고, 내보낸 파일을 data/settings.json에 커밋해 기준으로 삼는다.
 */
export interface Settings {
  version: 1;
  updatedAt: string;
  accounts: AccountDef[];
  behavior: BehaviorConfig;
  fixedTemplate: FixedTemplateItem[];
}

const KEY = "kimssi-settings";

export const defaultSettings = (): Settings => ({
  version: 1,
  updatedAt: new Date().toISOString().slice(0, 10),
  accounts: [...REVENUE_ACCOUNTS, ...EXPENSE_ACCOUNTS, ...PERSONAL_ACCOUNTS].map((a) => ({
    ...a,
    subs: [...a.subs],
  })),
  behavior: {
    accounts: { ...DEFAULT_BEHAVIOR.accounts },
    laborSubs: { ...DEFAULT_BEHAVIOR.laborSubs },
  },
  fixedTemplate: DEFAULT_FIXED_TEMPLATE.map((f) => ({ ...f })),
});

/** 레지스트리에 반영한다. 이걸 불러야 드롭다운과 집계가 바뀐다. */
export function applySettings(s: Settings) {
  configureAccounts(s.accounts);
  configureBehavior(s.behavior);
  configureFixedTemplate(s.fixedTemplate);
}

export function loadSettings(): Settings {
  const base = defaultSettings();
  if (typeof window === "undefined") return base;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<Settings>;
    return {
      ...base,
      ...saved,
      accounts: saved.accounts?.length ? saved.accounts : base.accounts,
      behavior: { ...base.behavior, ...(saved.behavior ?? {}) },
      fixedTemplate: saved.fixedTemplate ?? base.fixedTemplate,
    };
  } catch {
    return base;
  }
}

export function saveSettings(s: Settings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...s, updatedAt: new Date().toISOString().slice(0, 10) }));
  } catch {
    /* 저장 실패가 편집을 막지 않는다 */
  }
}

export function resetSettings() {
  if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
  const s = defaultSettings();
  applySettings(s);
  return s;
}

export function downloadSettings(s: Settings) {
  const blob = new Blob([JSON.stringify(s, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "settings.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ── 편집 연산 ─────────────────────────────────────────── */

export function addAccount(s: Settings, name: string, group: AccountDef["group"], behavior: Behavior | null): Settings {
  if (!name.trim() || s.accounts.some((a) => a.name === name.trim())) return s;
  const def: AccountDef = { name: name.trim(), group, behavior, subs: [] };
  return {
    ...s,
    accounts: [...s.accounts, def],
    behavior: behavior
      ? { ...s.behavior, accounts: { ...s.behavior.accounts, [def.name]: behavior } }
      : s.behavior,
  };
}

export function removeAccount(s: Settings, name: string): Settings {
  const rest = { ...s.behavior.accounts };
  delete rest[name];
  return {
    ...s,
    accounts: s.accounts.filter((a) => a.name !== name),
    behavior: { ...s.behavior, accounts: rest },
  };
}

export function renameAccount(s: Settings, from: string, to: string): Settings {
  if (!to.trim() || from === to.trim()) return s;
  const accounts = { ...s.behavior.accounts };
  if (accounts[from] !== undefined) {
    accounts[to.trim()] = accounts[from];
    delete accounts[from];
  }
  return {
    ...s,
    accounts: s.accounts.map((a) => (a.name === from ? { ...a, name: to.trim() } : a)),
    behavior: { ...s.behavior, accounts },
  };
}

export function setAccountBehavior(s: Settings, name: string, b: Behavior | null): Settings {
  const accounts = { ...s.behavior.accounts };
  if (b) accounts[name] = b;
  else delete accounts[name];
  return {
    ...s,
    accounts: s.accounts.map((a) => (a.name === name ? { ...a, behavior: b } : a)),
    behavior: { ...s.behavior, accounts },
  };
}

export function setLaborBehavior(s: Settings, sub: string, b: Behavior): Settings {
  return { ...s, behavior: { ...s.behavior, laborSubs: { ...s.behavior.laborSubs, [sub]: b } } };
}

export function addSub(s: Settings, account: string, sub: string): Settings {
  const v = sub.trim();
  if (!v) return s;
  return {
    ...s,
    accounts: s.accounts.map((a) =>
      a.name === account && !a.subs.includes(v) ? { ...a, subs: [...a.subs, v] } : a
    ),
  };
}

export function removeSub(s: Settings, account: string, sub: string): Settings {
  return {
    ...s,
    accounts: s.accounts.map((a) => (a.name === account ? { ...a, subs: a.subs.filter((x) => x !== sub) } : a)),
  };
}

export function renameSubInSettings(s: Settings, account: string, from: string, to: string): Settings {
  const v = to.trim();
  if (!v) return s;
  return {
    ...s,
    accounts: s.accounts.map((a) =>
      a.name === account ? { ...a, subs: a.subs.map((x) => (x === from ? v : x)) } : a
    ),
  };
}

export function upsertFixed(s: Settings, item: FixedTemplateItem, index?: number): Settings {
  const list = [...s.fixedTemplate];
  if (index === undefined) list.push(item);
  else list[index] = item;
  return { ...s, fixedTemplate: list };
}

export function removeFixed(s: Settings, index: number): Settings {
  return { ...s, fixedTemplate: s.fixedTemplate.filter((_, i) => i !== index) };
}
