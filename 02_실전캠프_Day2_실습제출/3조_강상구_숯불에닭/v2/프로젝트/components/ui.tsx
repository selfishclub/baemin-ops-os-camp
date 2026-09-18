"use client";

import type { ReactNode } from "react";
import { MAJORS, MINORS, type Major } from "@/lib/categories";
import { num, parseNum } from "@/lib/format";

// 되돌릴 수 없는 일이나 "맞나요?" 확인에 쓰는 창
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = "다시 볼게요",
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="card w-full max-w-md space-y-3">
        <h2 className="text-base font-bold">{title}</h2>
        <div className="space-y-1 text-sm text-stone-700">{children}</div>
        <div className="flex gap-2 pt-1">
          <button className="btn-ghost flex-1" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={`btn flex-1 text-white ${danger ? "bg-red-600 hover:bg-red-700" : "bg-orange-600 hover:bg-orange-700"}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// 쉼표가 찍히는 금액 입력 칸.
// allowEmpty: 빈 칸(null = 아직 안 넣음)과 0(= 없음)을 구분해야 하는 칸에 쓴다.
export function MoneyInput({
  value,
  onChange,
  label,
  disabled,
  allowEmpty = false,
  placeholder = "0",
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  label: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  placeholder?: string;
}) {
  const text = value === null ? "" : allowEmpty ? num(value) : value ? num(value) : "";
  return (
    <input
      aria-label={label}
      inputMode="numeric"
      className="field num text-right"
      disabled={disabled}
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        const digits = e.target.value.replace(/D/g, "");
        onChange(digits === "" ? (allowEmpty ? null : 0) : parseNum(digits));
      }}
    />
  );
}

export function CategorySelect({
  major,
  minor,
  onChange,
  includeIncome = false,
  idPrefix,
}: {
  major: Major | "";
  minor: string;
  onChange: (major: Major | "", minor: string) => void;
  includeIncome?: boolean;
  idPrefix: string;
}) {
  const majors = MAJORS.filter((m) => includeIncome || m !== "수입");
  return (
    <div className="grid grid-cols-2 gap-2">
      <select
        aria-label={`${idPrefix} 대분류`}
        className="field"
        value={major}
        onChange={(e) => {
          const m = e.target.value as Major | "";
          onChange(m, m ? MINORS[m][0] : "");
        }}
      >
        <option value="">대분류 고르기</option>
        {majors.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select aria-label={`${idPrefix} 소분류`} className="field" value={minor} disabled={!major} onChange={(e) => onChange(major, e.target.value)}>
        {!major && <option value="">소분류</option>}
        {major && MINORS[major].map((m) => <option key={m}>{m}</option>)}
      </select>
    </div>
  );
}

export function Notice({ tone, children }: { tone: "warn" | "error" | "ok" | "info"; children: ReactNode }) {
  const style = {
    warn: "bg-amber-50 text-amber-900 ring-amber-200",
    error: "bg-red-50 text-red-800 ring-red-200",
    ok: "bg-emerald-50 text-emerald-900 ring-emerald-200",
    info: "bg-sky-50 text-sky-900 ring-sky-200",
  }[tone];
  return <div className={`rounded-xl px-3 py-2 text-sm ring-1 ${style}`}>{children}</div>;
}
