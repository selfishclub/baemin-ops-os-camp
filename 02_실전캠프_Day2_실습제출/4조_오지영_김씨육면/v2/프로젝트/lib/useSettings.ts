"use client";

import { useSyncExternalStore } from "react";
import {
  addAccount,
  addSub,
  applySettings,
  defaultSettings,
  loadSettings,
  saveSettings,
  type Settings,
} from "./settings";
import type { AccountDef, Behavior } from "./accounts";

/**
 * 계정과목을 쓰는 자리에서 바로 만들 수 있어야 한다.
 * 분류하다 없는 계정을 만나 설정 화면까지 다녀오면 흐름이 끊긴다.
 */
let snapshot: Settings | null = null;
const listeners = new Set<() => void>();

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const getSnapshot = (): Settings => (snapshot ??= loadSettings());
const getServerSnapshot = (): Settings => defaultSettings();

function commit(next: Settings) {
  snapshot = next;
  saveSettings(next);
  // 레지스트리에 올려야 드롭다운과 집계가 같은 것을 본다
  applySettings(next);
  listeners.forEach((f) => f());
}

export function useSettingsSnapshot(): Settings {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** 그 자리에서 계정과목 만들기. 설정에 저장되므로 다음 달에도 남는다. */
export function createAccount(name: string, group: AccountDef["group"], behavior: Behavior | null = null) {
  const n = name.trim();
  if (!n) return;
  commit(addAccount(getSnapshot(), n, group, behavior));
}

/** 그 자리에서 소분류 만들기 */
export function createSub(account: string, sub: string) {
  const s = sub.trim();
  if (!s) return;
  commit(addSub(getSnapshot(), account, s));
}

/** 설정 화면이 저장했을 때 이쪽도 같이 갱신한다 */
export function syncSettings(next: Settings) {
  snapshot = next;
  listeners.forEach((f) => f());
}
