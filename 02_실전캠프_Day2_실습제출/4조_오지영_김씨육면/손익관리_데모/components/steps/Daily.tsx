"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UNCLASSIFIED, usedSubsByAccount } from "@/lib/accounts";
import { isConfirmed, isPending, isUnclassified } from "@/lib/confirm";
import { won } from "@/lib/csv";
import { isInstallment, lastMonthOf, perMonthOf } from "@/lib/installment";
import { buildDaily, WEEKDAYS, type DayNode } from "@/lib/daily";
import {
  applyAccount,
  confirmMany,
  confirmMerchant,
  patchTx,
  removeTx,
  unconfirmTx,
  type MonthState,
} from "@/lib/store";
import type { Transaction } from "@/lib/types";
import { AccountSelect, PickAll, SubSelect } from "../ui";
import { aliasesOf, forgetAlias, rememberAlias, rememberRules } from "@/lib/learned";
import { updateLearned, useLearned } from "@/lib/useLearned";
import { contentOf, displayOf, type Alias } from "@/lib/alias";

type Update = (fn: (s: MonthState) => MonthState) => void;
type DayFilter = "all" | "pending";
/** 분류하면서 좁혀 보는 기준 — 아직 손 안 댄 것만 추려 본다 */
type Narrow = "all" | "unclassified" | "pending";

/** 가맹점·메모·카드 어디든 걸리면 찾는다. 검색은 원문 그대로 본다. */
const hit = (t: Transaction, q: string, aliases: Alias[] = []) => {
  const k = q.trim().toLowerCase();
  if (!k) return true;
  // 원문과 보이는 이름 둘 다로 걸린다 — 눈에 보이는 이름으로 찾는 게 자연스럽다
  return [t.merchant, displayOf(t.merchant, aliases), t.product ?? "", t.note ?? "", t.sub ?? "", t.account, ...(t.tags ?? [])]
    .join(" ")
    .toLowerCase()
    .includes(k);
};

/** 칸 제목. 줄과 같은 격자를 쓰므로 세로줄이 그대로 맞는다 */
function TxHead() {
  return (
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
      <span />
      <span />
    </div>
  );
}

/**
 * 1일부터 말일까지 훑으면서 손으로 분류하는 화면.
 *
 * 분류 체계가 아직 안 잡혔으니 앱이 붙인 것은 '제안'일 뿐이다.
 * 사장님이 한 건씩 보고 확정해야 숫자로 인정된다.
 */
export function DailyStep({
  state,
  update,
  refreshKey,
}: {
  state: MonthState;
  update: Update;
  /** 새로고침을 누르면 추려 둔 목록을 지금 자료로 다시 고른다 */
  refreshKey?: number;
}) {
  const [filter, setFilter] = useState<DayFilter>("all");
  const [openDays, setOpenDays] = useState<Set<string> | null>(null);
  const [q, setQ] = useState("");
  const [narrow, setNarrow] = useState<Narrow>("all");
  /** 좁혀 보기 — 빈 문자열이면 전부 */
  const [acct, setAcct] = useState<string | null>(null);
  const [sub, setSub] = useState("");
  const [day, setDay] = useState("");
  const learned = useLearned();
  const aliases = aliasesOf(learned);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // 검색하거나 좁혀 보면 날짜 묶음을 걷어내고 걸린 것만 한 줄로 쭉 보여준다 —
  // 한꺼번에 고르기 위해서다. 검색어 없이 "미분류만"도 쓸 수 있어야 한다.
  const searching = q.trim().length > 0;
  const listing = searching || narrow !== "all" || acct !== null || sub !== "" || day !== "";

  const matched = useMemo(
    () =>
      state.transactions
        .filter((t) => hit(t, q, aliases))
        // 1일부터 말일까지. 날짜별로 볼 때와 순서가 같아야 헷갈리지 않는다
        .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || b.amount - a.amount),
    [state.transactions, q, aliases]
  );

  const narrowOf = (t: Transaction, n: Narrow) =>
    n === "unclassified" ? isUnclassified(t) : n === "pending" ? isPending(t) : true;

  /**
   * 추려 본 목록은 분류하는 동안 발밑에서 움직이면 안 된다.
   * '미분류만'을 보다가 계정을 고르면 그 줄이 바로 빠져나가 소분류를 넣을 틈이 없다.
   * 그래서 추린 순간의 목록을 붙잡아 두고, 기준을 다시 누를 때만 새로 고른다.
   */
  const [frozen, setFrozen] = useState<Set<string> | null>(null);

  /** 지금 기준에 맞는 것 — 붙잡아 둘 목록을 새로 고를 때 쓴다 */
  const fits = (list: Transaction[]) =>
    list
      .filter((t) => narrowOf(t, narrow))
      .filter((t) => !acct || t.account === acct)
      .filter((t) => !sub || t.sub === sub)
      .filter((t) => !day || (t.date ?? "").slice(8) === day);

  // 기준을 바꿀 때만 목록을 새로 붙잡는다. 거래가 바뀐다고 다시 고르지 않는다.
  useEffect(() => {
    if (narrow === "all" && !acct && !sub && !day) {
      setFrozen(null);
      return;
    }
    setFrozen(new Set(fitsRef.current().map((t) => t.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, narrow, acct, sub, day, refreshKey]);

  // 효과 안에서 최신 거래를 보려면 참조로 들고 있어야 한다
  const fitsRef = useRef(() => fits(matched));
  fitsRef.current = () => fits(matched);

  const found = useMemo(
    () => (frozen ? matched.filter((t) => frozen.has(t.id)) : fits(matched)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matched, frozen, narrow, acct, sub, day]
  );

  /** 붙잡아 둔 뒤에 기준에서 벗어난 것 — 이미 처리한 줄이다 */
  const doneHere = frozen
    ? found.filter((t) => !fits([t]).length).length
    : 0;
  const countOf = (n: Narrow) => matched.filter((t) => narrowOf(t, n)).length;


  const toggle = (ids: string[]) =>
    setPicked((p) => {
      const n = new Set(p);
      for (const id of ids) {
        if (n.has(id)) n.delete(id);
        else n.add(id);
      }
      return n;
    });

  /** 전부 고르기 / 전부 풀기 — 뒤집기와 달리 이미 골라 둔 것이 풀리지 않는다 */
  const setPick = (ids: string[], on: boolean) =>
    setPicked((p) => {
      const n = new Set(p);
      for (const id of ids) {
        if (on) n.add(id);
        else n.delete(id);
      }
      return n;
    });

  const view = useMemo(
    () => buildDaily(state.month, state.transactions),
    [state.month, state.transactions]
  );

  const pending = state.transactions.filter(isPending);
  const pendingTotal = pending.reduce((s, t) => s + t.amount, 0);

  // 이 달에 실제로 쓰인 소분류 — 마스터에 없어도 다시 고를 수 있어야 한다.
  // 계정별로 가른다. 안 가르면 마케팅비 드롭다운에 투웰브·알바가 같이 뜬다.
  const usedSubs = useMemo(() => usedSubsByAccount(state.transactions), [state.transactions]);

  /** 필터에 쓸 목록 — 이 달에 실제로 있는 것만 */
  const usedAccounts = useMemo(
    () => [...new Set(state.transactions.map((t) => t.account))].sort(),
    [state.transactions]
  );
  const subChoices = useMemo(() => {
    const pool = acct ? state.transactions.filter((t) => t.account === acct) : state.transactions;
    return [...new Set(pool.map((t) => t.sub).filter((x): x is string => !!x))].sort();
  }, [state.transactions, acct]);

  const shown = filter === "pending" ? view.days.filter((d) => d.pendingCount > 0) : view.days;

  // 처음에는 거래가 있는 날만 펼쳐 둔다. 빈 날까지 펼치면 훑기가 힘들다.
  const isOpen = (d: DayNode) => (openDays ? openDays.has(d.date) : d.count > 0);
  const toggleDay = (date: string) =>
    setOpenDays((prev) => {
      const base = prev ?? new Set(view.days.filter((d) => d.count > 0).map((d) => d.date));
      const next = new Set(base);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  return (
    <div>
      <div className="dayhead">
        <div className="daystat">
          <span className="k">이 달 지출</span>
          <b className="num">{won(view.amount)}</b>
          <span className="c">{view.count}건</span>
        </div>
        {pending.length > 0 ? (
          <div className="daystat warn">
            <span className="k">확정 전</span>
            <b className="num">{won(pendingTotal)}</b>
            <span className="c">{pending.length}건 — 이만큼은 잠정입니다</span>
          </div>
        ) : (
          <div className="daystat ok">
            <span className="k">확정</span>
            <b>전부 확인했습니다</b>
          </div>
        )}
      </div>

      <div className="srchbar">
        <span>⌕</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="거래처·메모·계정 검색 — 예: 토스, 교보약대이자"
          aria-label="지출 검색"
        />
        {listing && (
          <>
            <span className="cnt">
              {found.length}건 · {won(found.reduce((a, b) => a + b.amount, 0))}
            </span>
            <PickAll ids={found.map((t) => t.id)} picked={picked} setPick={setPick} label="전체 선택" />
            <button
              className={`tool${doneHere > 0 ? " save" : ""}`}
              title="처리한 줄을 빼고 지금 자료로 목록을 다시 고릅니다"
              onClick={() => setFrozen(new Set(fits(matched).map((t) => t.id)))}
            >
              ↻ 새로고침{doneHere > 0 && <span className="n">{doneHere}</span>}
            </button>
            <button
              className="tool"
              onClick={() => { setQ(""); setNarrow("all"); setAcct(null); setSub(""); setDay(""); setPicked(new Set()); }}
            >
              지우기
            </button>
          </>
        )}
      </div>

      <div className="toolbar" style={{ marginTop: -4 }}>
        <button className="chip" aria-pressed={narrow === "all"} onClick={() => setNarrow("all")}>
          전부 {matched.length}건
        </button>
        <button
          className={`chip ${countOf("unclassified") ? "alert" : ""}`}
          aria-pressed={narrow === "unclassified"}
          onClick={() => setNarrow("unclassified")}
        >
          미분류만 {countOf("unclassified")}건
        </button>
        <button
          className={`chip ${countOf("pending") ? "alert" : ""}`}
          aria-pressed={narrow === "pending"}
          onClick={() => setNarrow("pending")}
        >
          미확정만 {countOf("pending")}건
        </button>
        <span style={{ flex: 1 }} />
        <span className="eyebrow" style={{ letterSpacing: ".06em" }}>필터</span>
        <select className="inp mini" value={day} onChange={(e) => setDay(e.target.value)} aria-label="날짜">
          <option value="">날짜 전체</option>
          {view.days.filter((d) => d.count > 0).map((d) => (
            <option key={d.date} value={d.date.slice(8)}>{d.day}일</option>
          ))}
        </select>
        <select
          className="inp mini"
          value={acct ?? ""}
          onChange={(e) => { setAcct(e.target.value || null); setSub(""); }}
          aria-label="대분류"
        >
          <option value="">대분류 전체</option>
          {usedAccounts.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select
          className="inp mini"
          value={sub}
          onChange={(e) => setSub(e.target.value)}
          aria-label="소분류"
          disabled={!subChoices.length}
        >
          <option value="">{subChoices.length ? "소분류 전체" : "소분류 없음"}</option>
          {subChoices.map((x) => (
            <option key={x} value={x}>{x}</option>
          ))}
        </select>
      </div>


      {picked.size > 0 && (
        <PickBar
          rows={state.transactions.filter((t) => picked.has(t.id))}
          update={update}
          clear={() => setPicked(new Set())}
          usedSubs={usedSubs}
        />
      )}

      {listing && doneHere > 0 && (
        <p className="note-line" style={{ marginBottom: 8 }}>
          분류하는 동안 목록이 움직이지 않게 붙잡아 두었습니다. 처리한 <b>{doneHere}건</b>은{" "}
          <b>↻ 새로고침</b>을 누르면 빠집니다.
        </p>
      )}

      {listing ? (
        <div className={found.length ? "txwrap" : ""}>
          {found.length === 0 && (
            <p className="hint">
              {narrow === "unclassified"
                ? "미분류가 없습니다. 다 분류하셨습니다."
                : narrow === "pending"
                  ? "미확정이 없습니다. 다 확정하셨습니다."
                  : "걸리는 게 없습니다."}
            </p>
          )}
          {found.length > 0 && <TxHead />}
          {found.map((t) => (
            <TxLine key={t.id} tx={t} update={update} usedSubs={usedSubs} state={state} picked={picked} toggle={toggle} />
          ))}
        </div>
      ) : (
      <>
      <div className="toolbar">
        <button className="chip" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
          1일 ~ 말일 전부
        </button>
        <button
          className={`chip ${pending.length ? "alert" : ""}`}
          aria-pressed={filter === "pending"}
          onClick={() => setFilter("pending")}
        >
          확정 전만 {pending.length ? `${pending.length}건` : ""}
        </button>
        <span style={{ flex: 1 }} />
        <button className="chip" onClick={() => setOpenDays(new Set(view.days.map((d) => d.date)))}>
          모두 펼치기
        </button>
        <button className="chip" onClick={() => setOpenDays(new Set())}>
          모두 접기
        </button>
      </div>

      {shown.length === 0 && <p className="hint">확정 전인 건이 없습니다.</p>}

      {shown.map((d) => (
        <DayBlock
          key={d.date}
          day={d}
          open={isOpen(d)}
          onToggle={() => toggleDay(d.date)}
          state={state}
          update={update}
          usedSubs={usedSubs}
          picked={picked}
          toggle={toggle}
          setPick={setPick}
        />
      ))}

      </>
      )}

      {!listing && view.undated.length > 0 && (
        <div className="dayblock">
          <div className="dayrow">
            <span className="dnum">날짜 없음</span>
            <span className="dwd" />
            <span className="amt num">{won(view.undated.reduce((s, t) => s + t.amount, 0))}</span>
            <span className="c">{view.undated.length}건</span>
          </div>
          <p className="hint" style={{ margin: "2px 0 8px 12px" }}>
            파일에 날짜가 없어 어느 날인지 모르는 건입니다. 버리지 않고 여기 남깁니다.
          </p>
          {view.undated.map((t) => (
            <TxLine key={t.id} tx={t} update={update} usedSubs={usedSubs} picked={picked} toggle={toggle} />
          ))}
        </div>
      )}
    </div>
  );
}

function DayBlock({
  day,
  open,
  onToggle,
  state,
  update,
  usedSubs,
  picked,
  toggle,
  setPick,
}: {
  day: DayNode;
  open: boolean;
  onToggle: () => void;
  state: MonthState;
  update: Update;
  usedSubs: Map<string, string[]>;
  picked: Set<string>;
  toggle: (ids: string[]) => void;
  setPick: (ids: string[], on: boolean) => void;
}) {
  const empty = day.count === 0;
  const weekend = day.weekday === 0 || day.weekday === 6;

  return (
    <div className={`dayblock ${empty ? "quiet" : ""}`}>
      <div className="dayrow" onClick={empty ? undefined : onToggle} role={empty ? undefined : "button"}>
        <span className={`dnum ${weekend ? "we" : ""}`}>{day.day}일</span>
        <span className={`dwd ${weekend ? "we" : ""}`}>{WEEKDAYS[day.weekday]}</span>
        {empty ? (
          <span className="none">지출 없음</span>
        ) : (
          <>
            <span className="amt num">{won(day.amount)}</span>
            <span className="c">{day.count}건</span>
            {day.pendingCount > 0 && <span className="badge warn">확정 전 {day.pendingCount}</span>}
            <span onClick={(e) => e.stopPropagation()}>
              <PickAll
                ids={day.cards.flatMap((c) => c.txs.map((t) => t.id))}
                picked={picked}
                setPick={setPick}
                label=""
              />
            </span>
            <span className="chev">{open ? "▾" : "▸"}</span>
          </>
        )}
      </div>

      {open &&
        day.cards.map((c) => {
          const ids = new Set(c.txs.filter(isPending).map((t) => t.id));
          return (
            <div className="cardgrp" key={c.card}>
              <div className="cardhead">
                <span className="cname">{c.card}</span>
                <span className="amt num">{won(c.amount)}</span>
                <span className="c">{c.txs.length}건</span>
                {ids.size > 0 && (
                  <>
                    <PickAll ids={c.txs.map((t) => t.id)} picked={picked} setPick={setPick} label="전체" />
                    <button className="tool save" onClick={() => update((s) => confirmMany(s, ids))}>
                      이 {c.txs.length}건 제안대로 확정
                    </button>
                  </>
                )}
              </div>
              {c.txs.length > 1 && <TxHead />}
              {c.txs.map((t) => (
                <TxLine key={t.id} tx={t} update={update} usedSubs={usedSubs} state={state} picked={picked} toggle={toggle} />
              ))}
            </div>
          );
        })}
    </div>
  );
}

function TxLine({
  tx,
  update,
  usedSubs,
  state,
  picked,
  toggle,
}: {
  tx: Transaction;
  update: Update;
  usedSubs: Map<string, string[]>;
  state?: MonthState;
  picked: Set<string>;
  toggle: (ids: string[]) => void;
}) {
  const confirmed = isConfirmed(tx);
  const unclassified = isUnclassified(tx);
  const learned = useLearned();
  const aliases = aliasesOf(learned);
  const { text: name, via } = contentOf(tx, aliases);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");

  // 이 가맹점이 이 달에 몇 건인지 — 한꺼번에 확정할 값어치가 있는지 보여준다
  const sameCount = state
    ? state.transactions.filter((t) => t.merchant.trim() === tx.merchant.trim()).length
    : 1;

  return (
    <>
      <div className={`txline ${confirmed ? "done" : unclassified ? "none" : "sug"}${picked.has(tx.id) ? " on" : ""}`}>
        <input
          type="checkbox"
          className="pickbox"
          checked={picked.has(tx.id)}
          onChange={() => toggle([tx.id])}
          aria-label={`${tx.merchant} 선택`}
        />
        <span className="mark">{confirmed ? "✓" : unclassified ? "?" : "·"}</span>
        <span className="dt num">{(tx.date ?? "").slice(5) || "—"}</span>
        <AccountSelect
          className="mini"
          value={tx.account}
          onChange={(v) => update((s) => patchTxAccount(s, tx.id, v, null))}
        />
        <SubSelect
          className="mini"
          account={tx.account}
          value={tx.sub}
          extra={usedSubs.get(tx.account) ?? []}
          onChange={(v) => update((s) => patchTxAccount(s, tx.id, tx.account, v))}
        />
        <span className="mn" title={`원문: ${tx.merchant}`}>
          {name}
          {via ? (
            <span className="badge small" title="결제 방식 — 실제 내용은 전표에서 왔습니다">{via}</span>
          ) : (
            name !== tx.merchant && <span className="badge small">별칭</span>
          )}
          {isInstallment(tx) && (
            <span className="badge inst" title={`${tx.date ?? ""} 승인 · ${lastMonthOf(tx)}까지`}>
              할부 {tx.split!.total}개월 · 월 {won(perMonthOf(tx))}
            </span>
          )}
          {tx.tags?.slice(1).map((g) => (
            <span className="badge" key={g}>{g}</span>
          ))}
        </span>
        <input
          className="memocell"
          defaultValue={tx.note ?? ""}
          placeholder="메모"
          aria-label={`${name} 메모`}
          onBlur={(e) => update((s) => patchTx(s, tx.id, { note: e.target.value || null }))}
        />
        <span className="amt num">{won(tx.amount)}</span>
        {confirmed ? (
          <button className="tool" onClick={() => update((s) => unconfirmTx(s, tx.id))}>
            되돌리기
          </button>
        ) : (
          <button
            className="tool save"
            disabled={unclassified}
            title={
              unclassified
                ? "먼저 계정을 골라 주세요"
                : sameCount > 1
                  ? `이 달 ${tx.merchant} ${sameCount}건을 한꺼번에 확정합니다`
                  : undefined
            }
            onClick={() => update((s) => confirmMerchant(s, tx.merchant))}
          >
            확정{sameCount > 1 && <span className="n">{sameCount}</span>}
          </button>
        )}
        <button
          className="tool"
          title="화면에 보일 이름을 정합니다. 원문은 그대로 남습니다"
          onClick={() => { setDraft(displayOf(tx.merchant, aliases)); setRenaming(true); }}
        >
          이름
        </button>
        <button className="tool" onClick={() => update((s) => removeTx(s, tx.id))}>삭제</button>
      </div>

      {renaming && (
        <div className="memo m4" style={{ borderLeftColor: "var(--info)" }}>
          <span className="mi">보일 이름</span>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="보일 이름"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const d = draft.trim();
                if (d) updateLearned((l) => rememberAlias(l, { match: tx.merchant, display: d }));
                setRenaming(false);
              }
              if (e.key === "Escape") setRenaming(false);
            }}
          />
          <button
            className="tool save"
            onClick={() => {
              const d = draft.trim();
              if (d) updateLearned((l) => rememberAlias(l, { match: tx.merchant, display: d }));
              setRenaming(false);
            }}
          >
            저장
          </button>
          {name !== tx.merchant && (
            <button
              className="tool"
              onClick={() => { updateLearned((l) => forgetAlias(l, tx.merchant)); setRenaming(false); }}
            >
              원문으로
            </button>
          )}
          <button className="tool" onClick={() => setRenaming(false)}>취소</button>
        </div>
      )}
    </>
  );
}

/** 계정을 손으로 고르면 그 순간 확정이다 — 사장님이 직접 본 것이니까 */
function patchTxAccount(s: MonthState, id: string, account: string, sub: string | null): MonthState {
  return {
    ...s,
    transactions: s.transactions.map((t) =>
      t.id === id
        ? account === UNCLASSIFIED
          ? { ...t, account, sub: null, group: "unclassified" as const, confirmed: false }
          : applyAccount(t, account, sub, { confirm: false })
        : t
    ),
  };
}

/**
 * 고른 것을 한꺼번에 처리하는 막대.
 *
 * '토스'처럼 같은 이름이라도 성격이 다른 것이 섞인다 —
 * 그래서 몇 건·얼마인지 띄워 두고, 적용 전에 한 번 더 보이게 한다.
 */
function PickBar({
  rows,
  update,
  clear,
  usedSubs,
}: {
  rows: Transaction[];
  update: Update;
  clear: () => void;
  usedSubs: Map<string, string[]>;
}) {
  const first = rows[0];
  const [account, setAccount] = useState(
    first && first.account !== UNCLASSIFIED ? first.account : "식자재비"
  );
  const [sub, setSub] = useState<string | null>(first?.sub ?? null);
  // 기본은 꺼 둔다. 분류 체계를 세우는 중이라 규칙이 저절로 쌓이면
  // 다음 달에 엉뚱한 게 붙어 있는 걸 뒤늦게 발견하게 된다.
  const [learn, setLearn] = useState(false);
  const total = rows.reduce((a, b) => a + b.amount, 0);
  const ids = new Set(rows.map((t) => t.id));

  function apply() {
    if (learn) {
      const keywords = [...new Set(rows.map((t) => t.merchant.trim()))].filter(Boolean);
      updateLearned((l) =>
        rememberRules(
          l,
          keywords.map((k) => ({ keyword: k, account, sub: sub ?? undefined, origin: "learned" as const }))
        )
      );
    }
    update((s) => ({
      ...s,
      transactions: s.transactions.map((t) => (ids.has(t.id) ? applyAccount(t, account, sub) : t)),
    }));
    clear();
  }

  return (
    <div className="okbox pickbar">
      <b style={{ whiteSpace: "nowrap" }}>
        {rows.length}건 · {won(total)}
      </b>
      <AccountSelect value={account} onChange={(v) => { setAccount(v); setSub(null); }} />
      <SubSelect account={account} value={sub} onChange={setSub} extra={usedSubs.get(account) ?? []} />
      <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700 }}>
        <input type="checkbox" className="pickbox" checked={learn} onChange={(e) => setLearn(e.target.checked)} />
        다음 달에도 기억
      </label>
      <button className="tool save" onClick={apply}>
        {rows.length}건 한꺼번에 확정
      </button>
      <button className="tool" onClick={clear}>선택 해제</button>
    </div>
  );
}

