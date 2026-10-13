"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { won } from "@/lib/csv";
import { UNCLASSIFIED, accountsOf, getAccount } from "@/lib/accounts";
import { createAccount, createSub, useSettingsSnapshot } from "@/lib/useSettings";

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
const NEW = "__new__";

export function AccountSelect({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  // 설정이 바뀌면 드롭다운도 같이 바뀌어야 한다
  useSettingsSnapshot();
  const [making, setMaking] = useState(false);
  const [name, setName] = useState("");

  if (making) {
    const done = () => {
      const n = name.trim();
      if (n) {
        // 없는 계정은 사업 지출로 만든다 — 개인은 이미 하나로 있다
        createAccount(n, "expense", null);
        onChange(n);
      }
      setName("");
      setMaking(false);
    };
    return (
      <span className="editing">
        <input
          autoFocus
          value={name}
          placeholder="새 계정과목"
          aria-label="새 계정과목 이름"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") done();
            if (e.key === "Escape") { setName(""); setMaking(false); }
          }}
        />
        <button className="tool save" onClick={done}>만들기</button>
        <button className="tool" onClick={() => { setName(""); setMaking(false); }}>취소</button>
      </span>
    );
  }

  return (
    <select
      className={`inp ${className}`}
      value={value}
      onChange={(e) => (e.target.value === NEW ? setMaking(true) : onChange(e.target.value))}
    >
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
      <option value={NEW}>+ 새 계정과목 만들기</option>
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
  useSettingsSnapshot();
  const [making, setMaking] = useState(false);
  const [name, setName] = useState("");
  const master = getAccount(account)?.subs ?? [];
  const v = value ?? "";
  // 지금 들어 있는 값은 목록에 없어도 반드시 넣는다.
  // 빼면 저장된 값은 그대로인데 화면에는 '— 소분류 —'로 보여 지워진 줄 안다.
  const subs = [...new Set([...master, ...extra, ...(v ? [v] : [])])];

  if (making) {
    const done = () => {
      const n = name.trim();
      if (n) {
        createSub(account, n);
        onChange(n);
      }
      setName("");
      setMaking(false);
    };
    return (
      <span className="editing">
        <input
          autoFocus
          value={name}
          placeholder="새 소분류"
          aria-label="새 소분류 이름"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") done();
            if (e.key === "Escape") { setName(""); setMaking(false); }
          }}
        />
        <button className="tool save" onClick={done}>만들기</button>
        <button className="tool" onClick={() => { setName(""); setMaking(false); }}>취소</button>
      </span>
    );
  }

  return (
    <select
      className={`inp ${className}`}
      value={subs.includes(v) ? v : ""}
      onChange={(e) => (e.target.value === NEW ? setMaking(true) : onChange(e.target.value || null))}
    >
      <option value="">{subs.length ? "— 소분류 —" : "소분류 없음"}</option>
      {subs.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
      {account !== UNCLASSIFIED && <option value={NEW}>+ 새 소분류 만들기</option>}
    </select>
  );
}

/** 전월 대비 증감 알약. 오르면 딥그린, 내리면 벽돌 — 레퍼런스의 delta pill */
export function Delta({
  value,
  unit = "%",
  goodWhenUp = true,
}: {
  /** 이미 퍼센트로 환산된 값 (0.142 → 14.2 로 넘길 것) */
  value: number | null;
  unit?: "%" | "%p";
  goodWhenUp?: boolean;
}) {
  if (value === null || !Number.isFinite(value)) {
    return <span className="delta flat">—</span>;
  }
  if (Math.abs(value) < 0.05) return <span className="delta flat">변화 없음</span>;
  const up = value > 0;
  const good = up === goodWhenUp;
  return (
    <span className={`delta${good ? "" : " down"}`}>
      {up ? "▲" : "▼"} {up ? "+" : "−"}
      {Math.abs(value).toFixed(1)}
      {unit}
    </span>
  );
}

/** 원형 진행 링 — 분류 확정률에 쓴다 */
export function Gauge({ ratio, center, note }: { ratio: number; center: string; note: string }) {
  const r = 48;
  const c = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(1, ratio)) * c;
  return (
    <div className="gauge">
      <svg viewBox="0 0 120 120" width="112" height="112" role="img" aria-label={note}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--line)" strokeWidth="11" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`}
          transform="rotate(-90 60 60)"
        />
        <text
          x="60"
          y="67"
          textAnchor="middle"
          fontFamily="var(--mono)"
          fontSize="23"
          fontWeight="600"
          fill="var(--ink)"
        >
          {center}
        </text>
      </svg>
      <div className="eyebrow" style={{ letterSpacing: ".06em" }}>{note}</div>
    </div>
  );
}

/**
 * 묶음 전체 선택 체크박스.
 *
 * 버튼으로 "뒤집기"를 하면 이미 골라 둔 것이 함께 풀린다.
 * 전부 고르기 / 전부 풀기로 뜻을 분명히 하고, 일부만 골라졌을 때는 중간 표시를 낸다.
 */
export function PickAll({
  ids,
  picked,
  setPick,
  label = "전체 선택",
}: {
  ids: string[];
  picked: Set<string>;
  setPick: (ids: string[], on: boolean) => void;
  label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const on = ids.length > 0 && ids.every((id) => picked.has(id));
  const some = !on && ids.some((id) => picked.has(id));

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some;
  }, [some]);

  return (
    <label className="pickall" title={on ? "전부 풀기" : "전부 고르기"}>
      <input
        ref={ref}
        type="checkbox"
        className="pickbox"
        checked={on}
        disabled={!ids.length}
        onChange={() => setPick(ids, !on)}
      />
      <span>{label}{ids.length ? ` ${ids.length}건` : ""}</span>
    </label>
  );
}
