"use client";

import type { ReactNode } from "react";
import { won } from "@/lib/csv";
import { UNCLASSIFIED, accountsOf, getAccount } from "@/lib/accounts";

export const pct = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`;

/** 큰 금액은 만원 단위로 줄여 읽는다 (차트 라벨용) */
export function shortWon(n: number): string {
  const a = Math.abs(n);
  if (a >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (a >= 10_000) return `${Math.round(n / 10_000).toLocaleString("ko-KR")}만`;
  return won(n);
}

export function Money({ v, className = "" }: { v: number; className?: string }) {
  return <span className={`num ${className}`}>{won(Math.round(v))}</span>;
}

export function Btn({
  children,
  onClick,
  tone,
  disabled,
  type = "button",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "primary" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
}) {
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`btn${tone ? ` ${tone}` : ""}`}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Panel({
  title,
  sub,
  right,
  children,
  className = "",
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <article className={`panel ${className}`}>
      <header>
        <div>
          <h3>{title}</h3>
          {sub && <p>{sub}</p>}
        </div>
        {right && <div className="rt">{right}</div>}
      </header>
      {children}
    </article>
  );
}

export function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="ic">{icon}</div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}

/** §1 계정과목 자유입력 금지 — 드롭다운만 */
export function AccountSelect({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <select className={`inp ${className}`} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value={UNCLASSIFIED}>— 미분류 —</option>
      <optgroup label="사업 지출">
        {accountsOf("expense").map((a) => (
          <option key={a.name} value={a.name}>{a.name}</option>
        ))}
      </optgroup>
      <optgroup label="개인 (손익 제외)">
        {accountsOf("personal").map((a) => (
          <option key={a.name} value={a.name}>{a.name}</option>
        ))}
      </optgroup>
      <optgroup label="매출·기타수입">
        {[...accountsOf("revenue"), ...accountsOf("excluded")].map((a) => (
          <option key={a.name} value={a.name}>{a.name}</option>
        ))}
      </optgroup>
    </select>
  );
}

export function SubSelect({
  account,
  value,
  onChange,
  extra = [],
  className = "",
}: {
  account: string;
  value: string | null;
  onChange: (v: string | null) => void;
  /** 이 달 데이터에 실제로 쓰인 소분류 — 마스터에 없어도 고를 수 있게 */
  extra?: string[];
  className?: string;
}) {
  const master = getAccount(account)?.subs ?? [];
  const subs = [...new Set([...master, ...extra])];
  const v = value ?? "";
  return (
    <select
      className={`inp ${className}`}
      value={subs.includes(v) ? v : ""}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{subs.length ? "— 소분류 —" : "소분류 없음"}</option>
      {subs.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}
