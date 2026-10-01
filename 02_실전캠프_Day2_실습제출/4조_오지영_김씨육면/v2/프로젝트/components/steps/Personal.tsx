"use client";

import { useMemo, useState } from "react";
import { PERSONAL, getAccount } from "@/lib/accounts";
import { won } from "@/lib/csv";
import { applyAccount, patchTx, removeTx, type MonthState } from "@/lib/store";
import type { Transaction } from "@/lib/types";
import { AccountSelect, PickAll, SubSelect } from "../ui";
import { contentOf } from "@/lib/alias";
import { isConfirmed } from "@/lib/confirm";
import { isInstallment, lastMonthOf, perMonthOf } from "@/lib/installment";
import { aliasesOf } from "@/lib/learned";
import { useLearned } from "@/lib/useLearned";

type Update = (fn: (s: MonthState) => MonthState) => void;

/**
 * 개인으로 빼 둔 지출을 모아 소분류를 정하는 자리.
 *
 * 지출을 훑을 때는 "이건 가게 돈이 아니다"만 가리는 게 빠르다.
 * 무슨 개인 지출인지는 여기 모아 놓고 한꺼번에 정한다. 손익에는 어차피 안 들어간다.
 */
export function PersonalStep({ state, update }: { state: MonthState; update: Update }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sub, setSub] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      state.transactions
        .filter((t) => t.group === "personal")
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.amount - a.amount),
    [state.transactions]
  );

  const total = rows.reduce((a, b) => a + b.amount, 0);
  const usedSubs = useMemo(
    () => [...new Set(rows.map((t) => t.sub).filter((x): x is string => !!x))].sort(),
    [rows]
  );
  const 미정 = rows.filter((t) => !t.sub);
  const subs = getAccount(PERSONAL)?.subs ?? [];

  if (!rows.length) {
    return (
      <p className="note-line">
        개인으로 뺀 지출이 아직 없습니다. 2단계에서 계정을 <b>개인</b>으로 바꾸면 여기로 모입니다.
      </p>
    );
  }

  const toggle = (ids: string[]) =>
    setPicked((p) => {
      const n = new Set(p);
      for (const id of ids) {
        if (n.has(id)) n.delete(id);
        else n.add(id);
      }
      return n;
    });

  /** 전부 고르기 / 전부 풀기 */
  const setPick = (ids: string[], on: boolean) =>
    setPicked((p) => {
      const n = new Set(p);
      for (const id of ids) {
        if (on) n.add(id);
        else n.delete(id);
      }
      return n;
    });

  function applySub() {
    const ids = picked;
    update((s) => ({
      ...s,
      transactions: s.transactions.map((t) => (ids.has(t.id) ? applyAccount(t, PERSONAL, sub) : t)),
    }));
    setPicked(new Set());
  }

  return (
    <div>
      <div className="dayhead">
        <div className="daystat">
          <span className="k">개인 지출</span>
          <b className="num">{won(total)}</b>
          <span className="c">{rows.length}건 · 손익에서 빠집니다</span>
        </div>
        {미정.length > 0 && (
          <div className="daystat warn">
            <span className="k">소분류 미정</span>
            <b className="num">{won(미정.reduce((a, b) => a + b.amount, 0))}</b>
            <span className="c">{미정.length}건</span>
          </div>
        )}
      </div>

      <div className="toolbar">
        <PickAll ids={rows.map((t) => t.id)} picked={picked} setPick={setPick} label="전체 선택" />
        {미정.length > 0 && (
          <PickAll ids={미정.map((t) => t.id)} picked={picked} setPick={setPick} label="소분류 미정만" />
        )}
      </div>

      {picked.size > 0 && (
        <div className="okbox pickbar">
          <b style={{ whiteSpace: "nowrap" }}>
            {picked.size}건 · {won(rows.filter((t) => picked.has(t.id)).reduce((a, b) => a + b.amount, 0))}
          </b>
          <SubSelect account={PERSONAL} value={sub} onChange={setSub} />
          <button className="tool save" onClick={applySub} disabled={!sub}>
            {picked.size}건에 소분류 넣기
          </button>
          <button className="tool" onClick={() => setPicked(new Set())}>선택 해제</button>
        </div>
      )}

      <p className="note-line" style={{ marginBottom: 8 }}>
        대분류를 <b>개인</b>이 아닌 것으로 바꾸면 이 목록에서 빠져 <b>2. 지출 분류</b>로 돌아갑니다.
        잘못 넣은 건 여기서 바로 빼시면 됩니다.
      </p>

      <div className="txwrap">
        <div className="txline txhead" aria-hidden>
          <span />
          <span />
          <span>날짜</span>
          <span>대분류</span>
          <span>소분류</span>
          <span>내역</span>
          <span>메모</span>
          <span className="amt">금액</span>
          <span />
        </div>
        {rows.map((t) => (
          <PersonalRow key={t.id} t={t} update={update} picked={picked} toggle={toggle} usedSubs={usedSubs} />
        ))}
      </div>
    </div>
  );
}

function PersonalRow({
  t,
  update,
  picked,
  toggle,
  usedSubs,
}: {
  t: Transaction;
  update: Update;
  picked: Set<string>;
  toggle: (ids: string[]) => void;
  usedSubs: string[];
}) {
  const { text, via } = contentOf(t, aliasesOf(useLearned()));
  const confirmed = isConfirmed(t);
  return (
    <div className={`txline personal ${confirmed ? "done" : "sug"}${picked.has(t.id) ? " on" : ""}`}>
      <input
        type="checkbox"
        className="pickbox"
        checked={picked.has(t.id)}
        onChange={() => toggle([t.id])}
        aria-label={`${t.merchant} 선택`}
      />
      <span className="mark">{confirmed ? "✓" : "·"}</span>
      <span className="dt num">{(t.date ?? "").slice(5) || "—"}</span>
      <AccountSelect
        className="mini"
        value={t.account}
        onChange={(v) => update((s) => moveOut(s, t.id, v))}
      />
      <SubSelect
        className="mini"
        account={t.account}
        value={t.sub}
        extra={usedSubs}
        onChange={(v) => update((s) => patchTx(s, t.id, { sub: v }))}
      />
      <span className="mn" title={`원문: ${t.merchant}`}>
        {text}
        {via && <span className="badge small">{via}</span>}
        {isInstallment(t) && (
          <span className="badge inst" title={`${t.date ?? ""} 승인 · ${lastMonthOf(t)}까지`}>
            할부 {t.split!.total}개월 · 월 {won(perMonthOf(t))}
          </span>
        )}
      </span>
      <input
        className="memocell"
        defaultValue={t.note ?? ""}
        placeholder="메모"
        aria-label={`${text} 메모`}
        onBlur={(e) => update((s) => patchTx(s, t.id, { note: e.target.value || null }))}
      />
      <span className="amt num">{won(t.amount)}</span>
      <span>
        <button className="tool" onClick={() => update((s) => removeTx(s, t.id))}>삭제</button>
      </span>
    </div>
  );
}

/** 개인에서 다른 계정으로 옮긴다. 소분류는 계정이 바뀌면 뜻이 달라지므로 비운다. */
function moveOut(s: MonthState, id: string, account: string): MonthState {
  return {
    ...s,
    transactions: s.transactions.map((t) =>
      t.id === id
        ? account === PERSONAL
          ? applyAccount(t, account, t.sub, { confirm: false })
          : applyAccount(t, account, null, { confirm: false })
        : t
    ),
  };
}
