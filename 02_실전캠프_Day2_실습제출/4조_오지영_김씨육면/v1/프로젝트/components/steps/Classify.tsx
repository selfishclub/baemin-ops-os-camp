"use client";

import { useMemo, useState } from "react";
import { UNCLASSIFIED } from "@/lib/accounts";
import { classify } from "@/lib/classify";
import { won } from "@/lib/csv";
import { downloadMappings } from "@/lib/mappings";
import {
  applyAccount,
  confirmTx,
  exportableMappings,
  groupIntoSub,
  makeManualTx,
  patchTx,
  removeTx,
  renameSub,
  rulesOf,
  setSubMemo,
  subMemoOf,
  type MonthState,
} from "@/lib/store";
import { buildTree, type AccountNode, type FoldNode, type LeafNode, type SubNode } from "@/lib/tree";
import type { Transaction } from "@/lib/types";
import { AccountSelect, Btn, Field, Money, SubSelect, pct } from "../ui";

type Update = (fn: (s: MonthState) => MonthState) => void;
type Filter = "main" | "all" | "review" | "flagged" | "split";

export function ClassifyStep({
  state,
  update,
  revenueGross,
}: {
  state: MonthState;
  update: Update;
  revenueGross: number;
}) {
  const [filter, setFilter] = useState<Filter>("main");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [reran, setReran] = useState<string | null>(null);

  /** 규칙을 배운 뒤 다시 돌린다. 사람이 확정한 건과 수기 입력은 건드리지 않는다. */
  function reclassify() {
    const rules = rulesOf(state);
    let changed = 0;
    const next = state.transactions.map((t) => {
      if (t.confirmed || t.source === "manual" || t.group === "excluded") return t;
      const c = classify({ merchant: t.merchant, rawAccount: t.rawAccount ?? null, rawSub: t.sub }, rules);
      if (c.account !== t.account || c.sub !== t.sub || c.needsReview !== t.needsReview || c.reviewReason !== t.reviewReason) changed++;
      return {
        ...t,
        account: c.account,
        sub: c.sub,
        group: c.group,
        behavior: c.behavior,
        needsReview: c.needsReview,
        reviewReason: c.reviewReason,
        autoMapped: c.autoMapped,
        normalizedNote: c.normalizedNote,
      };
    });
    setReran(`${changed}건 다시 분류했습니다. 검수 ${next.filter((t) => t.needsReview).length}건 남음.`);
    update((s) => ({ ...s, transactions: next }));
  }

  const variable = state.transactions.filter(
    (t) => t.source !== "ledger-fixed" && t.source !== "fixed-copy" && t.group !== "excluded"
  );
  const review = variable.filter((t) => t.needsReview);
  const flagged = variable.filter((t) => t.flagged);
  const splits = variable.filter((t) => t.split);

  const shown = useMemo(() => {
    if (filter === "review") return review;
    if (filter === "flagged") return flagged;
    if (filter === "split") return splits;
    return variable;
  }, [filter, variable, review, flagged, splits]);

  const foldBelow = filter === "main" ? 30_000 : 0;
  const biz = useMemo(
    () => buildTree(shown.filter((t) => t.group !== "personal"), revenueGross, { foldBelow }),
    [shown, revenueGross, foldBelow]
  );
  const personal = useMemo(
    () => buildTree(shown.filter((t) => t.group === "personal"), revenueGross, { foldBelow }),
    [shown, revenueGross, foldBelow]
  );

  const bizTotal = biz.reduce((a, b) => a + b.amount, 0);
  const bizCount = biz.reduce((a, b) => a + b.count, 0);
  const perTotal = personal.reduce((a, b) => a + b.amount, 0);
  const perCount = personal.reduce((a, b) => a + b.count, 0);

  const allSubs = useMemo(
    () => [...new Set(state.transactions.map((t) => t.sub).filter(Boolean) as string[])],
    [state.transactions]
  );

  function toggle(ids: string[]) {
    setPicked((p) => {
      const next = new Set(p);
      const allIn = ids.every((i) => next.has(i));
      for (const i of ids) allIn ? next.delete(i) : next.add(i);
      return next;
    });
  }

  if (!variable.length) {
    return (
      <p className="note-line">
        아직 변동지출이 없습니다. <b>1. 불러오기</b>에서 카드 파일을 올리면 여기에 분류 결과가 나옵니다.
      </p>
    );
  }

  return (
    <div>
      {review.length > 0 && <ReviewBanner rows={review} update={update} />}

      <div className="toolbar">
        <Chip on={filter === "main"} onClick={() => setFilter("main")}>
          3만원 이상 {variable.filter((t) => Math.abs(t.amount) >= 30_000).length}건
        </Chip>
        <Chip on={filter === "all"} onClick={() => setFilter("all")}>
          전체 {variable.length}건
        </Chip>
        {review.length > 0 && (
          <Chip on={filter === "review"} alert onClick={() => setFilter("review")}>
            검수 {review.length}
          </Chip>
        )}
        {flagged.length > 0 && (
          <Chip on={filter === "flagged"} alert onClick={() => setFilter("flagged")}>
            확인 표시 {flagged.length}
          </Chip>
        )}
        {splits.length > 0 && (
          <Chip on={filter === "split"} onClick={() => setFilter("split")}>
            분할 {splits.length}
          </Chip>
        )}
        <span className="sp">
          <button className="ghost" onClick={() => setAdding((v) => !v)}>
            {adding ? "닫기" : "+ 행 추가"}
          </button>
          <button className="ghost" onClick={reclassify} title="배운 규칙으로 다시 돌립니다">
            다시 분류
          </button>
          <button className="ghost" onClick={() => downloadMappings(exportableMappings(state))}>
            규칙 내보내기
          </button>
        </span>
      </div>

      {reran && <div className="okbox">{reran}</div>}

      {adding && <AddRow state={state} update={update} allSubs={allSubs} onDone={() => setAdding(false)} />}

      {picked.size > 0 && (
        <GroupBar state={state} update={update} picked={picked} clear={() => setPicked(new Set())} allSubs={allSubs} />
      )}

      <Section
        title="사업 지출"
        count={bizCount}
        total={bizTotal}
        nodes={biz}
        state={state}
        update={update}
        picked={picked}
        toggle={toggle}
        allSubs={allSubs}
      />
      {personal.length > 0 && (
        <Section
          title="개인 · 손익 제외"
          count={perCount}
          total={perTotal}
          nodes={personal}
          state={state}
          update={update}
          picked={picked}
          toggle={toggle}
          allSubs={allSubs}
        />
      )}

      {filter === "main" && (
        <p className="note-line" style={{ marginTop: 14 }}>
          금액 기준으로 3만원 미만을 접었습니다. 건수로 접으면 1건짜리 큰 지출이 숨기 때문입니다.
          <b>접힌 줄을 눌러 펼치면 그대로 분류할 수 있습니다.</b> 거래처를 눌러 열면 건별 날짜·금액도 보입니다.
        </p>
      )}
    </div>
  );
}

function Chip({
  children,
  on,
  alert,
  onClick,
}: {
  children: React.ReactNode;
  on: boolean;
  alert?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`chip${alert && !on ? " alert" : ""}`} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}

/* ── 검수 배너 ─────────────────────────────────────────── */

function ReviewBanner({ rows, update }: { rows: Transaction[]; update: Update }) {
  const split = rows.filter((t) => t.reviewReason?.includes("매장/집"));
  const others = rows.filter((t) => !t.reviewReason?.includes("매장/집"));

  const set = (id: string, account: string, sub: string | null) =>
    update((s) => ({
      ...s,
      transactions: s.transactions.map((x) => (x.id === id ? applyAccount(x, account, sub) : x)),
    }));

  const keep = (id: string) =>
    update((s) => ({ ...s, transactions: s.transactions.map((x) => (x.id === id ? confirmTx(x) : x)) }));

  if (!split.length && !others.length) return null;

  return (
    <div className="banner">
      <h4>검수 필요 {rows.length}건</h4>
      {split.length > 0 && (
        <>
          <p>
            같은 가맹점에서 매장용과 집용이 같이 나오는 곳입니다. 적혀 있는 계정이 맞으면 [현재 유지]를 누르세요.
          </p>
          {split.slice(0, 10).map((t) => (
            <div className="rev" key={t.id}>
              <span className="nm">{t.merchant}</span>
              <span className="num">{won(t.amount)}</span>
              <span className="cur">
                현재 {t.account}
                {t.sub && t.sub !== t.account ? `/${t.sub}` : ""}
              </span>
              <button onClick={() => set(t.id, "매장운영비", "소모품")}>매장</button>
              <button onClick={() => set(t.id, "우리집", "우리집")}>집</button>
              <button onClick={() => keep(t.id)}>현재 유지</button>
            </div>
          ))}
          {split.length > 10 && <p style={{ margin: "9px 0 0" }}>외 {split.length - 10}건</p>}
        </>
      )}
      {others.length > 0 && (
        <p style={{ margin: split.length ? "14px 0 0" : 0 }}>
          신규 거래처 <b>{others.length}건</b>은 아래 <b>미분류</b>에 모여 있습니다. 거래처를 골라 한 번에 계정을 지정하세요.
        </p>
      )}
    </div>
  );
}

/* ── 선택 묶기 ─────────────────────────────────────────── */

function GroupBar({
  state,
  update,
  picked,
  clear,
  allSubs,
}: {
  state: MonthState;
  update: Update;
  picked: Set<string>;
  clear: () => void;
  allSubs: string[];
}) {
  const rows = state.transactions.filter((t) => picked.has(t.id));
  const first = rows[0];
  const [account, setAccount] = useState(
    first && first.account !== UNCLASSIFIED ? first.account : "식자재비"
  );
  const [sub, setSub] = useState<string | null>(first?.sub ?? null);
  const [newSub, setNewSub] = useState("");
  const [learn, setLearn] = useState(true);
  const total = rows.reduce((a, b) => a + b.amount, 0);

  function apply() {
    const finalSub = newSub.trim() || sub;
    update((s) => {
      const keywords = [
        ...new Set(s.transactions.filter((t) => picked.has(t.id)).map((t) => t.merchant.trim())),
      ];
      const learned = learn
        ? [
            ...keywords
              .filter((k) => k && !s.learned.some((r) => r.keyword === k))
              .map((k) => ({ keyword: k, account, sub: finalSub ?? undefined, origin: "learned" as const })),
            ...s.learned,
          ]
        : s.learned;
      return {
        ...s,
        learned,
        transactions: s.transactions.map((t) =>
          picked.has(t.id) ? applyAccount(t, account, finalSub) : t
        ),
      };
    });
    clear();
  }

  return (
    <div className="okbox" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
      <b style={{ whiteSpace: "nowrap" }}>
        {rows.length}건 · {won(total)}
      </b>
      <AccountSelect value={account} onChange={(v) => { setAccount(v); setSub(null); }} />
      <SubSelect account={account} value={sub} onChange={setSub} extra={allSubs} />
      <input
        className="inp"
        style={{ width: 140 }}
        placeholder="또는 새 소분류"
        value={newSub}
        onChange={(e) => setNewSub(e.target.value)}
      />
      <label style={{ fontSize: 11.5, fontWeight: 700, display: "flex", gap: 5, alignItems: "center" }}>
        <input type="checkbox" className="pickbox" checked={learn} onChange={(e) => setLearn(e.target.checked)} />
        거래처 기억
      </label>
      <Btn tone="primary" onClick={apply}>적용</Btn>
      <Btn onClick={clear}>선택 해제</Btn>
    </div>
  );
}

/* ── 행 추가 ───────────────────────────────────────────── */

function AddRow({
  state,
  update,
  allSubs,
  onDone,
}: {
  state: MonthState;
  update: Update;
  allSubs: string[];
  onDone: () => void;
}) {
  const [account, setAccount] = useState("식자재비");
  const [sub, setSub] = useState<string | null>(null);
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const ok = merchant.trim() !== "" && Number(amount) !== 0 && !Number.isNaN(Number(amount));

  return (
    <div className="okbox" style={{ display: "flex", flexWrap: "wrap", gap: 11, alignItems: "flex-end" }}>
      <Field label="날짜 (선택)">
        <input type="date" className="inp" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="계정">
        <AccountSelect value={account} onChange={(v) => { setAccount(v); setSub(null); }} />
      </Field>
      <Field label="소분류">
        <SubSelect account={account} value={sub} onChange={setSub} extra={allSubs} />
      </Field>
      <Field label="내용">
        <input className="inp" style={{ width: 170 }} value={merchant} placeholder="예: 7월 급여 (직원)" onChange={(e) => setMerchant(e.target.value)} />
      </Field>
      <Field label="금액">
        <input type="number" className="inp rt" style={{ width: 128 }} value={amount} placeholder="0" onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Btn
        tone="primary"
        disabled={!ok}
        onClick={() => {
          update((s) => ({
            ...s,
            transactions: [
              ...s.transactions,
              makeManualTx({
                month: s.month,
                date: date || null,
                account,
                sub,
                merchant: merchant.trim(),
                amount: Number(amount),
              }),
            ],
          }));
          setMerchant("");
          setAmount("");
          onDone();
        }}
      >
        추가
      </Btn>
      <span className="note-line">환불·취소는 마이너스로 넣으면 해당 계정에서 차감됩니다.</span>
    </div>
  );
}

/* ── 트리 ──────────────────────────────────────────────── */

function Section({
  title,
  count,
  total,
  nodes,
  state,
  update,
  picked,
  toggle,
  allSubs,
}: {
  title: string;
  count: number;
  total: number;
  nodes: AccountNode[];
  state: MonthState;
  update: Update;
  picked: Set<string>;
  toggle: (ids: string[]) => void;
  allSubs: string[];
}) {
  if (!nodes.length) return null;
  return (
    <>
      <div className="sectlab">
        <h3 style={{ fontSize: 13 }}>{title}</h3>
        <span style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 700 }}>
          {count}건 · {won(total)}
        </span>
      </div>
      <div className="tree">
        {nodes.map((a) => (
          <AccountRow
            key={a.account}
            node={a}
            state={state}
            update={update}
            picked={picked}
            toggle={toggle}
            allSubs={allSubs}
          />
        ))}
      </div>
    </>
  );
}

function AccountRow({
  node,
  state,
  update,
  picked,
  toggle,
  allSubs,
}: {
  node: AccountNode;
  state: MonthState;
  update: Update;
  picked: Set<string>;
  toggle: (ids: string[]) => void;
  allSubs: string[];
}) {
  return (
    <details className="node" open={node.account === UNCLASSIFIED}>
      <summary>
        <div className="row lv1">
          <span className="nm">
            <span className="chev">▸</span>
            {node.account}
            {node.splitCount > 0 && <span className="badge inst">분할 {node.splitCount}</span>}
            {node.flaggedCount > 0 && <span className="badge flagq">확인 {node.flaggedCount}</span>}
          </span>
          <span className="amt num">{won(node.amount)}</span>
          <span className="cnt">{node.count}건</span>
          <span className="pc">{node.ratio ? pct(node.ratio) : ""}</span>
        </div>
      </summary>
      {node.children.map((c) =>
        c.kind === "fold" ? (
          <FoldRow
            key={c.label}
            node={c}
            level={2}
            account={node.account}
            state={state}
            update={update}
            picked={picked}
            toggle={toggle}
            allSubs={allSubs}
          />
        ) : (
          <SubRow
            key={c.sub}
            account={node.account}
            node={c}
            state={state}
            update={update}
            picked={picked}
            toggle={toggle}
            allSubs={allSubs}
          />
        )
      )}
    </details>
  );
}

function SubRow({
  account,
  node,
  state,
  update,
  picked,
  toggle,
  allSubs,
}: {
  account: string;
  node: SubNode;
  state: MonthState;
  update: Update;
  picked: Set<string>;
  toggle: (ids: string[]) => void;
  allSubs: string[];
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(node.sub);
  const [memoOpen, setMemoOpen] = useState(false);
  const memo = subMemoOf(state, account, node.sub);

  return (
    <details className="node" style={{ borderBottom: 0 }}>
      <summary>
        <div className="row lv2">
          <span className="nm">
            <span className="chev">▸</span>
            {renaming ? (
              <span className="editing" onClick={(e) => e.preventDefault()}>
                <input value={name} onChange={(e) => setName(e.target.value)} aria-label="소분류 이름" />
                <button
                  className="tool save"
                  onClick={() => {
                    if (name.trim() && name.trim() !== node.sub) {
                      update((s) => renameSub(s, account, node.sub, name.trim()));
                    }
                    setRenaming(false);
                  }}
                >
                  저장
                </button>
                <button className="tool" onClick={() => { setName(node.sub); setRenaming(false); }}>취소</button>
              </span>
            ) : (
              <>
                {node.sub}
                {node.splitCount > 0 && <span className="badge inst">분할 {node.splitCount}</span>}
                <span className="compose">{node.compose}</span>
              </>
            )}
          </span>
          <span className="amt num">{won(node.amount)}</span>
          <span className="cnt">{node.count}건</span>
          <span className="pc">
            <button className="tool" onClick={(e) => { e.preventDefault(); setRenaming(true); }}>이름</button>
          </span>
        </div>
      </summary>

      {(memo || memoOpen) && (
        <div className="memo m2">
          <span className="mi">메모</span>
          <input
            defaultValue={memo}
            placeholder="예: 또와=가게 앞, 홈마트=대량 구매용"
            aria-label="소분류 메모"
            onBlur={(e) => update((s) => setSubMemo(s, account, node.sub, e.target.value))}
          />
        </div>
      )}
      {!memo && !memoOpen && (
        <div style={{ paddingLeft: 44, paddingBottom: 6 }}>
          <button className="tool" onClick={() => setMemoOpen(true)}>+ 메모</button>
        </div>
      )}

      {node.children.map((c) =>
        c.kind === "fold" ? (
          <FoldRow
            key={c.label}
            node={c}
            level={3}
            account={account}
            state={state}
            update={update}
            picked={picked}
            toggle={toggle}
            allSubs={allSubs}
          />
        ) : (
          <LeafRow key={c.key} node={c} update={update} picked={picked} toggle={toggle} />
        )
      )}
    </details>
  );
}

function LeafRow({
  node,
  update,
  picked,
  toggle,
}: {
  node: LeafNode;
  update: Update;
  picked: Set<string>;
  toggle: (ids: string[]) => void;
}) {
  const ids = node.txs.map((t) => t.id);
  const on = ids.every((i) => picked.has(i));
  const single = node.txs.length === 1 ? node.txs[0] : null;

  const head = (
    <div className="row lv3" style={on ? { background: "var(--primary-soft)", borderRadius: ".9rem" } : undefined}>
      <span className="nm">
        {!single && <span className="chev">▸</span>}
        <input
          type="checkbox"
          className="pickbox"
          checked={on}
          onChange={() => toggle(ids)}
          onClick={(e) => e.stopPropagation()}
        />
        {node.key}
        {node.splitLabel && <span className="badge inst">{node.splitLabel}</span>}
        {node.flagged && <span className="badge flagq">확인</span>}
      </span>
      <span className="amt num">{won(node.amount)}</span>
      <span className="cnt">{node.count}건</span>
      <span className="pc">
        {single && (
          <button
            className="tool"
            onClick={(e) => {
              e.preventDefault();
              update((s) => removeTx(s, single.id));
            }}
          >
            삭제
          </button>
        )}
      </span>
    </div>
  );

  // 1건이면 그대로, 여러 건이면 펼쳐서 건별로 볼 수 있어야 한다
  if (single) {
    return (
      <>
        {head}
        <div className="memo m3">
          <span className="mi">메모</span>
          <input
            defaultValue={single.note ?? ""}
            placeholder="이 건에 남길 말"
            aria-label="건 메모"
            onBlur={(e) => update((s) => patchTx(s, single.id, { note: e.target.value || null }))}
          />
        </div>
      </>
    );
  }

  return (
    <details className="node" style={{ borderBottom: 0 }}>
      <summary>{head}</summary>
      {node.txs
        .slice()
        .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || b.amount - a.amount)
        .map((t) => (
          <TxRow key={t.id} tx={t} update={update} picked={picked} toggle={toggle} />
        ))}
    </details>
  );
}

/** 개별 거래 한 줄. 같은 거래처라도 건마다 계정이 갈릴 수 있어 낱개로 고를 수 있어야 한다. */
function TxRow({
  tx,
  update,
  picked,
  toggle,
}: {
  tx: Transaction;
  update: Update;
  picked: Set<string>;
  toggle: (ids: string[]) => void;
}) {
  const on = picked.has(tx.id);
  const [memo, setMemo] = useState(false);
  return (
    <>
      <div
        className="row lv4"
        style={{
          gridTemplateColumns: "auto 1fr auto auto",
          ...(on ? { background: "var(--primary-soft)", borderRadius: ".7rem" } : {}),
        }}
      >
        <input type="checkbox" className="pickbox" checked={on} onChange={() => toggle([tx.id])} />
        <span className="nm" style={{ minWidth: 0 }}>
          <span style={{ color: "var(--muted)", fontVariantNumeric: "tabular-nums", flex: "0 0 auto" }}>
            {tx.date ?? "날짜 없음"}
          </span>
          <span className="compose" style={{ color: "var(--ink-2)" }}>{tx.merchant}</span>
          {tx.tags?.slice(1).map((g) => (
            <span className="badge" key={g}>{g}</span>
          ))}
          {tx.note && <span className="badge">메모</span>}
        </span>
        <span className="amt num">{won(tx.amount)}</span>
        <span style={{ display: "flex", gap: 5 }}>
          <button className="tool" onClick={() => setMemo((v) => !v)}>메모</button>
          <button className="tool" onClick={() => update((s) => removeTx(s, tx.id))}>삭제</button>
        </span>
      </div>
      {(memo || tx.note) && (
        <div className="memo m4">
          <span className="mi">메모</span>
          <input
            defaultValue={tx.note ?? ""}
            placeholder="앱 주문내역과 맞춰보고 남길 말"
            aria-label="건 메모"
            onBlur={(e) => update((s) => patchTx(s, tx.id, { note: e.target.value || null }))}
          />
        </div>
      )}
    </>
  );
}

/** 접힌 묶음. 접혀 있다고 분류를 못 하면 안 되므로 펼칠 수 있다. */
function FoldRow({
  node,
  level,
  state,
  update,
  picked,
  toggle,
  allSubs,
  account,
}: {
  node: FoldNode;
  level: 2 | 3;
  state: MonthState;
  update: Update;
  picked: Set<string>;
  toggle: (ids: string[]) => void;
  allSubs: string[];
  account: string;
}) {
  const ids = node.txs.map((t) => t.id);
  const on = ids.length > 0 && ids.every((i) => picked.has(i));
  return (
    <details className="node" style={{ borderBottom: 0 }}>
      <summary>
        <div className={`row lv${level} foldrow`}>
          <span className="nm" style={{ color: "var(--muted)" }}>
            <span className="chev">▸</span>
            <input
              type="checkbox"
              className="pickbox"
              checked={on}
              onChange={() => toggle(ids)}
              onClick={(e) => e.stopPropagation()}
            />
            {node.label}
          </span>
          <span className="amt num" style={{ color: "var(--muted)" }}>{won(node.amount)}</span>
          <span className="cnt">{node.count}건</span>
          <span className="pc" />
        </div>
      </summary>
      {node.children.map((c) =>
        c.kind === "sub" ? (
          <SubRow
            key={c.sub}
            account={account}
            node={c}
            state={state}
            update={update}
            picked={picked}
            toggle={toggle}
            allSubs={allSubs}
          />
        ) : (
          <LeafRow key={c.key} node={c} update={update} picked={picked} toggle={toggle} />
        )
      )}
    </details>
  );
}
