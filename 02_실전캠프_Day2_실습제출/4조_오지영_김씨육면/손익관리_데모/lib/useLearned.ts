"use client";

import { useSyncExternalStore } from "react";
import { emptyLearned, loadLearned, saveLearned, type Learned } from "./learned";

/**
 * 학습 결과는 달을 가로지르므로 월 상태에 얹을 수 없다.
 * 한 군데(localStorage)를 보고, 바뀌면 보고 있는 화면이 모두 따라 바뀌게 한다.
 */
let snapshot: Learned | null = null;
const listeners = new Set<() => void>();

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const getSnapshot = (): Learned => (snapshot ??= loadLearned());
const getServerSnapshot = (): Learned => emptyLearned();

/** 어디서 부르든 저장까지 하고 화면을 깨운다 */
export function updateLearned(fn: (l: Learned) => Learned) {
  const next = fn(getSnapshot());
  snapshot = next;
  saveLearned(next);
  listeners.forEach((f) => f());
}

export function useLearned(): Learned {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
